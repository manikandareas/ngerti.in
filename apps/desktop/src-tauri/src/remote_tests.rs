use super::*;
use crate::{
    desktop_session::DesktopSession,
    gateway,
    log::Log,
    profile::{RuntimePaths, prepare_home},
};
use axum::{
    Router,
    extract::State,
    http::StatusCode,
    response::{IntoResponse, Response},
    routing::any,
};
use serde_json::json;
use std::sync::{
    Mutex as SyncMutex,
    atomic::{AtomicBool, AtomicUsize, Ordering},
};

#[derive(Default)]
struct MemoryStore(SyncMutex<Option<String>>);
impl CredentialStore for MemoryStore {
    fn read(&self) -> Result<Option<String>> {
        Ok(self.0.lock().unwrap().clone())
    }
    fn write(&self, value: &str) -> Result<()> {
        *self.0.lock().unwrap() = Some(value.into());
        Ok(())
    }
    fn clear(&self) -> Result<()> {
        self.0.lock().unwrap().take();
        Ok(())
    }
}
struct Server {
    renewals: AtomicUsize,
    logouts: AtomicUsize,
    reject_renewal: AtomicBool,
    view_deletes: AtomicUsize,
}
async fn endpoint(
    State(state): State<Arc<Server>>,
    request: axum::http::Request<axum::body::Body>,
) -> Response {
    if request.method() == axum::http::Method::DELETE
        && request.uri().path().starts_with("/v1/machine/views/")
    {
        state.view_deletes.fetch_add(1, Ordering::SeqCst);
    }
    match request.uri().path() {
        "/api/auth/oauth2/token" => {
            if state.reject_renewal.load(Ordering::SeqCst) { return (StatusCode::BAD_REQUEST, axum::Json(json!({"error":"invalid_grant"}))).into_response(); }
            let count = state.renewals.fetch_add(1, Ordering::SeqCst) + 1;
            axum::Json(json!({"access_token":format!("ng_at_fixture_{count}"), "refresh_token":format!("ng_rt_rotated_{count}"), "expires_in":300, "token_type":"Bearer"})).into_response()
        }
        "/v1/auth/logout" => { state.logouts.fetch_add(1, Ordering::SeqCst); axum::Json(json!({"revoked":true})).into_response() },
        "/v1/redirect" => (StatusCode::FOUND, [("location","https://foreign.invalid/credentials")], "blocked").into_response(),
        "/v1/machine/viewer/expired/viewer" => (StatusCode::UNAUTHORIZED, axum::Json(json!({"error":{"code":"UNAUTHORIZED","message":"Viewer expired."}}))).into_response(),
        _ => axum::Json(json!({"native":request.headers().get("authorization").is_some_and(|v| v.as_bytes().starts_with(b"Bearer ng_at_")),
            "cookie":request.headers().contains_key("cookie"), "organization":request.headers().get("x-ngertiin-organization").and_then(|v| v.to_str().ok()),
            "forwarded":request.headers().contains_key("forwarded")})).into_response(),
    }
}
async fn fixture() -> (Arc<Remote>, Arc<Server>, CancellationToken) {
    let listener = TcpListener::bind("127.0.0.1:0").await.unwrap();
    let origin = format!("http://{}", listener.local_addr().unwrap());
    let state = Arc::new(Server {
        renewals: AtomicUsize::new(0),
        logouts: AtomicUsize::new(0),
        reject_renewal: AtomicBool::new(false),
        view_deletes: AtomicUsize::new(0),
    });
    let store = Arc::new(MemoryStore::default());
    store.write("ng_rt_fixture_initial").unwrap();
    let remote = Remote::with_store(
        origin,
        reqwest::Client::builder()
            .redirect(reqwest::redirect::Policy::none())
            .build()
            .unwrap(),
        store,
    );
    let router = Router::new()
        .fallback(any(endpoint))
        .with_state(state.clone());
    let stop = CancellationToken::new();
    let stopped = stop.clone();
    tokio::spawn(async move {
        axum::serve(listener, router)
            .with_graceful_shutdown(stopped.cancelled_owned())
            .await
            .unwrap();
    });
    (remote, state, stop)
}
#[tokio::test]
async fn concurrent_native_renewal_rotates_once_and_restart_uses_the_saved_credential() {
    let (remote, state, stop) = fixture().await;
    let results = futures_util::future::join_all((0..20).map(|_| remote.authorization())).await;
    assert!(
        results
            .iter()
            .all(|r| r.as_ref().unwrap() == "ng_at_fixture_1")
    );
    assert_eq!(state.renewals.load(Ordering::SeqCst), 1);
    remote.close().await;
    let resumed = Remote::with_store(
        remote.origin.clone(),
        remote.client.clone(),
        remote.store.clone(),
    );
    assert_eq!(resumed.authorization().await.unwrap(), "ng_at_fixture_2");
    assert_eq!(state.renewals.load(Ordering::SeqCst), 2);
    let guard = resumed.stream_guard().await;
    resumed.logout().await.unwrap();
    assert!(guard.is_cancelled());
    assert!(resumed.store.read().unwrap().is_none());
    assert!(
        resumed
            .authorization()
            .await
            .unwrap_err()
            .is::<SignInRequired>()
    );
    assert_eq!(state.logouts.load(Ordering::SeqCst), 1);
    assert!(
        remote
            .client
            .get(format!("{}/health/live", remote.origin))
            .send()
            .await
            .unwrap()
            .status()
            .is_success()
    );
    stop.cancel();
}
#[tokio::test]
async fn late_unauthorized_response_cannot_clear_a_newer_access_token() {
    let (remote, state, stop) = fixture().await;
    let first = remote.authorization().await.unwrap();
    remote.state.lock().await.tokens.as_mut().unwrap().expires = Instant::now();
    let second = remote.authorization().await.unwrap();
    remote.invalidate(&first).await;
    assert_eq!(remote.authorization().await.unwrap(), second);
    let guard = remote.stream_guard().await;
    remote.invalidate(&second).await;
    assert!(guard.is_cancelled());
    assert!(remote.store.read().unwrap().is_some());
    assert!(remote.authorization().await.is_ok());
    state.reject_renewal.store(true, Ordering::SeqCst);
    remote.state.lock().await.tokens.as_mut().unwrap().expires = Instant::now();
    assert!(remote.authorization().await.is_err());
    assert!(remote.store.read().unwrap().is_none());
    stop.cancel();
}
#[tokio::test]
async fn exit_is_bounded_when_credential_access_is_waiting_for_the_os() {
    let (remote, _, stop) = fixture().await;
    let value = json!({"viewer_id":"a".repeat(64),"interactive":false,"control_revision":0});
    remote
        .register_view(&value, "org", remote.presentation(), true)
        .await;
    let _waiting_for_os = remote.state.lock().await;
    tokio::time::timeout(Duration::from_secs(6), remote.close())
        .await
        .expect("Native exit must not wait indefinitely for credential access.");
    stop.cancel();
}
#[tokio::test]
async fn late_or_hidden_view_responses_are_revoked_without_retaining_the_ticket() {
    let (remote, server, stop) = fixture().await;
    let old = remote.presentation();
    remote.release_views().await;
    let value = json!({"viewer_id":"a".repeat(64),"interactive":false,"control_revision":0});
    remote.register_view(&value, "org", old, true).await;
    assert!(remote.views.lock().await.is_empty());
    assert_eq!(server.view_deletes.load(Ordering::SeqCst), 1);
    remote
        .register_view(&value, "org", remote.presentation(), false)
        .await;
    assert!(remote.views.lock().await.is_empty());
    assert_eq!(server.view_deletes.load(Ordering::SeqCst), 2);
    remote
        .register_view(&value, "org", remote.presentation(), true)
        .await;
    assert_eq!(remote.views.lock().await.len(), 1);
    remote.release_views().await;
    assert!(remote.views.lock().await.is_empty());
    assert_eq!(server.view_deletes.load(Ordering::SeqCst), 3);
    stop.cancel();
}
#[tokio::test]
async fn remote_gateway_never_loads_local_runtime_or_renderer_credentials_and_blocks_redirects() {
    let (remote, _, stop) = fixture().await;
    let home =
        std::env::temp_dir().join(format!("ngertiin-remote-gateway-{}", uuid::Uuid::new_v4()));
    prepare_home(&home).unwrap();
    let listener = std::net::TcpListener::bind("127.0.0.1:0").unwrap();
    let port = listener.local_addr().unwrap().port();
    drop(listener);
    let profile: Profile = serde_json::from_value(json!({"version":2,"managerId":uuid::Uuid::new_v4(), "serverOrigin":"https://remote.fixture.invalid", "projectRoot":home, "uiPort":port})).unwrap();
    let paths = RuntimePaths {
        assets: home.join("web"),
        packaged: false,
    };
    let mut session = DesktopSession::new(profile, paths, Log::new(&home, vec![])).unwrap();
    Arc::get_mut(&mut session).unwrap().remote = remote.clone();
    let gateway = gateway::start(session.clone(), None).await.unwrap();
    let client = reqwest::Client::builder()
        .redirect(reqwest::redirect::Policy::none())
        .build()
        .unwrap();
    let reply = client
        .get(format!("{}/v1/private", gateway.origin))
        .header("Authorization", "Bearer renderer-leak")
        .header("Cookie", "private=renderer-leak")
        .header("Forwarded", "host=foreign")
        .header("X-Ngertiin-Organization", "intended-org")
        .send()
        .await
        .unwrap();
    let value: Value = reply.json().await.unwrap();
    assert_eq!(
        value,
        json!({"native":true,"cookie":false,"organization":"intended-org","forwarded":false})
    );
    let access = remote.authorization().await.unwrap();
    let expired = client
        .get(format!(
            "{}/v1/machine/viewer/expired/viewer",
            gateway.origin
        ))
        .send()
        .await
        .unwrap();
    assert_eq!(expired.status(), 401);
    assert!(expired.json::<Value>().await.unwrap()["error"].is_object());
    assert_eq!(remote.authorization().await.unwrap(), access);
    assert_eq!(
        client
            .get(format!("{}/v1/private", gateway.origin))
            .header("Origin", "https://foreign.invalid")
            .send()
            .await
            .unwrap()
            .status(),
        403
    );
    assert_eq!(
        client
            .get(format!("{}/v1/redirect", gateway.origin))
            .send()
            .await
            .unwrap()
            .status(),
        502
    );
    assert_eq!(
        client
            .post(format!("{}/api/auth/oauth2/token", gateway.origin))
            .send()
            .await
            .unwrap()
            .status(),
        403
    );
    assert_eq!(
        client
            .post(format!("{}/_desktop/login", gateway.origin))
            .send()
            .await
            .unwrap()
            .status(),
        403
    );
    let response = client
        .post(format!("{}/v1/auth/logout", gateway.origin))
        .header("Origin", &gateway.origin)
        .send()
        .await
        .unwrap();
    assert!(response.status().is_success());
    session.stop().await;
    assert!(
        remote
            .client
            .get(format!("{}/health/live", remote.origin))
            .send()
            .await
            .unwrap()
            .status()
            .is_success()
    );
    gateway.shutdown.cancel();
    stop.cancel();
    let _ = std::fs::remove_dir_all(home);
}
#[test]
fn api_paths_cannot_escape_the_selected_server() {
    for path in [
        "//foreign/path",
        "/v1/%2f%2fforeign",
        "/v1/%2e%2e/api/auth",
        "/v1/%252e%252e",
        "/v1/\\foreign",
        "/v1/%00",
    ] {
        assert!(!gateway::valid_path(path), "{path}");
    }
    assert!(gateway::valid_path("/v1/threads/123/messages"));
}

#[tokio::test]
#[ignore = "Requires the explicitly launched disposable NMA-081 HTTPS fixture and its public CA."]
async fn native_https_requires_trusted_tls_and_the_selected_issuer() {
    let certificate =
        std::env::var_os("NGERTIIN_NMA081_CA").expect("Select the fixture public CA.");
    let mut profile: Profile = serde_json::from_value(json!({"version":2,"managerId":uuid::Uuid::new_v4(),  "serverOrigin":"https://127.0.0.1:44431", "projectRoot":"/unused","uiPort":4312})).unwrap();
    assert!(Remote::new(&profile).unwrap().metadata().await.is_err());
    profile.server_certificate = Some(certificate.into());
    assert!(Remote::new(&profile).unwrap().metadata().await.is_ok());
    profile.server_origin = "https://localhost:44431".into();
    assert!(Remote::new(&profile).unwrap().metadata().await.is_err());
}
