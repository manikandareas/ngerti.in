use crate::{ClientError, ReadOnlyClient, contract::CONTRACT};
use futures_channel::oneshot;
use serde_json::Value;
use std::{
    collections::HashMap,
    future::Future,
    io::Read,
    pin::Pin,
    sync::{
        Arc, LazyLock,
        atomic::{AtomicBool, Ordering},
        mpsc::{SyncSender, sync_channel},
    },
    task::{Context, Poll},
    time::Duration,
};
use uuid::Uuid;

const LIMIT: u64 = 16 * 1024 * 1024;
type Validators = HashMap<(String, String, bool), jsonschema::Validator>;
static VALIDATORS: LazyLock<Result<Validators, ClientError>> = LazyLock::new(|| {
    let mut validators = HashMap::new();
    for route in CONTRACT["http"].as_array().expect("Pinned routes") {
        for (request, schema) in [
            (true, &route["request"]["body"]),
            (false, &route["response"]["schema"]),
        ] {
            if schema.is_object() {
                validators.insert(
                    (
                        route["method"].as_str().unwrap().into(),
                        route["path"].as_str().unwrap().into(),
                        request,
                    ),
                    jsonschema::validator_for(&native_schema(schema.clone()))
                        .map_err(|_| ClientError::ShapeMismatch)?,
                );
            }
        }
    }
    Ok(validators)
});

fn native_schema(mut schema: Value) -> Value {
    fn visit(value: &mut Value) {
        match value {
            Value::Object(fields) => {
                if let Some(Value::String(pattern)) = fields.get_mut("pattern") {
                    // ECMAScript's NUL escape has the same meaning as \x00,
                    // which the native regex validator accepts. The exported
                    // contract itself remains byte-for-byte unchanged.
                    *pattern = pattern.replace("\\0", "\\x00");
                }
                for child in fields.values_mut() {
                    visit(child);
                }
            }
            Value::Array(items) => items.iter_mut().for_each(visit),
            _ => {}
        }
    }
    visit(&mut schema);
    schema
}

