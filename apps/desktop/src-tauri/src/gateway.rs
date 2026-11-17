use crate::desktop_session::DesktopSession;
use anyhow::{Context, Result};
use axum::{
    Router,
    body::{Body, to_bytes},
    extract::{
        FromRequestParts, State, WebSocketUpgrade,
        ws::{Message, WebSocket},
    },
    http::{HeaderMap, HeaderValue, Method, Request, StatusCode, header},
    response::{IntoResponse, Response},
};
use futures_util::{SinkExt, StreamExt};
use serde_json::json;
use std::{
    path::{Component, PathBuf},
    sync::Arc,
};
use tokio::net::TcpListener;
use tokio_util::{io::ReaderStream, sync::CancellationToken};

pub struct Gateway {
    pub origin: String,
    pub shutdown: CancellationToken,
}

struct GatewayState {
    session: Arc<DesktopSession>,
    host: String,
    origin: String,
    vite: Option<url::Url>,
    client: reqwest::Client,
    shutdown: CancellationToken,
    app: Option<tauri::AppHandle>,
}

pub async fn start(session: Arc<DesktopSession>, app: Option<tauri::AppHandle>) -> Result<Gateway> {
    let port = session.profile.ui_port;
    let listener = TcpListener::bind((std::net::Ipv4Addr::LOCALHOST, port)).await
        .context("The saved desktop port is occupied. Close the other desktop host before opening this one.")?;
    let host = format!("127.0.0.1:{port}");
    let origin = format!("http://{host}");
    let vite = if session.paths.packaged {
        None
    } else {
        std::env::var("NGERTIIN_DESKTOP_VITE_URL")
            .ok()
            .map(|value| -> Result<url::Url> {
                let value = url::Url::parse(&value)?;
                anyhow::ensure!(
                    value.scheme() == "http"
                        && value.host_str() == Some("127.0.0.1")
                        && value.username().is_empty()
                        && value.password().is_none(),
                    "The Vite endpoint must be local."
                );
                Ok(value)
            })
            .transpose()?
    };
    let shutdown = CancellationToken::new();
    let client = reqwest::Client::builder()
        .no_proxy()
        .redirect(reqwest::redirect::Policy::none())
        .connect_timeout(std::time::Duration::from_secs(3))
        .build()?;
    let state = Arc::new(GatewayState {
        session,
        host,
        origin: origin.clone(),
        vite,
        client,
        shutdown: shutdown.clone(),
        app,
    });
    let router = Router::new().fallback(handle).with_state(state);
    let cancellation = shutdown.clone();
    tokio::spawn(async move {
        let _ = axum::serve(listener, router)
            .with_graceful_shutdown(cancellation.cancelled_owned())
            .await;
    });
    Ok(Gateway { origin, shutdown })
}

