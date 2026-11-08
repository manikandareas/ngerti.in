//! Native ticket ownership survives a suspended or destroyed embedded surface.
use ngertiin_client::{ApiClient, ClientError};
use serde_json::{Value, json};
use std::sync::{
    Arc, Mutex, OnceLock, Weak,
    atomic::{AtomicBool, AtomicU64, AtomicUsize, Ordering},
};
static REGISTRIES: OnceLock<Mutex<Vec<Weak<Views>>>> = OnceLock::new();
static VISIBLE: AtomicBool = AtomicBool::new(true);
pub(crate) struct Views {
    api: ApiClient,
    epoch: AtomicU64,
    recovered: AtomicBool,
    cleaning: AtomicUsize,
    state: Mutex<State>,
}
#[derive(Default)]
struct State {
    tickets: Vec<String>,
    revision: Option<u64>,
}
impl Views {
    pub fn new(api: ApiClient) -> Arc<Self> {
        let this = Arc::new(Self {
            api,
            epoch: AtomicU64::new(0),
            recovered: AtomicBool::new(false),
            cleaning: AtomicUsize::new(0),
            state: Mutex::new(State::default()),
        });
        REGISTRIES
            .get_or_init(Default::default)
            .lock()
            .unwrap()
            .push(Arc::downgrade(&this));
        this
    }
    pub fn epoch(&self) -> u64 {
        self.epoch.load(Ordering::Acquire)
    }
    pub fn issue(
        &self,
        interactive: bool,
        revision: u64,
        epoch: u64,
    ) -> Result<Value, ClientError> {
        if !VISIBLE.load(Ordering::Acquire) || self.epoch() != epoch {
            return Err(ClientError::Unavailable);
        }
        if !self.recovered.swap(true, Ordering::AcqRel) {
            self.recover_pending()?;
        }
        let view = self.api.post(
            "/v1/machine/view",
            &json!({"interactive":interactive}),
            None,
        )?;
        let id = view["viewer_id"]
            .as_str()
            .ok_or(ClientError::ShapeMismatch)?
            .to_string();
        let mut state = self.state.lock().unwrap();
        if !VISIBLE.load(Ordering::Acquire)
            || self.epoch() != epoch
            || interactive && view["control_revision"].as_u64() != Some(revision)
        {
            drop(state);
            let _ = self.api.delete(&format!("/v1/machine/views/{id}"));
            return Err(ClientError::Unavailable);
        }
        state.tickets.push(id);
        if interactive {
            state.revision = Some(revision);
        }
        Ok(view)
    }
    pub fn control(
        &self,
        operation: &str,
        revision: u64,
        epoch: u64,
    ) -> Result<Value, ClientError> {
        if !VISIBLE.load(Ordering::Acquire) || self.epoch() != epoch {
            return Err(ClientError::Unavailable);
        }
        let command = uuid::Uuid::new_v4();
        let before = self.api.get("/v1/machine")?;
        let pending = serde_json::json!({"machine_id":before["id"],"command_id":command,"operation":operation});
        if let Ok(home) = super::profile_root() {
            super::profile::write_private(&home.join("computer-control.json"), &pending)
                .map_err(|_| ClientError::Unavailable)?;
        }
        let result = match self.api.post(
            "/v1/machine/control",
            &json!({"command_id":command,"operation":operation,"expected_revision":revision}),
            None,
        ) {
            Ok(result) => result,
            Err(error) => {
                let _ = self.recover_pending();
                return Err(error);
            }
        };
        self.clear_pending();
        // Learn the lease from the authoritative response even if hide races the response.
        if operation == "acquire" && result["lease"]["holder"] == "human" {
            // The operation receipt contains the exact granted lease revision.
            let granted = result["lease"]["revision"]
                .as_u64()
                .or(result["revision"].as_u64());
            if let Some(granted) = granted {
                self.state.lock().unwrap().revision = Some(granted);
            }
        }
        if self.epoch() != epoch || !VISIBLE.load(Ordering::Acquire) {
            self.release_sync();
        }
        self.api.get("/v1/machine")
    }
    fn clear_pending(&self) {
        if let Ok(home) = super::profile_root() {
            let _ = std::fs::remove_file(home.join("computer-control.json"));
        }
    }
    fn recover_pending(&self) -> Result<(), ClientError> {
        let Ok(home) = super::profile_root() else {
            return Ok(());
        };
        let path = home.join("computer-control.json");
        if !path.exists() {
            return Ok(());
        }
        let pending: Value =
            super::profile::private_json(&path).map_err(|_| ClientError::Unavailable)?;
        let machine = self.api.get("/v1/machine")?;
        if pending["machine_id"] != machine["id"] {
            return Err(ClientError::Unavailable);
        }
        let operations = self.api.get("/v1/machine/operations")?;
        if let Some(receipt) = operations["operations"]
            .as_array()
            .and_then(|items| items.iter().find(|r| r["id"] == pending["command_id"]))
        {
            if receipt["state"] == "succeeded" {
                if pending["operation"] == "acquire"
                    && let Some(revision) = receipt["result"]["lease"]["revision"].as_u64()
                {
                    self.release(State {
                        tickets: vec![],
                        revision: Some(revision),
                    });
                }
                self.clear_pending();
            } else if receipt["state"] == "failed" {
                self.clear_pending();
            }
        }
        Ok(())
    }
    pub fn renew(&self, id: &str) -> Result<Value, ClientError> {
        self.api
            .post(&format!("/v1/machine/views/{id}/renew"), &json!({}), None)
    }
    pub fn retire(self: &Arc<Self>) {
        self.epoch.fetch_add(1, Ordering::AcqRel);
        let state = std::mem::take(&mut *self.state.lock().unwrap());
        if state.tickets.is_empty() && state.revision.is_none() {
            return;
        }
        self.cleaning.fetch_add(1, Ordering::AcqRel);
        let this = self.clone();
        std::thread::spawn(move || {
            this.release(state);
            this.cleaning.fetch_sub(1, Ordering::AcqRel);
        });
    }
    pub fn revoke(&self, id: &str) {
        let _ = self.api.delete(&format!("/v1/machine/views/{id}"));
        self.state
            .lock()
            .unwrap()
            .tickets
            .retain(|ticket| ticket != id);
    }
    fn release_sync(&self) {
        let state = std::mem::take(&mut *self.state.lock().unwrap());
        self.release(state);
    }
    fn release(&self, state: State) {
        for id in state.tickets {
            let _ = self.api.delete(&format!("/v1/machine/views/{id}"));
        }
        if let Some(revision) = state.revision
            && let Ok(machine) = self.api.get("/v1/machine")
        {
            let lease = &machine["lease"];
            if lease["holder"] == "human"
                && lease["state"] == "active"
                && lease["revision"].as_u64() == Some(revision)
            {
                let _=self.api.post("/v1/machine/control",&json!({"command_id":uuid::Uuid::new_v4(),"operation":"release","expected_revision":revision}),None);
            }
        }
    }
}
pub(crate) fn visibility(visible: bool) {
    let changed = VISIBLE.swap(visible, Ordering::AcqRel) != visible;
    if changed && !visible {
        for view in registries() {
            view.retire();
        }
    }
}
pub(crate) fn cleanup() {
    VISIBLE.store(false, Ordering::Release);
    for view in registries() {
        view.epoch.fetch_add(1, Ordering::AcqRel);
        view.release_sync();
        let deadline = std::time::Instant::now() + std::time::Duration::from_secs(10);
        while view.cleaning.load(Ordering::Acquire) > 0 && std::time::Instant::now() < deadline {
            std::thread::sleep(std::time::Duration::from_millis(25));
        }
    }
}
fn registries() -> Vec<Arc<Views>> {
    let mut views = REGISTRIES.get_or_init(Default::default).lock().unwrap();
    let result = views.iter().filter_map(Weak::upgrade).collect();
    views.retain(|view| view.strong_count() > 0);
    result
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::{
        io::{Read, Write},
        net::TcpListener,
        thread,
    };
    fn machine(revision: u64) -> Value {
        let id = "751879c0-deb8-463a-8377-12d222314016";
        json!({"id":id,"owner_id":id,"revision":1,"created_at":"2026-11-08T00:00:00Z","updated_at":"2026-11-08T00:00:00Z","kind":"machine","machine_key":id,"generation":1,"state":"ready","root":"/home/cua/workspace","service_version":"0.8.0","driver_version":"1","features":[],"lease":{"holder":"human","agent_id":null,"run_id":null,"revision":revision,"state":"active","expires_at":"2027-01-01T00:00:00Z"}})
    }
    fn server(
        responses: Vec<Value>,
    ) -> (ApiClient, Arc<Mutex<Vec<String>>>, thread::JoinHandle<()>) {
        let listener = TcpListener::bind("127.0.0.1:0").unwrap();
        let origin = format!("http://{}", listener.local_addr().unwrap());
        let requests = Arc::new(Mutex::new(vec![]));
        let captured = requests.clone();
        let handle = thread::spawn(move || {
            for response in responses {
                let (mut stream, _) = listener.accept().unwrap();
                let mut request = vec![];
                let mut byte = [0];
                while !request.ends_with(b"\r\n\r\n") {
                    stream.read_exact(&mut byte).unwrap();
                    request.push(byte[0]);
                }
                let headers = String::from_utf8(request).unwrap();
                let count = headers
                    .lines()
                    .find_map(|l| {
                        l.to_lowercase()
                            .strip_prefix("content-length: ")
                            .and_then(|v| v.parse::<usize>().ok())
                    })
                    .unwrap_or(0);
                let mut body = vec![0; count];
                stream.read_exact(&mut body).unwrap();
                captured
                    .lock()
                    .unwrap()
                    .push(format!("{headers}{}", String::from_utf8_lossy(&body)));
                let body = response.to_string();
                write!(stream,"HTTP/1.1 200 OK\r\nContent-Type: application/json\r\nConnection: close\r\nContent-Length: {}\r\n\r\n{}",body.len(),body).unwrap();
            }
        });
        (
            ApiClient::new(&origin, "native-test-token".into()).unwrap(),
            requests,
            handle,
        )
    }
    fn large_stack(test: impl FnOnce() + Send + 'static) {
        thread::Builder::new()
            .stack_size(16 * 1024 * 1024)
            .spawn(test)
            .unwrap()
            .join()
            .unwrap();
    }
    #[test]
    fn cleanup_releases_only_the_exact_issued_human_revision() {
        large_stack(|| {
            let (api, requests, server) =
                server(vec![json!({"revoked":true}), machine(7), machine(8)]);
            let registry = Views::new(api);
            registry.release(State {
                tickets: vec!["a".repeat(64)],
                revision: Some(7),
            });
            server.join().unwrap();
            let requests = requests.lock().unwrap();
            assert!(requests[0].starts_with("DELETE /v1/machine/views/"));
            assert!(requests[2].starts_with("POST /v1/machine/control "));
            let body: Value =
                serde_json::from_str(requests[2].split("\r\n\r\n").nth(1).unwrap()).unwrap();
            assert_eq!(body["expected_revision"], 7);
            assert_eq!(body["operation"], "release");
        });
    }
    #[test]
    fn cleanup_preserves_a_newer_human_lease() {
        large_stack(|| {
            let (api, requests, server) = server(vec![machine(9)]);
            Views::new(api).release(State {
                tickets: vec![],
                revision: Some(7),
            });
            server.join().unwrap();
            assert_eq!(requests.lock().unwrap().len(), 1);
        });
    }
}
