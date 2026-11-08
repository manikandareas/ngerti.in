//! Real disposable Bun backend ownership, restart and data-retention checks.
use super::{
    log::Log,
    profile::{Profile, RuntimePaths, prepare_home, private_json, write_private},
    supervisor::{RuntimeRecord, Supervisor, process_alive},
};
use serde_json::{Value, json};
use std::{path::PathBuf, sync::Arc, time::Duration};
struct Fixture {
    home: PathBuf,
    profile: Profile,
}
impl Fixture {
    fn new() -> Self {
        let home =
            std::env::temp_dir().join(format!("ngertiin-rust-host-test-{}", uuid::Uuid::new_v4()));
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
            .nth(4)
            .unwrap()
            .to_path_buf();
        let profile = Profile {
            version: 1,
            manager_id: uuid::Uuid::new_v4().to_string(),
            state_directory: state,
            project_root: root,
            config_file: config,
            bun_executable: dirs::home_dir().unwrap().join(".bun/bin/bun"),
            codex_executable: None,
            muse_executable: None,
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
        };
        Supervisor::new(
            profile,
            paths,
            Log::new(&self.home, vec!["test-installation-token".into()]),
        )
        .unwrap()
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
    let same_manager = fixture.supervisor();
    same_manager.start().await;
    assert_eq!(
        same_manager.status().await.ownership.as_deref(),
        Some("external")
    );
    same_manager.stop().await;
    assert!(process_alive(first.pid));
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

#[test]
fn private_configuration_and_single_instance_are_fenced() {
    use std::os::unix::fs::{PermissionsExt, symlink};
    let fixture = Fixture::new();
    let path = fixture.home.join("private.json");
    write_private(&path, &json!({"test":true})).unwrap();
    assert!(private_json::<Value>(&path).is_ok());
    let link = fixture.home.join("link.json");
    symlink(&path, &link).unwrap();
    assert!(private_json::<Value>(&link).is_err());
    std::fs::set_permissions(&path, std::fs::Permissions::from_mode(0o644)).unwrap();
    assert!(private_json::<Value>(&path).is_err());
    let instance = super::instance::Instance::acquire(&fixture.home)
        .unwrap()
        .unwrap();
    assert!(
        super::instance::Instance::acquire(&fixture.home)
            .unwrap()
            .is_none()
    );
    for _ in 0..50 {
        if instance.focus.load(std::sync::atomic::Ordering::Acquire) {
            return;
        }
        std::thread::sleep(Duration::from_millis(10));
    }
    panic!("Second launch did not request focus");
}

#[tokio::test]
async fn incompatible_live_authority_is_refused_without_spawning_or_stopping_it() {
    use std::io::{Read, Write};
    let fixture = Fixture::new();
    let listener = std::net::TcpListener::bind("127.0.0.1:0").unwrap();
    let url = format!("http://{}", listener.local_addr().unwrap());
    let owner = uuid::Uuid::new_v4().to_string();
    write_private(
        &fixture.profile.state_directory.join("installation.json"),
        &json!({"owner_id":owner,"token":"test-installation-token"}),
    )
    .unwrap();
    write_private(
        &fixture.profile.state_directory.join("runtime.json"),
        &RuntimeRecord {
            pid: std::process::id(),
            instance_id: uuid::Uuid::new_v4().to_string(),
            owner_id: owner,
            url,
            contract_version: "9.0.0".into(),
            manager_id: None,
        },
    )
    .unwrap();
    let server = std::thread::spawn(move || {
        let (mut stream, _) = listener.accept().unwrap();
        let mut buffer = [0; 4096];
        let _ = stream.read(&mut buffer).unwrap();
        let body = json!({"api_readiness_gate":"ready","contract_version":"9.0.0"}).to_string();
        write!(stream,"HTTP/1.1 200 OK\r\nContent-Type: application/json\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{}",body.len(),body).unwrap();
    });
    let supervisor = fixture.supervisor();
    supervisor.start().await;
    assert_eq!(supervisor.status().await.state, "failed");
    assert!(supervisor.backend().await.is_none());
    supervisor.stop().await;
    server.join().unwrap();
    assert!(process_alive(std::process::id()));
    // The fixture Drop must never treat this non-child authority as test-owned.
    std::fs::remove_file(fixture.profile.state_directory.join("runtime.json")).unwrap();
}

#[tokio::test]
async fn backend_authority_lock_survives_missing_discovery_without_a_second_service() {
    let fixture = Fixture::new();
    let owned = fixture.supervisor();
    owned.start().await;
    assert_eq!(owned.status().await.state, "ready");
    let record = owned.runtime().unwrap();
    let path = fixture.profile.state_directory.join("runtime.json");
    std::fs::remove_file(&path).unwrap();
    let contender = fixture.supervisor();
    contender.start().await;
    assert_eq!(contender.status().await.state, "failed");
    assert!(contender.backend().await.is_none());
    assert!(process_alive(record.pid));
    write_private(&path, &record).unwrap();
    contender.stop().await;
    assert!(process_alive(record.pid));
    owned.stop().await;
    assert!(!process_alive(record.pid));
}