async fn handle(State(state): State<Arc<GatewayState>>, request: Request<Body>) -> Response {
    let headers = request.headers();
    let path = request.uri().path();
    let origin = headers.get(header::ORIGIN).and_then(|s| s.to_str().ok());
    if headers.get(header::HOST).and_then(|s| s.to_str().ok()) != Some(&state.host)
        || origin.is_some_and(|origin| origin != state.origin)
        || headers
            .get("sec-fetch-site")
            .is_some_and(|v| v == "cross-site")
        || request.uri().scheme().is_some()
        || !path.starts_with('/')
        || !valid_path(path)
    {
        return StatusCode::FORBIDDEN.into_response();
    }
    {
        let remote = &state.session.remote;
        if path == "/_desktop/login"
            || path == "/_desktop/cancel-login"
            || path == "/v1/auth/logout"
        {
            if request.method() != Method::POST || origin != Some(&state.origin) {
                return StatusCode::FORBIDDEN.into_response();
            }
            let result = match path {
                "/_desktop/login" => remote.sign_in().await,
                "/_desktop/cancel-login" => {
                    remote.cancel_login();
                    Ok(())
                }
                _ => remote.logout().await,
            };
            return match result {
                Ok(()) => axum::Json(json!({"ok": true})).into_response(),
                Err(error) => (StatusCode::BAD_GATEWAY, axum::Json(json!({"error":{"code":"NATIVE_AUTH_UNAVAILABLE", "message":error.to_string()}}))).into_response(),
            };
        }
        if path == "/v1/auth/native" && request.method() == Method::GET {
            return match remote.metadata().await {
                Ok(metadata) => axum::Json(metadata).into_response(),
                Err(_) => unavailable(StatusCode::BAD_GATEWAY),
            };
        }
        if path.starts_with("/api/")
            || path.starts_with("/_desktop/")
                && !matches!(
                    path,
                    "/_desktop/status"
                        | "/_desktop/open-external"
                        | "/_desktop/retry"
                        | "/_desktop/focus"
                        | "/_desktop/window/drag"
                        | "/_desktop/window/toggle-maximize"
                )
        {
            return StatusCode::FORBIDDEN.into_response();
        }
    }
    if path == "/_desktop/status" {
        return axum::Json(state.session.status().await).into_response();
    }
    if path == "/_desktop/open-external" {
        return open_external(request, &state.origin, |url| open::that(url)).await;
    }
    if path == "/_desktop/retry" {
        if request.method() != Method::POST {
            return StatusCode::METHOD_NOT_ALLOWED.into_response();
        }
        let session = state.session.clone();
        tokio::spawn(async move {
            let _ = session.remote.metadata().await;
        });
        return StatusCode::ACCEPTED.into_response();
    }
    if path == "/_desktop/focus" {
        if request.method() != Method::POST {
            return StatusCode::METHOD_NOT_ALLOWED.into_response();
        }
        if let Some(app) = &state.app {
            crate::host::show(app);
        }
        return StatusCode::NO_CONTENT.into_response();
    }
    if matches!(
        path,
        "/_desktop/window/drag" | "/_desktop/window/toggle-maximize"
    ) {
        if request.method() != Method::POST || origin != Some(&state.origin) {
            return StatusCode::FORBIDDEN.into_response();
        }
        let Some(app) = &state.app else {
            return StatusCode::SERVICE_UNAVAILABLE.into_response();
        };
        use tauri::Manager;
        let Some(window) = app.get_webview_window("main") else {
            return StatusCode::SERVICE_UNAVAILABLE.into_response();
        };
        let result = if path.ends_with("/drag") {
            window.start_dragging()
        } else {
            window.is_maximized().and_then(|maximized| {
                if maximized {
                    window.unmaximize()
                } else {
                    window.maximize()
                }
            })
        };
        return match result {
            Ok(()) => StatusCode::NO_CONTENT.into_response(),
            Err(_) => StatusCode::INTERNAL_SERVER_ERROR.into_response(),
        };
    }
    if is_api(path) {
        let backend = state.session.remote.origin.clone();
        if request
            .headers()
            .get(header::UPGRADE)
            .is_some_and(|value| value.as_bytes().eq_ignore_ascii_case(b"websocket"))
        {
            return upgrade_media(state, request).await;
        }
        return proxy(&state, request, &backend, true).await;
    }
    if let Some(vite) = &state.vite {
        if request
            .headers()
            .get(header::UPGRADE)
            .is_some_and(|value| value.as_bytes().eq_ignore_ascii_case(b"websocket"))
        {
            return upgrade_vite(state.clone(), request, vite.clone()).await;
        }
        return proxy(&state, request, vite.as_str().trim_end_matches('/'), false).await;
    }
    static_asset(&state, request).await
}

