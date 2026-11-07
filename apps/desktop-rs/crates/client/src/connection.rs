use crate::{ClientError, Snapshot, check_contract, decode_snapshot};
use reqwest::{Url, blocking::Client, redirect::Policy};
use std::{io::Read, time::Duration};
use uuid::Uuid;

const RESPONSE_LIMIT: u64 = 16 * 1024 * 1024;

/// Credentials are native transport state, never part of a URL, WebView or Debug output.
pub struct ReadOnlyClient {
    client: Client,
    origin: Url,
    bearer: String,
}
impl ReadOnlyClient {
    pub fn new(origin: &str, bearer: String) -> Result<Self, ClientError> {
        let origin = Url::parse(origin).map_err(|_| ClientError::InvalidConnection)?;
        if origin.scheme() != "http"
            || !matches!(origin.host_str(), Some("127.0.0.1" | "[::1]"))
            || !origin.username().is_empty()
            || origin.password().is_some()
            || origin.path() != "/"
            || origin.query().is_some()
            || origin.fragment().is_some()
            || bearer.is_empty()
            || bearer.len() > 8192
            || bearer.chars().any(char::is_control)
        {
            return Err(ClientError::InvalidConnection);
        }
        let client = Client::builder()
            .no_proxy()
            .redirect(Policy::none())
            .timeout(Duration::from_secs(8))
            .build()
            .map_err(|_| ClientError::Unavailable)?;
        Ok(Self {
            client,
            origin,
            bearer,
        })
    }

    fn get(&self, path: &str) -> Result<Vec<u8>, ClientError> {
        let url = self
            .origin
            .join(path)
            .map_err(|_| ClientError::InvalidConnection)?;
        let response = self
            .client
            .get(url)
            .bearer_auth(&self.bearer)
            .send()
            .map_err(|_| ClientError::Unavailable)?;
        match response.status().as_u16() {
            200 => {}
            401 | 403 => return Err(ClientError::Unauthorized),
            status => return Err(ClientError::Http(status)),
        }
        if response
            .content_length()
            .is_some_and(|length| length > RESPONSE_LIMIT)
        {
            return Err(ClientError::TooLarge);
        }
        let mut bytes = Vec::new();
        response
            .take(RESPONSE_LIMIT + 1)
            .read_to_end(&mut bytes)
            .map_err(|_| ClientError::Unavailable)?;
        if bytes.len() as u64 > RESPONSE_LIMIT {
            return Err(ClientError::TooLarge);
        }
        Ok(bytes)
    }

    /// Exactly two GET requests; no event connection, inference, scheduler or native session.
    pub fn snapshot(&self, thread: Uuid) -> Result<Snapshot, ClientError> {
        check_contract(&self.get("v1/contracts")?)?;
        let snapshot = decode_snapshot(&self.get(&format!("v1/threads/{thread}/snapshot"))?)?;
        if snapshot.thread.id != thread {
            return Err(ClientError::WrongThread);
        }
        Ok(snapshot)
    }
}
