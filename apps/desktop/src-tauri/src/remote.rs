use crate::{
    credential_store::{CredentialStore, OsStore},
    native_auth::{Flow, Metadata},
    profile::{Profile, server_origin},
};
use anyhow::{Result, ensure};
use serde::Deserialize;
use serde_json::Value;
use std::{
    collections::HashMap,
    sync::{
        Arc,
        atomic::{AtomicU64, Ordering},
    },
    time::{Duration, Instant},
};
use tokio::{net::TcpListener, sync::Mutex};
use tokio_util::sync::CancellationToken;

#[cfg(test)]
#[path = "remote_tests.rs"]
mod tests;

struct Tokens {
    access: String,
    expires: Instant,
}
struct State {
    tokens: Option<Tokens>,
    restored: bool,
    renewal: Option<String>,
    streams: CancellationToken,
}
#[derive(Deserialize)]
struct TokenReply {
    access_token: String,
    refresh_token: String,
    token_type: String,
    expires_in: u64,
}

#[derive(Debug)]
pub struct SignInRequired;
impl std::fmt::Display for SignInRequired {
    fn fmt(&self, formatter: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        formatter.write_str("Sign in to continue.")
    }
}
impl std::error::Error for SignInRequired {}

pub struct Remote {
    pub origin: String,
    pub client: reqwest::Client,
    store: Arc<dyn CredentialStore>,
    state: Mutex<State>,
    login: Mutex<()>,
    flow: std::sync::Mutex<CancellationToken>,
    views: Mutex<HashMap<String, (String, bool, u64)>>,
    presentation: AtomicU64,
}
impl Remote {
    pub fn new(profile: &Profile) -> Result<Arc<Self>> {
        let origin = profile
            .server_origin
            .as_deref()
            .ok_or_else(|| anyhow::anyhow!("Select a remote server."))?;
        server_origin(origin)?;
        let mut builder = reqwest::Client::builder()
            .https_only(true)
            .no_proxy()
            .redirect(reqwest::redirect::Policy::none())
            .connect_timeout(Duration::from_secs(5));
        if let Some(path) = &profile.server_certificate {
            builder = builder
                .add_root_certificate(reqwest::Certificate::from_pem(&std::fs::read(path)?)?);
        }
        Ok(Self::with_store(
            origin.into(),
            builder.build()?,
            Arc::new(OsStore::new(&profile.manager_id, origin)),
        ))
    }
    pub(crate) fn with_store(
        origin: String,
        client: reqwest::Client,
        store: Arc<dyn CredentialStore>,
    ) -> Arc<Self> {
        Arc::new(Self {
            origin,
            client,
            store,
            state: Mutex::new(State {
                tokens: None,
                restored: false,
                renewal: None,
                streams: CancellationToken::new(),
            }),
            login: Mutex::new(()),
            flow: std::sync::Mutex::new(CancellationToken::new()),
            views: Mutex::new(HashMap::new()),
            presentation: AtomicU64::new(0),
        })
    }
    async fn store_read(&self) -> Result<Option<String>> {
        let store = self.store.clone();
        tokio::task::spawn_blocking(move || store.read()).await?
    }
    async fn store_write(&self, value: String) -> Result<()> {
        let store = self.store.clone();
        tokio::task::spawn_blocking(move || store.write(&value)).await?
    }
    async fn store_clear(&self) -> Result<()> {
        let store = self.store.clone();
        tokio::task::spawn_blocking(move || store.clear()).await?
    }
    pub async fn metadata(&self) -> Result<Metadata> {
        let reply = self
            .client
            .get(format!("{}/v1/auth/native", self.origin))
            .timeout(Duration::from_secs(10))
            .send()
            .await?;
        ensure!(
            reply.status().is_success(),
            "The remote authentication server is unavailable."
        );
        let value: Metadata = reply.json().await?;
        value.validate(&self.origin)?;
        Ok(value)
    }
    async fn issue(&self, form: &[(String, String)]) -> Result<Option<TokenReply>> {
        let reply = self
            .client
            .post(format!("{}/api/auth/oauth2/token", self.origin))
            .timeout(Duration::from_secs(15))
            .form(form)
            .send()
            .await
            .map_err(|_| {
                anyhow::anyhow!("Could not reach the authentication server. Try again.")
            })?;
        if matches!(reply.status().as_u16(), 400 | 401 | 403) {
            return Ok(None);
        }
        ensure!(
            reply.status().is_success(),
            "The authentication server is unavailable."
        );
        let value: TokenReply = reply
            .json()
            .await
            .map_err(|_| anyhow::anyhow!("Invalid token response."))?;
        ensure!(
            value.token_type.eq_ignore_ascii_case("bearer")
                && value.access_token.starts_with("ng_at_")
                && value.refresh_token.starts_with("ng_rt_")
                && value.access_token.len() < 4096
                && value.refresh_token.len() < 4096
                && value.expires_in > 0
                && value.expires_in <= 300,
            "Invalid native token response."
        );
        Ok(Some(value))
    }
    async fn save(&self, state: &mut State, tokens: TokenReply) -> Result<String> {
        // Persist the rotated credential before publishing its access token. One lock owns renewal.
        self.store_write(tokens.refresh_token.clone()).await?;
        let access = tokens.access_token.clone();
        state.restored = true;
        state.renewal = Some(tokens.refresh_token);
        state.tokens = Some(Tokens {
            access: tokens.access_token,
            expires: Instant::now() + Duration::from_secs(tokens.expires_in),
        });
        Ok(access)
    }
    pub async fn authorization(&self) -> Result<String> {
        let mut state = self.state.lock().await;
        if let Some(tokens) = &state.tokens
            && tokens.expires > Instant::now() + Duration::from_secs(30)
        {
            return Ok(tokens.access.clone());
        }
        if !state.restored {
            state.renewal = self.store_read().await?;
            state.restored = true;
        }
        let Some(renewal) = &state.renewal else {
            return Err(SignInRequired.into());
        };
        let form = vec![
            ("grant_type".into(), "refresh_token".into()),
            ("client_id".into(), "ngertiin-tauri".into()),
            ("refresh_token".into(), renewal.clone()),
            ("resource".into(), self.origin.clone()),
        ];
        let Some(tokens) = self.issue(&form).await? else {
            state.tokens = None;
            state.renewal = None;
            state.streams.cancel();
            self.store_clear().await?;
            return Err(SignInRequired.into());
        };
        self.save(&mut state, tokens).await
    }
    pub async fn sign_in(&self) -> Result<()> {
        let _login = self
            .login
            .try_lock()
            .map_err(|_| anyhow::anyhow!("Sign in is already open in your browser."))?;
        let cancelled = CancellationToken::new();
        *self.flow.lock().unwrap_or_else(|e| e.into_inner()) = cancelled.clone();
        let result = async {
            let metadata = self.metadata().await?;
            let redirect = url::Url::parse(&metadata.redirect_uri)?;
            let listener = TcpListener::bind((std::net::Ipv4Addr::LOCALHOST, redirect.port().unwrap())).await
                .map_err(|_| anyhow::anyhow!("The login callback port is occupied. Close the other sign-in attempt and try again."))?;
            let mut flow = Flow::new(metadata)?;
            let authorize = flow.authorize();
            tokio::task::spawn_blocking(move || open::that(authorize)).await?
                .map_err(|_| anyhow::anyhow!("The system browser could not be opened."))?;
            let form = flow.listen(listener, cancelled.clone()).await?;
            let mut state = self.state.lock().await;
            ensure!(!cancelled.is_cancelled(), "Sign in was cancelled.");
            let tokens = self.issue(&form).await?.ok_or_else(|| anyhow::anyhow!("Sign in expired. Try again."))?;
            ensure!(!cancelled.is_cancelled(), "Sign in was cancelled.");
            state.streams.cancel(); state.streams = CancellationToken::new();
            self.save(&mut state, tokens).await?;
            Ok(())
        }.await;
        result.map_err(|_| {
            anyhow::anyhow!("Sign in could not finish. Return to Ngertiin and try again.")
        })
    }
    pub fn cancel_login(&self) {
        self.flow.lock().unwrap_or_else(|e| e.into_inner()).cancel();
    }
    pub async fn stream_guard(&self) -> CancellationToken {
        self.state.lock().await.streams.clone()
    }
    pub async fn invalidate(&self, access: &str) {
        let mut state = self.state.lock().await;
        if state
            .tokens
            .as_ref()
            .is_some_and(|tokens| tokens.access == access)
        {
            state.tokens = None;
            state.streams.cancel();
            state.streams = CancellationToken::new();
        }
    }
    pub fn presentation(&self) -> u64 {
        self.presentation.load(Ordering::Acquire)
    }
    pub async fn register_view(
        &self,
        value: &Value,
        organization: &str,
        presentation: u64,
        visible: bool,
    ) {
        if let Some(id) = value["viewer_id"].as_str()
            && id.len() == 64
            && id.bytes().all(|b| b.is_ascii_hexdigit())
        {
            let mut views = self.views.lock().await;
            let record = (
                organization.into(),
                value["interactive"].as_bool().unwrap_or(false),
                value["control_revision"].as_u64().unwrap_or(0),
            );
            if visible && presentation == self.presentation() && views.len() < 40 {
                views.insert(id.into(), record);
            } else {
                drop(views);
                self.release_records(HashMap::from([(id.into(), record)]))
                    .await;
            }
        }
    }
    pub async fn forget_view(&self, id: &str) {
        self.views.lock().await.remove(id);
    }
    pub async fn release_views(&self) {
        self.presentation.fetch_add(1, Ordering::AcqRel);
        let views = std::mem::take(&mut *self.views.lock().await);
        self.release_records(views).await;
    }
    async fn release_records(&self, views: HashMap<String, (String, bool, u64)>) {
        if views.is_empty() {
            return;
        }
        let Ok(access) = self.authorization().await else {
            return;
        };
        for (id, (organization, interactive, revision)) in views {
            let _ = self
                .client
                .delete(format!("{}/v1/machine/views/{id}", self.origin))
                .bearer_auth(&access)
                .header("X-Ngertiin-Organization", &organization)
                .timeout(Duration::from_secs(3))
                .send()
                .await;
            if interactive {
                let current = self
                    .client
                    .get(format!("{}/v1/machine", self.origin))
                    .bearer_auth(&access)
                    .header("X-Ngertiin-Organization", &organization)
                    .timeout(Duration::from_secs(3))
                    .send()
                    .await;
                if let Ok(reply) = current
                    && reply.status().is_success()
                    && let Ok(value) = reply.json::<Value>().await
                    && value["lease"]["holder"] == "human"
                    && value["lease"]["state"] == "active"
                    && value["lease"]["revision"].as_u64() == Some(revision)
                {
                    let _ = self.client.post(format!("{}/v1/machine/control", self.origin)).bearer_auth(&access)
                        .header("X-Ngertiin-Organization", &organization).timeout(Duration::from_secs(3))
                        .json(&serde_json::json!({"command_id":uuid::Uuid::new_v4(),"operation":"release","expected_revision":revision})).send().await;
                }
            }
        }
    }
    pub async fn logout(&self) -> Result<()> {
        self.cancel_login();
        self.release_views().await;
        let access = self.authorization().await.ok();
        let mut state = self.state.lock().await;
        state.streams.cancel();
        if let Some(access) = access {
            let reply = self
                .client
                .post(format!("{}/v1/auth/logout", self.origin))
                .bearer_auth(access)
                .timeout(Duration::from_secs(10))
                .json(&serde_json::json!({}))
                .send()
                .await?;
            ensure!(
                reply.status().is_success() || reply.status() == reqwest::StatusCode::UNAUTHORIZED,
                "Could not revoke this device. Reconnect and try again."
            );
        } else if state.renewal.is_some() {
            anyhow::bail!("Reconnect before signing out so this device can be revoked.");
        }
        state.tokens = None;
        state.renewal = None;
        state.restored = true;
        self.store_clear().await?;
        state.streams = CancellationToken::new();
        Ok(())
    }
    pub async fn close(&self) {
        self.cancel_login();
        // OS credential access can wait for user interaction. It must not hold
        // application exit hostage; server leases still expire independently.
        let _ = tokio::time::timeout(Duration::from_secs(5), self.release_views()).await;
        if let Ok(mut state) = self.state.try_lock() {
            state.streams.cancel();
            state.tokens = None;
        }
    }
}