/// A bounded browser handoff for the main-frame bridge, without shell or file access.
pub(crate) async fn open_external(
    request: Request<Body>,
    origin: &str,
    opener: impl FnOnce(&str) -> std::io::Result<()> + Send + 'static,
) -> Response {
    if request.method() != Method::POST {
        return StatusCode::METHOD_NOT_ALLOWED.into_response();
    }
    if request
        .headers()
        .get(header::ORIGIN)
        .and_then(|v| v.to_str().ok())
        != Some(origin)
    {
        return StatusCode::FORBIDDEN.into_response();
    }
    if request
        .headers()
        .get(header::CONTENT_TYPE)
        .and_then(|v| v.to_str().ok())
        != Some("application/json")
    {
        return StatusCode::UNSUPPORTED_MEDIA_TYPE.into_response();
    }
    #[derive(serde::Deserialize)]
    #[serde(deny_unknown_fields)]
    struct Handoff {
        url: String,
    }
    let Ok(body) = to_bytes(request.into_body(), 16384).await else {
        return StatusCode::PAYLOAD_TOO_LARGE.into_response();
    };
    let Ok(value) = serde_json::from_slice::<Handoff>(&body) else {
        return StatusCode::BAD_REQUEST.into_response();
    };
    let Ok(url) = url::Url::parse(&value.url) else {
        return StatusCode::BAD_REQUEST.into_response();
    };
    if value.url.len() > 8192
        || value.url.chars().any(char::is_control)
        || url.scheme() != "https"
        || url.host_str().is_none()
        || !url.username().is_empty()
        || url.password().is_some()
    {
        return StatusCode::BAD_REQUEST.into_response();
    }
    match tokio::task::spawn_blocking(move || opener(url.as_str())).await {
        Ok(Ok(())) => StatusCode::NO_CONTENT.into_response(),
        _ => (StatusCode::BAD_GATEWAY, axum::Json(json!({
            "error": { "code": "BROWSER_UNAVAILABLE", "message": "The browser could not be opened." }
        }))).into_response(),
    }
}

fn is_api(path: &str) -> bool {
    ["/v1", "/health"]
        .iter()
        .any(|prefix| path == *prefix || path.starts_with(&format!("{prefix}/")))
}

pub(crate) fn valid_path(path: &str) -> bool {
    let Ok(decoded) = percent_encoding::percent_decode_str(path).decode_utf8() else {
        return false;
    };
    !decoded.starts_with("//")
        && !decoded.contains(['\\', '\0', '%'])
        && !decoded.chars().any(char::is_control)
        && !decoded.split('/').any(|part| matches!(part, "." | ".."))
        && path.split('/').count() == decoded.split('/').count()
}

fn clean_headers(headers: &mut HeaderMap) {
    if let Some(connection) = headers
        .get(header::CONNECTION)
        .and_then(|h| h.to_str().ok())
        .map(str::to_owned)
    {
        for name in connection.split(',').map(str::trim) {
            headers.remove(name);
        }
    }
    for name in [
        "host",
        "connection",
        "proxy-authorization",
        "proxy-authenticate",
        "keep-alive",
        "te",
        "trailer",
        "transfer-encoding",
        "upgrade",
        "x-forwarded-host",
        "x-forwarded-for",
        "authorization",
    ] {
        headers.remove(name);
    }
}

