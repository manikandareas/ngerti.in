use crate::{
    log::Log,
    profile::{Profile, RuntimePaths, private_json},
};
use anyhow::{Context, Result};
use serde::{Deserialize, Serialize};
use serde_json::{Value, json};
use std::{
    collections::{HashMap, VecDeque},
    process::Stdio,
    sync::{
        Arc,
        atomic::{AtomicBool, Ordering},
    },
    time::{Duration, Instant},
};
use tokio::{
    io::AsyncReadExt,
    process::{Child, Command},
    sync::{Mutex, RwLock},
};

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq, Eq)]
pub struct RuntimeRecord {
    pub pid: u32,
    pub instance_id: String,
    pub owner_id: String,
    pub url: String,
    pub contract_version: String,
    pub manager_id: Option<String>,
}

#[derive(Clone, Debug, Serialize)]
pub struct Status {
    pub state: String,
    pub message: String,
    pub ownership: Option<String>,
}

struct State {
    status: Status,
    backend: Option<String>,
    record: Option<RuntimeRecord>,
}

pub struct Supervisor {
    pub remote: Option<Arc<crate::remote::Remote>>,
    pub profile: Profile,
    pub paths: RuntimePaths,
    pub log: Log,
    pub environment: HashMap<String, String>,
    client: reqwest::Client,
    state: RwLock<State>,
    transition: Mutex<()>,
    child: Mutex<Option<Child>>,
    retries: Mutex<VecDeque<Instant>>,
    closed: AtomicBool,
    views: Mutex<HashMap<String, (bool, u64)>>,
    human_revision: Mutex<Option<u64>>,
    pub visible: AtomicBool,
}

impl Supervisor {
    pub fn new(profile: Profile, paths: RuntimePaths, log: Log) -> Result<Arc<Self>> {
        let remote = if profile.mode == crate::profile::ProfileMode::Remote {
            Some(crate::remote::Remote::new(&profile)?)
        } else {
            None
        };
        let environment = if remote.is_some() {
            HashMap::new()
        } else {
            profile.environment(&paths.bun)?
        };
        let backend = remote.as_ref().map(|value| value.origin.clone());
        let state_name = if remote.is_some() {
            "ready"
        } else {
            "starting"
        };
        Ok(Arc::new(Self {
            remote,
            profile,
            paths,
            log,
            environment,
            client: reqwest::Client::builder()
                .no_proxy()
                .redirect(reqwest::redirect::Policy::none())
                .timeout(Duration::from_millis(2500))
                .build()?,
            state: RwLock::new(State {
                status: Status {
                    state: state_name.into(),
                    message: "Preparing your workspace…".into(),
                    ownership: None,
                },
                backend,
                record: None,
            }),
            transition: Mutex::new(()),
            child: Mutex::new(None),
            retries: Mutex::new(VecDeque::new()),
            closed: AtomicBool::new(false),
            views: Mutex::new(HashMap::new()),
            human_revision: Mutex::new(None),
            visible: AtomicBool::new(true),
        }))
    }

    pub fn token(&self) -> Result<String> {
        anyhow::ensure!(
            self.remote.is_none(),
            "Remote sessions use native authentication."
        );
        let installation: Value =
            private_json(&self.profile.state_directory.join("installation.json"))?;
        Ok(installation["token"]
            .as_str()
            .context("The installation token is unavailable.")?
            .into())
    }

    pub async fn status(&self) -> Status {
        self.state.read().await.status.clone()
    }
    pub async fn backend(&self) -> Option<String> {
        if let Some(remote) = &self.remote {
            return Some(remote.origin.clone());
        }
        self.state.read().await.backend.clone()
    }

    #[cfg(test)]
    pub async fn attach_for_test(&self, url: String) {
        self.ready(url, None).await;
    }

    pub fn runtime(&self) -> Option<RuntimeRecord> {
        let value: RuntimeRecord =
            private_json(&self.profile.state_directory.join("runtime.json")).ok()?;
        let installation: Value =
            private_json(&self.profile.state_directory.join("installation.json")).ok()?;
        if value.pid < 2
            || value.owner_id != installation["owner_id"].as_str()?
            || uuid::Uuid::parse_str(&value.instance_id).is_err()
            || !process_alive(value.pid)
        {
            return None;
        }
        Some(value)
    }

