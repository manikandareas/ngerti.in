use anyhow::{Context, Result, bail};
use serde::{Deserialize, Serialize};
use std::{
    fs,
    path::{Path, PathBuf},
};

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Profile {
    pub version: u32,
    pub manager_id: String,
    pub server_origin: String,
    pub server_certificate: Option<PathBuf>,
    pub initial_path: Option<String>,
    pub project_root: PathBuf,
    pub ui_port: u16,
}

pub fn server_origin(value: &str) -> Result<url::Url> {
    let url = url::Url::parse(value)?;
    let local_development = cfg!(debug_assertions)
        && url.scheme() == "http"
        && url.host_str() == Some("127.0.0.1")
        && url.port().is_some();
    anyhow::ensure!(
        (url.scheme() == "https" || local_development)
            && url.origin().ascii_serialization() == value
            && url.username().is_empty()
            && url.password().is_none(),
        "Select a canonical HTTPS server; debug builds also support explicit IPv4 loopback HTTP."
    );
    Ok(url)
}

pub fn desktop_home() -> Result<PathBuf> {
    if let Some(path) = std::env::var_os("NGERTIIN_DESKTOP_HOME") {
        let path = PathBuf::from(path);
        if !path.is_absolute() {
            bail!("The desktop home must be an absolute path.");
        }
        return Ok(path);
    }
    Ok(dirs::data_dir()
        .context("The application data directory is unavailable.")?
        .join("Ngertiin Tauri"))
}

pub fn prepare_home(home: &Path) -> Result<()> {
    if !home.exists() {
        fs::create_dir_all(home)?;
        #[cfg(unix)]
        {
            use std::os::unix::fs::PermissionsExt;
            fs::set_permissions(home, fs::Permissions::from_mode(0o700))?;
        }
    }
    let meta = fs::symlink_metadata(home)?;
    if !meta.is_dir() || meta.file_type().is_symlink() {
        bail!("The desktop directory must be private.");
    }
    #[cfg(unix)]
    {
        use std::os::unix::fs::MetadataExt;
        if meta.mode() & 0o077 != 0 || meta.uid() != unsafe { libc::geteuid() } {
            bail!("The desktop directory must belong to you with permissions 0700.");
        }
    }
    Ok(())
}

pub fn private_json<T: serde::de::DeserializeOwned>(path: &Path) -> Result<T> {
    let meta = fs::symlink_metadata(path)?;
    if !meta.is_file() || meta.file_type().is_symlink() || meta.len() > 65536 {
        bail!("Private configuration has an invalid format.");
    }
    #[cfg(unix)]
    {
        use std::os::unix::fs::MetadataExt;
        if meta.mode() & 0o077 != 0 || meta.uid() != unsafe { libc::geteuid() } {
            bail!("Private configuration has invalid permissions.");
        }
    }
    Ok(serde_json::from_slice(&fs::read(path)?)?)
}

pub fn write_private<T: Serialize>(path: &Path, value: &T) -> Result<()> {
    use std::io::Write;
    let temporary = path.with_extension(format!("{}.tmp", uuid::Uuid::new_v4()));
    let mut options = fs::OpenOptions::new();
    options.write(true).create_new(true);
    #[cfg(unix)]
    {
        use std::os::unix::fs::OpenOptionsExt;
        options.mode(0o600);
    }
    let result = (|| -> Result<()> {
        let mut file = options.open(&temporary)?;
        file.write_all(&serde_json::to_vec_pretty(value)?)?;
        file.sync_all()?;
        fs::rename(&temporary, path)?;
        Ok(())
    })();
    if result.is_err() {
        let _ = fs::remove_file(temporary);
    }
    result
}

impl Profile {
    pub fn load(home: &Path) -> Result<Self> {
        let value: Self = private_json(&home.join("profile.json"))
            .context("Run bun run setup:desktop to configure an account-authenticated server.")?;
        anyhow::ensure!(
            value.version == 2
                && uuid::Uuid::parse_str(&value.manager_id).is_ok()
                && value.ui_port >= 1024,
            "The desktop profile is invalid. Run setup:desktop again."
        );
        server_origin(&value.server_origin)?;
        anyhow::ensure!(
            value
                .server_certificate
                .as_ref()
                .is_none_or(|path| path.is_absolute()),
            "The server certificate path must be absolute."
        );
        if let Some(path) = &value.initial_path {
            let id = path
                .strip_prefix("/invitations/")
                .context("Invalid invitation handoff.")?;
            uuid::Uuid::parse_str(id).context("Invalid invitation handoff.")?;
        }
        Ok(value)
    }
}

#[derive(Clone)]
pub struct RuntimePaths {
    pub assets: PathBuf,
    pub packaged: bool,
}
impl RuntimePaths {
    pub fn resolve(profile: &Profile, resource: &Path) -> Result<Self> {
        let executable = std::env::current_exe()?;
        let packaged = executable
            .parent()
            .is_some_and(|path| path.ends_with("Contents/MacOS"))
            && resource.join("web/index.html").is_file();
        let assets = if packaged {
            resource.join("web")
        } else {
            profile.project_root.join("apps/web-client/dist")
        };
        Ok(Self { assets, packaged })
    }
}