async fn proxy(state: &GatewayState, request: Request<Body>, target: &str, api: bool) -> Response {
    let path = request.uri().path().to_string();
    let track_view = api && path == "/v1/machine/view" && request.method() == Method::POST;
    let presentation = state.session.remote.presentation();
    let forget_view =
        api && request.method() == Method::DELETE && path.starts_with("/v1/machine/views/");
    let (parts, body) = request.into_parts();
    let mut headers = parts.headers;
    let organization = headers
        .get("x-ngertiin-organization")
        .and_then(|v| v.to_str().ok())
        .unwrap_or("")
        .to_owned();
    clean_headers(&mut headers);
    let mut used_access = None;
    let mut session_guard = None;
    if api {
        let token = {
            let remote = &state.session.remote;
            headers.insert(
                header::ORIGIN,
                HeaderValue::from_str(&remote.origin).expect("Validated server origin"),
            );
            headers.remove(header::COOKIE);
            headers.remove(header::REFERER);
            for name in [
                "forwarded",
                "x-forwarded-proto",
                "x-real-ip",
                "x-cua-env-authorization",
                "proxy-connection",
            ] {
                headers.remove(name);
            }
            let token = match remote.authorization().await {
                Ok(token) => token,
                Err(error) if error.is::<crate::remote::SignInRequired>() => return (
                    StatusCode::UNAUTHORIZED,
                    axum::Json(
                        json!({"error":{"code":"UNAUTHORIZED", "message":"Sign in to continue."}}),
                    ),
                )
                    .into_response(),
                Err(_) => return unavailable(StatusCode::SERVICE_UNAVAILABLE),
            };
            session_guard = Some(remote.stream_guard().await);
            used_access = Some(token.clone());
            token
        };
        let Ok(value) = HeaderValue::from_str(&format!("Bearer {token}")) else {
            return unavailable(StatusCode::SERVICE_UNAVAILABLE);
        };
        headers.insert(header::AUTHORIZATION, value);
    }
    let target = format!(
        "{target}{}",
        parts
            .uri
            .path_and_query()
            .map(|v| v.as_str())
            .unwrap_or("/")
    );
    let client = if api {
        &state.session.remote.client
    } else {
        &state.client
    };
    let result = client
        .request(parts.method, target)
        .headers(headers)
        .body(reqwest::Body::wrap_stream(body.into_data_stream()))
        .send()
        .await;
    let Ok(reply) = result else {
        return unavailable(StatusCode::BAD_GATEWAY);
    };
    let status = reply.status();
    if api && status.is_redirection() {
        return unavailable(StatusCode::BAD_GATEWAY);
    }
    if status == StatusCode::UNAUTHORIZED
        && !path.starts_with("/v1/machine/viewer/")
        && !path.starts_with("/v1/machine/views/")
        && let Some(access) = &used_access
    {
        state.session.remote.invalidate(access).await;
    }
    let mut headers = reply.headers().clone();
    clean_headers(&mut headers);
    headers.remove(header::ACCESS_CONTROL_ALLOW_ORIGIN);
    headers.remove(header::SET_COOKIE);
    headers.remove(header::WWW_AUTHENTICATE);
    headers.insert(
        header::X_CONTENT_TYPE_OPTIONS,
        HeaderValue::from_static("nosniff"),
    );
    headers.insert(
        header::REFERRER_POLICY,
        HeaderValue::from_static("no-referrer"),
    );
    if forget_view && status.is_success() {
        state
            .session
            .remote
            .forget_view(path.trim_start_matches("/v1/machine/views/"))
            .await;
    }
    let body = if track_view && status.is_success() {
        // Only this bounded control response is decoded; files and event streams stay streaming.
        let body = Body::from_stream(reply.bytes_stream());
        let Ok(bytes) = to_bytes(body, 65536).await else {
            return unavailable(StatusCode::BAD_GATEWAY);
        };
        if let Ok(value) = serde_json::from_slice(&bytes) {
            state
                .session
                .remote
                .register_view(
                    &value,
                    &organization,
                    presentation,
                    state
                        .session
                        .visible
                        .load(std::sync::atomic::Ordering::Acquire),
                )
                .await;
        }
        Body::from(bytes)
    } else {
        let shutdown = state.shutdown.clone();
        let guard = if status.is_success() {
            session_guard.unwrap_or_default()
        } else {
            CancellationToken::new()
        };
        Body::from_stream(reply.bytes_stream().take_until(async move {
            tokio::select! { _ = shutdown.cancelled() => {}, _ = guard.cancelled() => {} }
        }))
    };
    (status, headers, body).into_response()
}