    async fn probe(&self, url: &str) -> bool {
        let Ok(parsed) = url::Url::parse(url) else {
            return false;
        };
        if parsed.scheme() != "http"
            || parsed.host_str() != Some("127.0.0.1")
            || parsed.path() != "/"
            || !parsed.username().is_empty()
            || parsed.password().is_some()
            || parsed.query().is_some()
            || parsed.fragment().is_some()
        {
            return false;
        }
        let Ok(token) = self.token() else {
            return false;
        };
        let Ok(response) = self
            .client
            .get(format!("{}/health/ready", url.trim_end_matches('/')))
            .bearer_auth(token)
            .send()
            .await
        else {
            return false;
        };
        if !response.status().is_success() {
            return false;
        }
        let Ok(value) = response.json::<Value>().await else {
            return false;
        };
        let parts: Vec<_> = value["contract_version"]
            .as_str()
            .unwrap_or("")
            .split('.')
            .collect();
        value["api_readiness_gate"] == "ready"
            && parts.len() == 3
            && ((parts[0] == "1" && parts[1].parse::<u32>().is_ok_and(|n| n >= 30))
                || (parts[0] == "2" && parts[1].parse::<u32>().is_ok()))
    }

    async fn ready(&self, url: String, record: Option<RuntimeRecord>) {
        let ownership = if record
            .as_ref()
            .is_some_and(|r| r.manager_id.as_deref() == Some(&self.profile.manager_id))
        {
            "managed"
        } else {
            "external"
        };
        let mut state = self.state.write().await;
        state.status = Status {
            state: "ready".into(),
            message: "Your workspace is ready.".into(),
            ownership: Some(ownership.into()),
        };
        state.backend = Some(url);
        state.record = record;
        self.log
            .event("desktop.backend.ready", json!({"ownership": ownership}));
    }

    async fn failed(&self, message: &str) {
        let mut state = self.state.write().await;
        state.status.state = "failed".into();
        state.status.message = message.into();
        state.backend = None;
    }

    pub async fn start(&self) {
        if self.remote.is_some() {
            return;
        }
        let _transition = self.transition.lock().await;
        if self.closed.load(Ordering::Acquire) || self.state.read().await.status.state == "ready" {
            return;
        }
        if let Err(error) = self.start_internal().await {
            self.log.event(
                "desktop.backend.start_failed",
                json!({"error": error.to_string()}),
            );
            if !self.closed.load(Ordering::Acquire) {
                self.failed("Your workspace could not start. Open Desktop Logs, then try again.")
                    .await;
            }
        }
    }

    async fn start_internal(&self) -> Result<()> {
        {
            let mut state = self.state.write().await;
            let ownership = state.status.ownership.clone();
            state.status = Status {
                state: "starting".into(),
                message: "Connecting to your workspace…".into(),
                ownership,
            };
        }
        if let Some(record) = self.runtime() {
            if self.probe(&record.url).await {
                self.ready(record.url.clone(), Some(record)).await;
            } else {
                self.failed(
                    "The existing workspace is not responding. Check its logs, then try again.",
                )
                .await;
            }
            return Ok(());
        }
        let legacy = self
            .environment
            .get("NGERTIIN_API_URL")
            .map(String::as_str)
            .unwrap_or("http://127.0.0.1:8000");
        if legacy != "disabled" && self.probe(legacy).await {
            self.ready(legacy.into(), None).await;
            return Ok(());
        }
        if self.closed.load(Ordering::Acquire) {
            return Ok(());
        }
        let mut command = Command::new(&self.paths.bun);
        command
            .arg(self.paths.root.join("apps/server/src/main.ts"))
            .current_dir(&self.paths.root)
            .envs(&self.environment)
            .env("NGERTIIN_PROJECT_ROOT", &self.paths.root)
            .env("NGERTIIN_PORT", "0")
            .stdin(Stdio::null())
            .stdout(Stdio::piped())
            .stderr(Stdio::piped());
        let mut child = command.spawn()?;
        let pid = child
            .id()
            .context("The backend did not provide a process identity.")?;
        if let Some(stdout) = child.stdout.take() {
            pipe_log(stdout, self.log.clone(), "backend.stdout");
        }
        if let Some(stderr) = child.stderr.take() {
            pipe_log(stderr, self.log.clone(), "backend.stderr");
        }
        *self.child.lock().await = Some(child);
        self.log
            .event("desktop.backend.starting", json!({"pid": pid}));
        let deadline = Instant::now() + Duration::from_secs(45);
        while !self.closed.load(Ordering::Acquire) && Instant::now() < deadline {
            if self
                .child
                .lock()
                .await
                .as_mut()
                .context("Backend ownership was lost.")?
                .try_wait()?
                .is_some()
            {
                break;
            }
            if let Some(record) = self.runtime()
                && record.pid == pid
                && self.probe(&record.url).await
            {
                self.ready(record.url.clone(), Some(record)).await;
                return Ok(());
            }
            tokio::time::sleep(Duration::from_millis(150)).await;
        }
        terminate(pid, false);
        self.wait_child(Duration::from_secs(5)).await;
        anyhow::bail!("The owned backend did not become ready before its deadline.")
    }

