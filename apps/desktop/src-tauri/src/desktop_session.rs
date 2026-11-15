use crate::{
    log::Log,
    profile::{Profile, RuntimePaths},
    remote::Remote,
};
use anyhow::Result;
use serde::Serialize;
use std::sync::{Arc, atomic::AtomicBool};

#[derive(Clone, Debug, Serialize)]
pub struct Status {
    pub state: &'static str,
    pub message: &'static str,
}

/// Client-owned sessions and views. The server lifecycle belongs to its operator or dev launcher.
pub struct DesktopSession {
    pub remote: Arc<Remote>,
    pub profile: Profile,
    pub paths: RuntimePaths,
    pub log: Log,
    pub visible: AtomicBool,
}
impl DesktopSession {
    pub fn new(profile: Profile, paths: RuntimePaths, log: Log) -> Result<Arc<Self>> {
        Ok(Arc::new(Self {
            remote: Remote::new(&profile)?,
            profile,
            paths,
            log,
            visible: AtomicBool::new(true),
        }))
    }
    pub async fn status(&self) -> Status {
        Status {
            state: "ready",
            message: "Sign in to your workspace.",
        }
    }
    pub async fn release_views(&self) {
        self.remote.release_views().await;
    }
    pub async fn stop(&self) {
        self.remote.close().await;
    }
}