async fn static_asset(state: &GatewayState, request: Request<Body>) -> Response {
    if request.method() != Method::GET && request.method() != Method::HEAD {
        return StatusCode::METHOD_NOT_ALLOWED.into_response();
    }
    let Ok(decoded) = percent_encoding::percent_decode_str(request.uri().path()).decode_utf8()
    else {
        return StatusCode::BAD_REQUEST.into_response();
    };
    if decoded.contains(['\\', '\0']) || decoded.split('/').any(|part| part == "..") {
        return StatusCode::FORBIDDEN.into_response();
    }
    let relative = PathBuf::from(decoded.trim_start_matches('/'));
    if relative
        .components()
        .any(|c| !matches!(c, Component::Normal(_)))
    {
        return StatusCode::FORBIDDEN.into_response();
    }
    let root = &state.session.paths.assets;
    let mut file = root.join(&relative);
    if !tokio::fs::metadata(&file).await.is_ok_and(|m| m.is_file()) {
        if relative.extension().is_some() {
            return StatusCode::NOT_FOUND.into_response();
        }
        file = root.join("index.html");
    }
    let Ok(canonical) = tokio::fs::canonicalize(&file).await else {
        return unavailable(StatusCode::SERVICE_UNAVAILABLE);
    };
    let Ok(root) = tokio::fs::canonicalize(root).await else {
        return unavailable(StatusCode::SERVICE_UNAVAILABLE);
    };
    if !canonical.starts_with(root) {
        return StatusCode::FORBIDDEN.into_response();
    }
    let Ok(stream) = tokio::fs::File::open(&canonical).await else {
        return StatusCode::NOT_FOUND.into_response();
    };
    let Ok(metadata) = stream.metadata().await else {
        return StatusCode::NOT_FOUND.into_response();
    };
    let mut headers = HeaderMap::new();
    headers.insert(
        header::CONTENT_TYPE,
        HeaderValue::from_str(
            mime_guess::from_path(&file)
                .first_or_octet_stream()
                .essence_str(),
        )
        .unwrap(),
    );
    headers.insert(
        header::CONTENT_LENGTH,
        HeaderValue::from_str(&metadata.len().to_string()).unwrap(),
    );
    headers.insert(header::CACHE_CONTROL, HeaderValue::from_static("no-cache"));
    headers.insert(
        header::X_CONTENT_TYPE_OPTIONS,
        HeaderValue::from_static("nosniff"),
    );
    headers.insert(
        header::REFERRER_POLICY,
        HeaderValue::from_static("no-referrer"),
    );
    headers.insert(header::CONTENT_SECURITY_POLICY, HeaderValue::from_static("default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self' data:; connect-src 'self' ws://127.0.0.1:* http://127.0.0.1:*; frame-src 'self' blob:; object-src 'none'; base-uri 'self'; frame-ancestors 'self'"));
    let body = if request.method() == Method::HEAD {
        Body::empty()
    } else {
        Body::from_stream(ReaderStream::new(stream))
    };
    (headers, body).into_response()
}

async fn upgrade_vite(
    state: Arc<GatewayState>,
    request: Request<Body>,
    mut target: url::Url,
) -> Response {
    let (mut parts, _) = request.into_parts();
    let Ok(upgrade) = WebSocketUpgrade::from_request_parts(&mut parts, &()).await else {
        return StatusCode::BAD_REQUEST.into_response();
    };
    target.set_scheme("ws").ok();
    target.set_path(parts.uri.path());
    target.set_query(parts.uri.query());
    upgrade
        .protocols(["vite-hmr"])
        .max_message_size(4 * 1024 * 1024)
        .on_upgrade(move |socket| bridge_vite(state, socket, target))
        .into_response()
}