    async fn wait_child(&self, timeout: Duration) {
        let mut guard = self.child.lock().await;
        if let Some(mut child) = guard.take()
            && tokio::time::timeout(timeout, child.wait()).await.is_err()
        {
            let _ = child.kill().await;
            let _ = child.wait().await;
            self.log
                .event("desktop.backend.unclean_shutdown", json!({}));
        }
    }

    pub async fn check(&self) {
        if self.remote.is_some() {
            return;
        }
        if self.closed.load(Ordering::Acquire) {
            return;
        }
        let Ok(_transition) = self.transition.try_lock() else {
            return;
        };
        self.reap_exited().await;
        let (backend, record, managed) = {
            let state = self.state.read().await;
            (
                state.backend.clone(),
                state.record.clone(),
                state.status.ownership.as_deref() == Some("managed"),
            )
        };
        let backend = backend.or_else(|| record.as_ref().map(|r| r.url.clone()));
        if let Some(url) = backend
            && self.probe(&url).await
        {
            if self.status().await.state != "ready" {
                self.ready(url, record).await;
            }
            return;
        }
        if self.runtime().is_some() {
            self.failed("Reconnecting to your workspace…").await;
            return;
        }
        self.failed("The workspace connection was lost. Try reconnecting.")
            .await;
        if !managed {
            return;
        }
        let retry = {
            let mut retries = self.retries.lock().await;
            while retries
                .front()
                .is_some_and(|at| at.elapsed() > Duration::from_secs(60))
            {
                retries.pop_front();
            }
            if retries.len() >= 3 {
                self.log.event("desktop.backend.restart_limit", json!({}));
                return;
            }
            retries.push_back(Instant::now());
            retries.len()
        };
        tokio::time::sleep(Duration::from_millis(500 * retry as u64)).await;
        if let Err(error) = self.start_internal().await {
            self.log.event(
                "desktop.backend.restart_failed",
                json!({"error": error.to_string()}),
            );
            self.failed("Your workspace could not restart. Open Desktop Logs, then try again.")
                .await;
        }
    }

    pub async fn register_view(&self, value: &Value) {
        if let (Some(id), Some(interactive), Some(revision)) = (
            value["viewer_id"].as_str(),
            value["interactive"].as_bool(),
            value["control_revision"].as_u64(),
        ) && id.len() == 64
            && id.bytes().all(|b| b.is_ascii_hexdigit())
        {
            let mut views = self.views.lock().await;
            if views.len() < 40 {
                views.insert(id.into(), (interactive, revision));
            }
            drop(views);
            if interactive {
                *self.human_revision.lock().await = Some(revision);
            }
            if !self.visible.load(Ordering::Acquire) {
                self.release_views().await;
            }
        }
    }

    pub async fn forget_view(&self, id: &str) {
        self.views.lock().await.remove(id);
    }

    pub async fn release_views(&self) {
        if let Some(remote) = &self.remote {
            remote.release_views().await;
            return;
        }
        let views = { std::mem::take(&mut *self.views.lock().await) };
        let revision = self.human_revision.lock().await.take();
        let Some(backend) = self.backend().await else {
            return;
        };
        let Ok(token) = self.token() else {
            return;
        };
        // Revoke this host's issued tickets even when the renderer is suspended or has crashed.
        for id in views.keys() {
            let _ = self
                .client
                .delete(format!("{backend}/v1/machine/views/{id}"))
                .bearer_auth(&token)
                .send()
                .await;
        }
        if let Some(revision) = revision {
            let _ = self.release_human(&backend, &token, revision).await;
        }
    }

    async fn release_human(
        &self,
        backend: &str,
        token: &str,
        expected_revision: u64,
    ) -> Result<()> {
        let response = self
            .client
            .get(format!("{backend}/v1/machine"))
            .bearer_auth(token)
            .send()
            .await?
            .error_for_status()?
            .json::<Value>()
            .await?;
        let lease = &response["lease"];
        if lease["holder"] != "human"
            || lease["state"] != "active"
            || lease["revision"].as_u64() != Some(expected_revision)
        {
            return Ok(());
        }
        let response = self.client.post(format!("{backend}/v1/machine/control")).timeout(Duration::from_secs(6)).bearer_auth(token)
            .json(&json!({"command_id": uuid::Uuid::new_v4(), "operation": "release", "expected_revision": expected_revision})).send().await?;
        self.log.event(
            "desktop.control.release",
            json!({"status": response.status().as_u16()}),
        );
        response.error_for_status()?;
        Ok(())
    }

