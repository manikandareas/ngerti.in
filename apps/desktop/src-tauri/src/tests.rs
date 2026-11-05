use crate::{
    gateway,
    log::Log,
    profile::{Profile, RuntimePaths, prepare_home, private_json, write_private},
    supervisor::{RuntimeRecord, Supervisor, process_alive},
};
use axum::{
    Router,
    body::Body,
    http::{HeaderMap, StatusCode},
    response::IntoResponse,
    routing::{any, get},
};
use futures_util::StreamExt;
use serde_json::{Value, json};
use std::{
    path::PathBuf,
    sync::{
        Arc,
        atomic::{AtomicUsize, Ordering},
    },
    time::Duration,
};

struct Fixture {
    home: PathBuf,
    profile: Profile,
}
impl Fixture {
    fn new() -> Self {
        let home =
            std::env::temp_dir().join(format!("ngertiin-tauri-test-{}", uuid::Uuid::new_v4()));
        prepare_home(&home).unwrap();
        let state = home.join("state");
        prepare_home(&state).unwrap();
        let config = home.join("empty.env");
        std::fs::write(
            &config,
            "NGERTIIN_GROUP_ROUTER=member\nTYPESAFE_API_KEY=\nNGERTIIN_API_URL=disabled\n",
        )
        .unwrap();
        let root = PathBuf::from(env!("CARGO_MANIFEST_DIR"))
            .ancestors()
            .nth(3)
            .unwrap()
            .to_path_buf();
        let listener = std::net::TcpListener::bind("127.0.0.1:0").unwrap();
        let port = listener.local_addr().unwrap().port();
        let profile = Profile {
            version: 1,
            manager_id: uuid::Uuid::new_v4().to_string(),
            state_directory: state,
            project_root: root,
            config_file: config,
            bun_executable: dirs::home_dir().unwrap().join(".bun/bin/bun"),
            codex_executable: None,
            muse_executable: None,
            ui_port: port,
        };
        Self { home, profile }
    }
    fn supervisor(&self) -> Arc<Supervisor> {
        self.supervisor_for(self.profile.clone())
    }
    fn supervisor_for(&self, profile: Profile) -> Arc<Supervisor> {
        let paths = RuntimePaths {
            root: profile.project_root.clone(),
            bun: profile.bun_executable.clone(),
            assets: self.home.join("web"),
            packaged: false,
        };
        Supervisor::new(
            profile,
            paths,
            Log::new(&self.home, vec!["test-installation-token".into()]),
        )
        .unwrap()
    }
    fn token(&self) {
        write_private(
            &self.profile.state_directory.join("installation.json"),
            &json!({"token":"test-installation-token"}),
        )
        .unwrap();
    }
}
impl Drop for Fixture {
    fn drop(&mut self) {
        if let Ok(record) =
            private_json::<RuntimeRecord>(&self.profile.state_directory.join("runtime.json"))
            && record.manager_id.as_deref() == Some(&self.profile.manager_id)
        {
            unsafe {
                libc::kill(record.pid as i32, libc::SIGTERM);
            }
        }
        let _ = std::fs::remove_dir_all(&self.home);
    }
}

#[tokio::test]
async fn managed_recovery_external_ownership_and_concurrent_start_are_preserved() {
    let fixture = Fixture::new();
    let owned = fixture.supervisor();
    tokio::join!(owned.start(), owned.start());
    assert_eq!(owned.status().await.state, "ready");
    assert_eq!(owned.status().await.ownership.as_deref(), Some("managed"));
    let first = owned.runtime().unwrap();
    let client = reqwest::Client::new();
    let agents: Value = client
        .get(format!("{}/v1/entities/agent", first.url))
        .bearer_auth(owned.token().unwrap())
        .send()
        .await
        .unwrap()
        .json()
        .await
        .unwrap();
    let mut profile = fixture.profile.clone();
    profile.manager_id = uuid::Uuid::new_v4().to_string();
    let attached = fixture.supervisor_for(profile);
    attached.start().await;
    assert_eq!(
        attached.status().await.ownership.as_deref(),
        Some("external")
    );
    attached.stop().await;
    assert!(process_alive(first.pid));
    unsafe {
        libc::kill(first.pid as i32, libc::SIGKILL);
    }
    tokio::time::sleep(Duration::from_millis(250)).await;
    owned.check().await;
    assert_eq!(owned.status().await.state, "ready");
    let second = owned.runtime().unwrap();
    assert_ne!(first.instance_id, second.instance_id);
    let after: Value = client
        .get(format!("{}/v1/entities/agent", second.url))
        .bearer_auth(owned.token().unwrap())
        .send()
        .await
        .unwrap()
        .json()
        .await
        .unwrap();
    assert_eq!(agents, after);
    owned.stop().await;
    assert!(!process_alive(second.pid));
    assert!(owned.runtime().is_none());
}

#[tokio::test]
async fn shutdown_during_startup_leaves_no_backend_behind() {
    let fixture = Fixture::new();
    let supervisor = fixture.supervisor();
    tokio::join!(supervisor.start(), async {
        tokio::task::yield_now().await;
        supervisor.stop().await;
    });
    assert_eq!(supervisor.status().await.state, "stopped");
    assert!(supervisor.runtime().is_none());
}