async fn upgrade_media(state: Arc<GatewayState>, request: Request<Body>) -> Response {
    use base64::{Engine, engine::general_purpose::STANDARD};
    let remote = &state.session.remote;
    let path = request.uri().path();
    let segments: Vec<_> = path.split('/').collect();
    if segments.len() != 6
        || segments[..4] != ["", "v1", "machine", "viewer"]
        || segments[5] != "media"
        || segments[4].len() != 64
        || !segments[4].bytes().all(|b| b.is_ascii_hexdigit())
    {
        return StatusCode::FORBIDDEN.into_response();
    }
    let Ok(access) = remote.authorization().await else {
        return StatusCode::UNAUTHORIZED.into_response();
    };
    let guard = remote.stream_guard().await;
    let target = format!(
        "{}{}",
        remote.origin,
        request.uri().path_and_query().unwrap()
    );
    let (mut parts, _) = request.into_parts();
    let Ok(upgrade) = WebSocketUpgrade::from_request_parts(&mut parts, &()).await else {
        return StatusCode::BAD_REQUEST.into_response();
    };
    let key = STANDARD.encode(uuid::Uuid::new_v4().as_bytes());
    let expected = tokio_tungstenite::tungstenite::handshake::derive_accept_key(key.as_bytes());
    let reply = remote
        .client
        .get(target)
        .bearer_auth(access)
        .header(header::ORIGIN, &remote.origin)
        .header(header::CONNECTION, "Upgrade")
        .header(header::UPGRADE, "websocket")
        .header("Sec-WebSocket-Version", "13")
        .header("Sec-WebSocket-Key", key)
        .timeout(std::time::Duration::from_secs(10))
        .send()
        .await;
    let Ok(reply) = reply else {
        return unavailable(StatusCode::BAD_GATEWAY);
    };
    if reply.status() != StatusCode::SWITCHING_PROTOCOLS
        || reply
            .headers()
            .get("sec-websocket-accept")
            .and_then(|v| v.to_str().ok())
            != Some(&expected)
    {
        return StatusCode::UNAUTHORIZED.into_response();
    }
    let Ok(peer) = reply.upgrade().await else {
        return unavailable(StatusCode::BAD_GATEWAY);
    };
    upgrade
        .max_message_size(65536)
        .on_upgrade(move |socket| async move {
            let peer = tokio_tungstenite::WebSocketStream::from_raw_socket(
                peer,
                tokio_tungstenite::tungstenite::protocol::Role::Client,
                None,
            )
            .await;
            bridge_socket(state, socket, peer, guard).await;
        })
        .into_response()
}

async fn bridge_vite(state: Arc<GatewayState>, socket: WebSocket, target: url::Url) {
    use tokio_tungstenite::tungstenite::client::IntoClientRequest;
    let Ok(mut request) = target.as_str().into_client_request() else {
        return;
    };
    request.headers_mut().insert(
        "sec-websocket-protocol",
        HeaderValue::from_static("vite-hmr"),
    );
    let Ok((peer, _)) = tokio_tungstenite::connect_async(request).await else {
        return;
    };
    bridge_socket(state, socket, peer, CancellationToken::new()).await;
}

async fn bridge_socket<S>(
    state: Arc<GatewayState>,
    socket: WebSocket,
    peer: tokio_tungstenite::WebSocketStream<S>,
    guard: CancellationToken,
) where
    S: tokio::io::AsyncRead + tokio::io::AsyncWrite + Unpin,
{
    use tokio_tungstenite::tungstenite::Message as PeerMessage;
    let (mut send, mut receive) = socket.split();
    let (mut upstream, mut downstream) = peer.split();
    tokio::select! {
        _ = state.shutdown.cancelled() => {},
        _ = guard.cancelled() => {},
        _ = async {
            while let Some(Ok(message)) = receive.next().await {
                let message = match message {
                    Message::Text(text) => PeerMessage::Text(text.to_string().into()),
                    Message::Binary(bytes) => PeerMessage::Binary(bytes),
                    Message::Ping(bytes) => PeerMessage::Ping(bytes),
                    Message::Pong(bytes) => PeerMessage::Pong(bytes),
                    Message::Close(_) => break,
                };
                if upstream.send(message).await.is_err() { break; }
            }
        } => {},
        _ = async {
            while let Some(Ok(message)) = downstream.next().await {
                let message = match message {
                    PeerMessage::Text(text) => Message::Text(text.to_string().into()),
                    PeerMessage::Binary(bytes) => Message::Binary(bytes),
                    PeerMessage::Ping(bytes) => Message::Ping(bytes),
                    PeerMessage::Pong(bytes) => Message::Pong(bytes),
                    PeerMessage::Close(_) => break,
                    PeerMessage::Frame(_) => continue,
                };
                if send.send(message).await.is_err() { break; }
            }
        } => {},
    }
}

fn unavailable(status: StatusCode) -> Response {
    (status, axum::Json(json!({"error":{"code":"API_UNAVAILABLE", "message":"Reconnecting to your workspace…"}}))).into_response()
}