    pub async fn start_machine(&self) {
        if self.remote.is_some() {
            return;
        }
        if self.closed.load(Ordering::Acquire) {
            return;
        }
        let Ok(value) = private_json::<Value>(&self.profile.state_directory.join("machine.json"))
        else {
            return;
        };
        let Some(project) = value["project"].as_str() else {
            return;
        };
        if !project
            .strip_prefix("ngertiin-machine-")
            .is_some_and(|suffix| {
                !suffix.is_empty()
                    && suffix.len() <= 36
                    && suffix
                        .bytes()
                        .all(|byte| byte.is_ascii_hexdigit() || byte == b'-')
            })
        {
            return;
        }
        let result = tokio::time::timeout(
            Duration::from_secs(20),
            Command::new("docker")
                .args(["compose", "--env-file"])
                .arg(self.profile.state_directory.join("machine.env"))
                .args(["-p", project, "-f"])
                .arg(self.paths.root.join("infra/machine/compose.yaml"))
                .arg("start")
                .envs(&self.environment)
                .stdin(Stdio::null())
                .stdout(Stdio::null())
                .stderr(Stdio::null())
                .kill_on_drop(true)
                .status(),
        )
        .await;
        self.log.event(
            "desktop.machine.start",
            json!({"success": matches!(result, Ok(Ok(status)) if status.success())}),
        );
    }

    pub async fn stop(&self) {
        if let Some(remote) = &self.remote {
            remote.close().await;
            return;
        }
        self.closed.store(true, Ordering::Release);
        let _transition = self.transition.lock().await;
        self.release_views().await;
        let expected = self.state.read().await.record.clone();
        self.state.write().await.status.state = "stopping".into();
        if let Some(record) = self.runtime()
            && expected.as_ref() == Some(&record)
            && record.manager_id.as_deref() == Some(&self.profile.manager_id)
            && self.probe(&record.url).await
        {
            terminate(record.pid, false);
            let deadline = Instant::now() + Duration::from_secs(20);
            while Instant::now() < deadline && self.runtime().as_ref() == Some(&record) {
                self.reap_exited().await;
                tokio::time::sleep(Duration::from_millis(100)).await;
            }
            if self.runtime().as_ref() == Some(&record) {
                self.log.event(
                    "desktop.backend.unclean_shutdown",
                    json!({"pid": record.pid}),
                );
                terminate(record.pid, true);
            }
        }
        // A retained child is owned by this host, even if startup never published a record.
        if let Some(child) = self.child.lock().await.as_ref()
            && let Some(pid) = child.id()
        {
            terminate(pid, false);
        }
        self.wait_child(Duration::from_secs(5)).await;
        let mut state = self.state.write().await;
        state.backend = None;
        state.status.state = "stopped".into();
        state.status.message = "Workspace closed.".into();
    }

    async fn reap_exited(&self) {
        let mut child = self.child.lock().await;
        if let Some(process) = child.as_mut()
            && let Ok(Some(status)) = process.try_wait()
        {
            self.log
                .event("desktop.backend.exit", json!({"code":status.code()}));
            *child = None;
        }
    }
}

fn pipe_log(
    mut stream: impl tokio::io::AsyncRead + Unpin + Send + 'static,
    log: Log,
    event: &'static str,
) {
    tokio::spawn(async move {
        let mut bytes = [0u8; 4096];
        let mut line = Vec::with_capacity(4096);
        let mut truncated = false;
        while let Ok(count) = stream.read(&mut bytes).await {
            if count == 0 {
                break;
            }
            for byte in &bytes[..count] {
                if *byte == b'\n' {
                    log_backend_line(&log, event, &line, truncated);
                    line.clear();
                    truncated = false;
                } else if line.len() < 8192 {
                    line.push(*byte);
                } else {
                    truncated = true;
                }
            }
        }
        if !line.is_empty() || truncated {
            log_backend_line(&log, event, &line, truncated);
        }
    });
}

fn log_backend_line(log: &Log, event: &str, line: &[u8], truncated: bool) {
    // An incomplete JSON record cannot be safely redacted by field name.
    let detail = if truncated {
        json!({"message":"An oversized backend log record was omitted."})
    } else {
        serde_json::from_slice(line).unwrap_or_else(
            |_| json!({"message":"An unstructured backend log record was omitted."}),
        )
    };
    log.event(event, detail);
}

pub fn process_alive(pid: u32) -> bool {
    #[cfg(unix)]
    {
        unsafe {
            libc::kill(pid as i32, 0) == 0
                || std::io::Error::last_os_error().raw_os_error() == Some(libc::EPERM)
        }
    }
    #[cfg(not(unix))]
    {
        let _ = pid;
        false
    }
}

fn terminate(pid: u32, force: bool) {
    #[cfg(unix)]
    unsafe {
        libc::kill(
            pid as i32,
            if force { libc::SIGKILL } else { libc::SIGTERM },
        );
    }
    #[cfg(not(unix))]
    {
        let _ = (pid, force);
    }
}