#[derive(Clone)]
pub struct ApiClient {
    transport: ReadOnlyClient,
    retired: Option<Arc<AtomicBool>>,
}
impl ApiClient {
    /// A separate bounded wakeup stream. The ordered HTTP log/snapshot remains
    /// authoritative, so coalescing wakeups never advances a projection cursor.
    pub fn event_feed(
        &self,
        after: u64,
    ) -> std::io::Result<(EventFeed, futures_channel::mpsc::Receiver<()>)> {
        use std::sync::{Condvar, Mutex};
        let state = Arc::new((
            Mutex::new(FeedState {
                visible: true,
                stopped: false,
            }),
            Condvar::new(),
        ));
        let control = state.clone();
        let transport = self.transport.clone();
        let (mut sender, receiver) = futures_channel::mpsc::channel(1);
        std::thread::Builder::new()
            .name("ngertiin-events".into())
            .stack_size(16 * 1024 * 1024)
            .spawn(move || {
                let mut cursor = after;
                loop {
                    let (lock, wake) = &*state;
                    let mut current = lock.lock().unwrap();
                    while !current.visible && !current.stopped {
                        current = wake.wait(current).unwrap();
                    }
                    if current.stopped || sender.is_closed() {
                        break;
                    }
                    drop(current);
                    let response = transport
                        .client
                        .get(
                            transport
                                .origin
                                .join(&format!("/v1/events/stream?after={cursor}"))
                                .unwrap(),
                        )
                        .bearer_auth(&transport.bearer)
                        .timeout(Duration::from_secs(30))
                        .send();
                    if let Ok(mut response) = response
                        && response.status().is_success()
                    {
                        let mut decoder = crate::SseDecoder::default();
                        let mut bytes = [0; 8192];
                        loop {
                            let current = lock.lock().unwrap();
                            if current.stopped || !current.visible || sender.is_closed() {
                                break;
                            }
                            drop(current);
                            let Ok(count) = response.read(&mut bytes) else {
                                break;
                            };
                            if count == 0 {
                                break;
                            }
                            let Ok(events) = decoder.push(&bytes[..count]) else {
                                break;
                            };
                            if !events.is_empty() {
                                cursor = events
                                    .iter()
                                    .filter_map(|e| e["cursor"].as_u64())
                                    .max()
                                    .unwrap_or(cursor)
                                    .max(cursor);
                                let _ = sender.try_send(());
                            }
                        }
                    }
                    let current = lock.lock().unwrap();
                    if current.stopped || sender.is_closed() {
                        break;
                    }
                    drop(wake.wait_timeout(current, Duration::from_millis(500)));
                }
            })?;
        Ok((EventFeed { control }, receiver))
    }
    pub fn new(origin: &str, bearer: String) -> Result<Self, ClientError> {
        Ok(Self {
            transport: ReadOnlyClient::new(origin, bearer)?,
            retired: None,
        })
    }
    pub fn origin(&self) -> &str {
        self.transport.origin.as_str()
    }
    pub fn check(&self) -> Result<(), ClientError> {
        let remote = self.get("/v1/contracts")?;
        if remote["version"] != crate::CONTRACT_VERSION {
            return Err(ClientError::VersionMismatch);
        }
        for part in ["entities", "event", "projections", "http"] {
            if remote[part] != CONTRACT[part] {
                return Err(ClientError::ShapeMismatch);
            }
        }
        Ok(())
    }
    pub fn get(&self, path: &str) -> Result<Value, ClientError> {
        self.request(path, None, None)
    }
    pub fn post(&self, path: &str, body: &Value, key: Option<Uuid>) -> Result<Value, ClientError> {
        self.request(path, Some(body), key)
    }
    fn request(
        &self,
        path: &str,
        body: Option<&Value>,
        key: Option<Uuid>,
    ) -> Result<Value, ClientError> {
        if self
            .retired
            .as_ref()
            .is_some_and(|flag| flag.load(Ordering::Acquire))
        {
            return Err(ClientError::Unavailable);
        }
        let method = if body.is_some() { "POST" } else { "GET" };
        // Only exported relative routes are eligible; never forward a credential to a redirect/URL.
        let route = CONTRACT["http"]
            .as_array()
            .unwrap()
            .iter()
            .find(|route| {
                let pattern = route["path"].as_str().unwrap_or("");
                let actual = path.split('?').next().unwrap_or("");
                route["method"] == method
                    && pattern.split('/').count() == actual.split('/').count()
                    && pattern
                        .split('/')
                        .zip(actual.split('/'))
                        .all(|(a, b)| a == b || a.starts_with(':') && !b.is_empty())
            })
            .ok_or(ClientError::InvalidConnection)?;
        let pattern = route["path"].as_str().unwrap().to_owned();
        if body.is_some() && (route["idempotency"] == "required_uuid") != key.is_some() {
            return Err(ClientError::ShapeMismatch);
        }
        if let Some(body) = body
            && let Some(schema) = VALIDATORS.as_ref().map_err(Clone::clone)?.get(&(
                method.into(),
                pattern.clone(),
                true,
            ))
            && !schema.is_valid(body)
        {
            return Err(ClientError::ShapeMismatch);
        }
        let url = self
            .transport
            .origin
            .join(path)
            .map_err(|_| ClientError::InvalidConnection)?;
        if url.origin() != self.transport.origin.origin() {
            return Err(ClientError::InvalidConnection);
        }
        let mut request = self
            .transport
            .client
            .request(
                if body.is_some() {
                    reqwest::Method::POST
                } else {
                    reqwest::Method::GET
                },
                url,
            )
            .bearer_auth(&self.transport.bearer)
            .timeout(Duration::from_secs(if body.is_some() { 30 } else { 15 }));
        if let Some(body) = body {
            request = request.json(body);
        }
        if let Some(key) = key {
            request = request.header("Idempotency-Key", key.to_string());
        }
        let response = request.send().map_err(|_| ClientError::Unavailable)?;
        let status = response.status().as_u16();
        if response.content_length().is_some_and(|n| n > LIMIT) {
            return Err(ClientError::TooLarge);
        }
        let mut bytes = Vec::new();
        response
            .take(LIMIT + 1)
            .read_to_end(&mut bytes)
            .map_err(|_| ClientError::Unavailable)?;
        if bytes.len() as u64 > LIMIT {
            return Err(ClientError::TooLarge);
        }
        let value: Value = serde_json::from_slice(&bytes).map_err(|_| ClientError::Malformed)?;
        if !(200..300).contains(&status) {
            if (400..500).contains(&status) {
                return Err(ClientError::Rejected { code: value["error"]["code"].as_str().unwrap_or("REJECTED").into(), message: value["error"]["message"].as_str().unwrap_or("The backend rejected this request. Refresh and review the current state.").chars().take(1000).collect() });
            }
            return Err(ClientError::Http(status));
        }
        if let Some(schema) =
            VALIDATORS
                .as_ref()
                .map_err(Clone::clone)?
                .get(&(method.into(), pattern, false))
            && !schema.is_valid(&value)
        {
            return Err(ClientError::ShapeMismatch);
        }
        Ok(value)
    }
}

