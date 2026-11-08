//! Native host supervision and private installation transport.
mod instance;
mod navigation;
pub(crate) use navigation::is_external_url;
pub(crate) mod lifecycle;
mod log;
mod profile;
mod supervisor;
#[cfg(target_os = "macos")]
mod tray;
pub(crate) mod views;
use std::sync::{Arc, OnceLock};
static SERVICE: OnceLock<Service> = OnceLock::new();
static STARTUP_ERROR: OnceLock<String> = OnceLock::new();
struct Service {
    runtime: tokio::runtime::Runtime,
    supervisor: Arc<supervisor::Supervisor>,
}
use anyhow::{Context, bail};
use std::path::PathBuf;

#[derive(serde::Deserialize)]
#[serde(deny_unknown_fields)]
struct Attachment {
    origin: String,
    token_file: PathBuf,
    #[serde(default)]
    thread_id: Option<uuid::Uuid>,
}

fn private_text(path: &std::path::Path, limit: u64) -> anyhow::Result<String> {
    let metadata = std::fs::symlink_metadata(path).context(
        "Cannot read private attachment configuration. Select a private 0600 file, then retry.",
    )?;
    use std::os::unix::fs::MetadataExt;
    if !metadata.is_file()
        || metadata.len() > limit
        || metadata.mode() & 0o077 != 0
        || metadata.uid() != unsafe { libc::geteuid() }
    {
        bail!("Attachment configuration must be a bounded regular file with mode 0600");
    }
    Ok(std::fs::read_to_string(path)?)
}

pub fn profile_root() -> anyhow::Result<PathBuf> {
    let home = std::env::var_os("HOME").context("HOME is unavailable")?;
    // No override can accidentally point at the existing Tauri profile.
    let root = PathBuf::from(home).join("Library/Application Support/Ngertiin Rust Development");
    if let Ok(profile) = std::env::var("NGERTIIN_RS_PROFILE") {
        if profile.is_empty()
            || profile.len() > 64
            || !profile
                .bytes()
                .all(|byte| byte.is_ascii_alphanumeric() || matches!(byte, b'-' | b'_'))
        {
            bail!(
                "Select a native profile name using 1–64 letters, digits, hyphens or underscores."
            );
        }
        return Ok(root.join("profiles").join(profile));
    }
    Ok(root)
}

fn attachment() -> anyhow::Result<Option<Attachment>> {
    let attachment = if let Some(origin) = std::env::var_os("NGERTIIN_RS_BACKEND_ORIGIN") {
        Attachment {
            origin: origin.to_string_lossy().into_owned(),
            token_file: PathBuf::from(
                std::env::var_os("NGERTIIN_RS_TOKEN_FILE")
                    .context("Set NGERTIIN_RS_TOKEN_FILE to a private installation-token file")?,
            ),
            thread_id: std::env::var("NGERTIIN_RS_THREAD_ID")
                .ok()
                .map(|s| s.parse())
                .transpose()?,
        }
    } else {
        let path = profile_root()?.join("attachment.json");
        if !path.try_exists()? {
            return Ok(None);
        }
        serde_json::from_str::<Attachment>(&private_text(&path, 65536)?)
            .context("Invalid read-only attachment.json. Check origin, token_file and thread_id, then retry.")?
    };
    if !attachment.token_file.is_absolute() {
        bail!("Attachment token_file must be an absolute path");
    }
    Ok(Some(attachment))
}
pub fn snapshot_client() -> anyhow::Result<Option<(ngertiin_client::ReadOnlyClient, uuid::Uuid)>> {
    let Some(attachment) = attachment()? else {
        return Ok(None);
    };
    let bearer = private_text(&attachment.token_file, 8192)?;
    Ok(Some((
        ngertiin_client::ReadOnlyClient::new(&attachment.origin, bearer.trim().into())?,
        attachment
            .thread_id
            .context("Select a thread_id for the read-only gallery")?,
    )))
}
pub fn api_client() -> anyhow::Result<Option<(ngertiin_client::ApiClient, Option<uuid::Uuid>)>> {
    if let Some(error) = STARTUP_ERROR.get() {
        bail!("{error}");
    }
    let Some(attachment) = attachment()? else {
        if let Some(service) = SERVICE.get() {
            let url = service.runtime.block_on(service.supervisor.backend());
            if let Some(url) = url {
                return Ok(Some((
                    ngertiin_client::ApiClient::new(&url, service.supervisor.token()?)?,
                    None,
                )));
            }
            return Ok(None);
        }
        return existing_desktop_backend();
    };
    let bearer = private_text(&attachment.token_file, 8192)?;
    Ok(Some((
        ngertiin_client::ApiClient::new(&attachment.origin, bearer.trim().into())?,
        attachment.thread_id,
    )))
}