#[tokio::test]
async fn gateway_preserves_streaming_bytes_origin_auth_and_spa_boundaries() {
    let fixture = Fixture::new();
    fixture.token();
    std::fs::create_dir(fixture.home.join("web")).unwrap();
    std::fs::write(
        fixture.home.join("web/index.html"),
        "<main>Workspace</main>",
    )
    .unwrap();
    let supervisor = fixture.supervisor();
    let (finish, receive) = tokio::sync::watch::channel(false);
    let router = Router::new()
        .route(
            "/v1/echo",
            any(|headers: HeaderMap, body: Body| async move {
                assert_eq!(
                    headers.get("authorization").unwrap(),
                    "Bearer test-installation-token"
                );
                (StatusCode::OK, body).into_response()
            }),
        )
        .route(
            "/v1/stream",
            get(move || {
                let mut receive = receive.clone();
                async move {
                    let stream = futures_util::stream::once(async {
                        Ok::<_, std::io::Error>("data: first\n\n")
                    })
                    .chain(futures_util::stream::once(async move {
                        receive.changed().await.unwrap();
                        Ok("data: last\n\n")
                    }));
                    (
                        [("content-type", "text/event-stream")],
                        Body::from_stream(stream),
                    )
                }
            }),
        );
    let backend = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
    supervisor
        .attach_for_test(format!("http://{}", backend.local_addr().unwrap()))
        .await;
    let service = tokio::spawn(async move {
        axum::serve(backend, router).await.unwrap();
    });
    let gateway = gateway::start(supervisor, None).await.unwrap();
    let client = reqwest::Client::new();
    assert_eq!(
        client
            .get(format!("{}/v1/echo", gateway.origin))
            .header("Origin", "https://untrusted.test")
            .send()
            .await
            .unwrap()
            .status(),
        StatusCode::FORBIDDEN
    );
    assert_eq!(
        client
            .get(format!("{}/v1/echo", gateway.origin))
            .header("Sec-Fetch-Site", "cross-site")
            .send()
            .await
            .unwrap()
            .status(),
        StatusCode::FORBIDDEN
    );
    let bytes = vec![0, 1, 255, 128];
    let response = client
        .post(format!("{}/v1/echo", gateway.origin))
        .header("Authorization", "Bearer renderer-supplied")
        .body(bytes.clone())
        .send()
        .await
        .unwrap();
    assert_eq!(response.bytes().await.unwrap().to_vec(), bytes);
    let mut response = client
        .get(format!("{}/v1/stream", gateway.origin))
        .send()
        .await
        .unwrap();
    assert!(
        String::from_utf8_lossy(
            &tokio::time::timeout(Duration::from_secs(2), response.chunk())
                .await
                .unwrap()
                .unwrap()
                .unwrap()
        )
        .contains("first")
    );
    finish.send(true).unwrap();
    assert!(String::from_utf8_lossy(&response.chunk().await.unwrap().unwrap()).contains("last"));
    assert!(
        client
            .get(format!("{}/settings", gateway.origin))
            .send()
            .await
            .unwrap()
            .text()
            .await
            .unwrap()
            .contains("Workspace")
    );
    assert_eq!(
        client
            .get(format!("{}/assets/missing.js", gateway.origin))
            .send()
            .await
            .unwrap()
            .status(),
        StatusCode::NOT_FOUND
    );
    assert_eq!(
        client
            .get(format!("{}/%2e%2e%5cprivate", gateway.origin))
            .send()
            .await
            .unwrap()
            .status(),
        StatusCode::FORBIDDEN
    );
    gateway.shutdown.cancel();
    service.abort();
}

#[tokio::test]
async fn native_handback_releases_only_the_exact_issued_human_revision() {
    let fixture = Fixture::new();
    fixture.token();
    let supervisor = fixture.supervisor();
    let releases = Arc::new(AtomicUsize::new(0));
    let observed = releases.clone();
    let router = Router::new()
        .route(
            "/v1/machine",
            get(|| async {
                axum::Json(json!({"lease":{"holder":"human","state":"active","revision":12}}))
            }),
        )
        .route(
            "/v1/machine/control",
            axum::routing::post(move || {
                let releases = observed.clone();
                async move {
                    releases.fetch_add(1, Ordering::SeqCst);
                    axum::Json(json!({"released":true}))
                }
            }),
        )
        .route(
            "/v1/machine/views/{id}",
            axum::routing::delete(|| async { StatusCode::NO_CONTENT }),
        );
    let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
    supervisor
        .attach_for_test(format!("http://{}", listener.local_addr().unwrap()))
        .await;
    let service = tokio::spawn(async move {
        axum::serve(listener, router).await.unwrap();
    });
    supervisor.release_views().await;
    supervisor
        .register_view(
            &json!({"viewer_id":"a".repeat(64),"interactive":true,"control_revision":11}),
        )
        .await;
    supervisor.release_views().await;
    assert_eq!(releases.load(Ordering::SeqCst), 0);
    supervisor
        .register_view(
            &json!({"viewer_id":"b".repeat(64),"interactive":true,"control_revision":12}),
        )
        .await;
    supervisor.forget_view(&"b".repeat(64)).await;
    supervisor.release_views().await;
    assert_eq!(releases.load(Ordering::SeqCst), 1);
    service.abort();
}