struct FeedState {
    visible: bool,
    stopped: bool,
}
pub struct EventFeed {
    control: Arc<(std::sync::Mutex<FeedState>, std::sync::Condvar)>,
}
impl EventFeed {
    pub fn set_visible(&self, visible: bool) {
        let (state, wake) = &*self.control;
        state.lock().unwrap().visible = visible;
        wake.notify_all();
    }
}
impl Drop for EventFeed {
    fn drop(&mut self) {
        let (state, wake) = &*self.control;
        state.lock().unwrap().stopped = true;
        wake.notify_all();
    }
}

type Job = Box<dyn FnOnce(&ApiClient) + Send>;
pub struct ApiReply<T> {
    receiver: oneshot::Receiver<Result<T, ClientError>>,
    retired: Arc<AtomicBool>,
}
impl<T> Future for ApiReply<T> {
    type Output = Result<Result<T, ClientError>, oneshot::Canceled>;
    fn poll(mut self: Pin<&mut Self>, cx: &mut Context<'_>) -> Poll<Self::Output> {
        Pin::new(&mut self.receiver).poll(cx)
    }
}
impl<T> Drop for ApiReply<T> {
    fn drop(&mut self) {
        self.retired.store(true, Ordering::Release);
    }
}
/// Bounded native I/O executor. Dropped read receivers retire queued reads; writes
/// finish even when their view closes because their durable journal owns recovery.
pub struct ApiWorker {
    requests: SyncSender<Job>,
    client: Arc<ApiClient>,
}
impl ApiWorker {
    pub fn new(client: ApiClient) -> std::io::Result<Self> {
        let client = Arc::new(client);
        let worker_client = client.clone();
        let (requests, receiver) = sync_channel::<Job>(8);
        std::thread::Builder::new()
            .name("ngertiin-api".into())
            .stack_size(16 * 1024 * 1024)
            .spawn(move || {
                for job in receiver {
                    job(&worker_client);
                }
            })?;
        Ok(Self { requests, client })
    }
    pub fn origin(&self) -> &str {
        self.client.origin()
    }
    pub fn event_feed(
        &self,
        after: u64,
    ) -> std::io::Result<(EventFeed, futures_channel::mpsc::Receiver<()>)> {
        self.client.event_feed(after)
    }
    pub fn submit<T: Send + 'static>(
        &self,
        write: bool,
        operation: impl FnOnce(&ApiClient) -> Result<T, ClientError> + Send + 'static,
    ) -> Result<ApiReply<T>, ClientError> {
        let (reply, receiver) = oneshot::channel();
        let retired = Arc::new(AtomicBool::new(false));
        let cancellation = retired.clone();
        self.requests
            .try_send(Box::new(move |client| {
                if write || !reply.is_canceled() {
                    let mut client = client.clone();
                    if !write {
                        client.retired = Some(cancellation);
                    }
                    let _ = reply.send(operation(&client));
                }
            }))
            .map_err(|_| ClientError::Busy)?;
        Ok(ApiReply { receiver, retired })
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn every_exported_route_compiles_with_native_regex_semantics() {
        assert!(!VALIDATORS.as_ref().unwrap().is_empty());
        let schema =
            native_schema(serde_json::json!({"type":"string","pattern":"^[^\\r\\n\\0]+$"}));
        let validator = jsonschema::validator_for(&schema).unwrap();
        assert!(validator.is_valid(&serde_json::json!("original-key")));
        for invalid in ["bad\nkey", "bad\rkey", "bad\0key"] {
            assert!(!validator.is_valid(&serde_json::json!(invalid)));
        }
    }
}