/// Reuse the configured installation, never start a second backend. The Tauri
/// host retains supervision; private files supply the same owner credential.
fn existing_desktop_backend()
-> anyhow::Result<Option<(ngertiin_client::ApiClient, Option<uuid::Uuid>)>> {
    #[derive(serde::Deserialize)]
    #[serde(rename_all = "camelCase")]
    struct Profile {
        state_directory: PathBuf,
    }
    #[derive(serde::Deserialize)]
    struct Runtime {
        url: String,
        owner_id: uuid::Uuid,
        contract_version: String,
    }
    #[derive(serde::Deserialize)]
    struct Installation {
        owner_id: uuid::Uuid,
        token: String,
    }
    let home = match std::env::var_os("NGERTIIN_DESKTOP_HOME") {
        Some(path) => PathBuf::from(path),
        None => PathBuf::from(std::env::var_os("HOME").context("HOME is unavailable")?)
            .join("Library/Application Support/Ngertiin Tauri"),
    };
    if !home.is_absolute() {
        bail!("Select an absolute desktop profile directory.");
    }
    if !home.join("profile.json").is_file() {
        return Ok(None);
    }
    let profile: Profile = serde_json::from_str(&private_text(&home.join("profile.json"), 65536)?)?;
    if !profile.state_directory.is_absolute() {
        bail!("The desktop installation directory must be absolute.");
    }
    let path = profile.state_directory.join("runtime.json");
    if !path.is_file() {
        return Ok(None);
    }
    let runtime: Runtime = serde_json::from_str(&private_text(&path, 65536)?)?;
    let installation: Installation = serde_json::from_str(&private_text(
        &profile.state_directory.join("installation.json"),
        65536,
    )?)?;
    if runtime.owner_id != installation.owner_id {
        bail!("The running backend belongs to another installation.");
    }
    if runtime.contract_version != ngertiin_client::CONTRACT_VERSION {
        bail!("The running backend is incompatible. Restart the current desktop backend.");
    }
    Ok(Some((
        ngertiin_client::ApiClient::new(&runtime.url, installation.token)?,
        None,
    )))
}

/// Start supervision on its own runtime; rendering never waits for backend startup.
pub(crate) fn start() -> anyhow::Result<Option<instance::Instance>> {
    let home = profile_root()?;
    profile::prepare_home(&home)?;
    let Some(instance) = instance::Instance::acquire(&home)? else {
        return Ok(None);
    };
    if let Err(error) = start_service(&home) {
        let _ = STARTUP_ERROR.set(error.to_string());
    }
    Ok(Some(instance))
}
fn start_service(home: &std::path::Path) -> anyhow::Result<()> {
    if attachment()?.is_none()
        && let Some(profile) = profile::Profile::load_or_import(home)?
    {
        let paths = profile::RuntimePaths::resolve(&profile)?;
        let environment = profile.environment(&paths.bun)?;
        let mut secrets: Vec<_> = environment
            .into_iter()
            .filter(|(key, _)| {
                ["key", "token", "secret", "pass"]
                    .iter()
                    .any(|part| key.to_lowercase().contains(part))
            })
            .map(|(_, v)| v)
            .collect();
        if let Ok(value) = profile::private_json::<serde_json::Value>(
            &profile.state_directory.join("installation.json"),
        ) && let Some(token) = value["token"].as_str()
        {
            secrets.push(token.into());
        }
        let runtime = tokio::runtime::Builder::new_multi_thread()
            .worker_threads(2)
            .enable_all()
            .build()?;
        let _guard = runtime.enter();
        let supervisor = supervisor::Supervisor::new(profile, paths, log::Log::new(home, secrets))?;
        let running = supervisor.clone();
        runtime.spawn(async move {
            running.start().await;
            running.start_machine().await;
            loop {
                tokio::time::sleep(std::time::Duration::from_secs(5)).await;
                running.check().await;
                if running.status().await.state == "stopped" {
                    break;
                }
            }
        });
        drop(_guard);
        SERVICE
            .set(Service {
                runtime,
                supervisor,
            })
            .map_err(|_| anyhow::anyhow!("Native supervisor already started"))?;
    }
    Ok(())
}
pub(crate) fn stop() {
    if let Some(service) = SERVICE.get() {
        service.runtime.block_on(service.supervisor.stop());
    }
}
pub(crate) fn status_message() -> String {
    if let Some(error) = STARTUP_ERROR.get() {
        return error.clone();
    }
    SERVICE
        .get()
        .map(|s| s.runtime.block_on(s.supervisor.status()).message)
        .unwrap_or_else(|| {
            "Select a local backend in the private attachment.json configuration, then reconnect."
                .into()
        })
}

#[cfg(test)]
mod tests;

pub(crate) fn write_diagnostic(
    path: &std::path::Path,
    value: &serde_json::Value,
) -> anyhow::Result<()> {
    profile::write_private(path, value)
}
