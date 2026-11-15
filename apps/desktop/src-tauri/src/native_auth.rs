use anyhow::{Result, ensure};
use base64::{Engine, engine::general_purpose::URL_SAFE_NO_PAD};
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::time::{Duration, Instant};
use tokio::{
    io::{AsyncReadExt, AsyncWriteExt},
    net::TcpListener,
};
use tokio_util::sync::CancellationToken;

#[derive(Clone, Deserialize, Serialize)]
pub struct Metadata {
    pub client_id: String,
    pub issuer: String,
    pub audience: String,
    pub authorization_endpoint: String,
    pub token_endpoint: String,
    pub redirect_uri: String,
}

impl Metadata {
    pub fn validate(&self, origin: &str) -> Result<()> {
        ensure!(
            self.client_id == "ngertiin-tauri"
                && self.audience == origin
                && self.issuer == format!("{origin}/api/auth")
                && self.authorization_endpoint == format!("{origin}/api/auth/oauth2/authorize")
                && self.token_endpoint == format!("{origin}/api/auth/oauth2/token"),
            "The authentication server identity is invalid."
        );
        let callback = url::Url::parse(&self.redirect_uri)?;
        ensure!(
            callback.scheme() == "http"
                && callback.host_str() == Some("127.0.0.1")
                && callback.port().is_some_and(|port| port >= 1024)
                && callback.path() == "/callback"
                && callback.query().is_none()
                && callback.fragment().is_none()
                && callback.username().is_empty()
                && callback.password().is_none(),
            "The native callback is invalid."
        );
        Ok(())
    }
}

pub struct Flow {
    metadata: Metadata,
    state: String,
    verifier: String,
    deadline: Instant,
    consumed: bool,
}
fn random() -> Result<String> {
    let mut bytes = [0u8; 32];
    getrandom::fill(&mut bytes)
        .map_err(|_| anyhow::anyhow!("The native random source is unavailable."))?;
    Ok(URL_SAFE_NO_PAD.encode(bytes))
}
impl Flow {
    pub fn new(metadata: Metadata) -> Result<Self> {
        Ok(Self {
            metadata,
            state: random()?,
            verifier: random()?,
            deadline: Instant::now() + Duration::from_secs(300),
            consumed: false,
        })
    }
    pub fn authorize(&self) -> String {
        let mut url =
            url::Url::parse(&self.metadata.authorization_endpoint).expect("Validated metadata");
        url.query_pairs_mut().extend_pairs([
            ("client_id", "ngertiin-tauri"),
            ("response_type", "code"),
            ("redirect_uri", &self.metadata.redirect_uri),
            ("scope", "ngertiin offline_access"),
            ("state", &self.state),
            (
                "code_challenge",
                &URL_SAFE_NO_PAD.encode(Sha256::digest(self.verifier.as_bytes())),
            ),
            ("code_challenge_method", "S256"),
            ("resource", &self.metadata.audience),
        ]);
        url.into()
    }
    pub fn exchange(&mut self, callback: &str) -> Result<Vec<(String, String)>> {
        let url = url::Url::parse(callback)?;
        let expected = url::Url::parse(&self.metadata.redirect_uri)?;
        let pairs: Vec<_> = url.query_pairs().collect();
        let one = |key: &str| -> Option<String> {
            let values: Vec<_> = pairs.iter().filter(|(name, _)| name == key).collect();
            (values.len() == 1).then(|| values[0].1.to_string())
        };
        let state = one("state").unwrap_or_default();
        let equal = state.len() == self.state.len()
            && state
                .bytes()
                .zip(self.state.bytes())
                .fold(0, |diff, (a, b)| diff | (a ^ b))
                == 0;
        let code = one("code").unwrap_or_default();
        ensure!(
            !self.consumed
                && Instant::now() < self.deadline
                && url.origin() == expected.origin()
                && url.path() == expected.path()
                && url.username().is_empty()
                && url.password().is_none()
                && url.fragment().is_none()
                && equal
                && one("iss").as_deref() == Some(&self.metadata.issuer)
                && !code.is_empty()
                && code.len() <= 4096
                && !pairs.iter().any(|(name, _)| name == "error"),
            "Invalid or expired native callback."
        );
        self.consumed = true;
        Ok(vec![
            ("client_id".into(), "ngertiin-tauri".into()),
            ("grant_type".into(), "authorization_code".into()),
            ("code".into(), code),
            ("redirect_uri".into(), self.metadata.redirect_uri.clone()),
            ("code_verifier".into(), self.verifier.clone()),
            ("resource".into(), self.metadata.audience.clone()),
        ])
    }
    pub async fn listen(
        &mut self,
        listener: TcpListener,
        cancelled: CancellationToken,
    ) -> Result<Vec<(String, String)>> {
        let expected = url::Url::parse(&self.metadata.redirect_uri)?;
        let host = format!("127.0.0.1:{}", expected.port().unwrap());
        let deadline = tokio::time::Instant::from_std(self.deadline);
        loop {
            let accepted = tokio::select! {
                _ = cancelled.cancelled() => anyhow::bail!("Native login was cancelled."),
                result = tokio::time::timeout_at(deadline, listener.accept()) => result??,
            };
            let (mut socket, _) = accepted;
            let mut bytes = vec![0; 8192];
            let received = tokio::time::timeout(Duration::from_secs(2), async {
                let mut length = 0;
                while length < bytes.len() {
                    let n = socket.read(&mut bytes[length..]).await?;
                    if n == 0 {
                        break;
                    }
                    length += n;
                    if bytes[..length].windows(4).any(|w| w == b"\r\n\r\n") {
                        break;
                    }
                }
                Ok::<_, std::io::Error>(length)
            })
            .await;
            let Ok(Ok(length)) = received else { continue };
            let text = String::from_utf8_lossy(&bytes[..length]);
            let lines: Vec<_> = text.split("\r\n").collect();
            let request: Vec<_> = lines[0].split(' ').collect();
            let hosts: Vec<_> = lines
                .iter()
                .skip(1)
                .filter_map(|line| line.split_once(':'))
                .filter(|(name, _)| name.eq_ignore_ascii_case("host"))
                .collect();
            let form = if request.len() == 3
                && request[0] == "GET"
                && request[1].starts_with("/callback?")
                && hosts.len() == 1
                && hosts[0].1.trim() == host
            {
                self.exchange(&format!("http://{host}{}", request[1])).ok()
            } else {
                None
            };
            let (status, message) = if form.is_some() {
                ("200 OK", "You can return to Ngertiin.")
            } else {
                (
                    "400 Bad Request",
                    "Invalid callback. Start sign in again in Ngertiin.",
                )
            };
            let response = format!(
                "HTTP/1.1 {status}\r\nContent-Type: text/plain\r\nCache-Control: no-store\r\nReferrer-Policy: no-referrer\r\nConnection: close\r\nContent-Length: {}\r\n\r\n{message}",
                message.len()
            );
            let _ = tokio::time::timeout(
                Duration::from_secs(1),
                socket.write_all(response.as_bytes()),
            )
            .await;
            if let Some(form) = form {
                return Ok(form);
            }
        }
    }
}

#[cfg(test)]
#[path = "native_auth_tests.rs"]
mod tests;
