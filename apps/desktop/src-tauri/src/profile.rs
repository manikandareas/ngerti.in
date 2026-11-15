use anyhow::{Context, Result, bail};
use serde::{Deserialize, Serialize};
use std::{
    collections::HashMap,
    fs,
    path::{Path, PathBuf},
};

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Profile {
    pub version: u32,
    pub manager_id: String,
    #[serde(default)]
    pub mode: ProfileMode,
    pub server_origin: Option<String>,
    pub server_certificate: Option<PathBuf>,
    pub initial_path: Option<String>,
    #[serde(default)]
    pub state_directory: PathBuf,
    #[serde(default)]
    pub project_root: PathBuf,
    #[serde(default)]
    pub config_file: PathBuf,
    #[serde(default)]
    pub bun_executable: PathBuf,
    pub codex_executable: Option<PathBuf>,
    pub muse_executable: Option<PathBuf>,
    pub ui_port: u16,
}

#[derive(Clone, Copy, Debug, Default, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "kebab-case")]
pub enum ProfileMode {
    #[default]
    LocalDevelopment,
    Remote,
}

pub fn server_origin(value: &str) -> Result<url::Url> {
    let url = url::Url::parse(value)?;
    anyhow::ensure!(
        url.scheme() == "https"
            && url.origin().ascii_serialization() == value
            && url.username().is_empty()
            && url.password().is_none(),
        "The remote server must be one canonical HTTPS origin."
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
            .context("Run bun run setup:desktop before opening the application.")?;
        if value.version != 1
            || uuid::Uuid::parse_str(&value.manager_id).is_err()
            || value.ui_port < 1024
            || (value.mode == ProfileMode::LocalDevelopment
                && [
                    &value.state_directory,
                    &value.project_root,
                    &value.config_file,
                    &value.bun_executable,
                ]
                .iter()
                .any(|path| !path.is_absolute()))
            || [&value.codex_executable, &value.muse_executable]
                .iter()
                .any(|path| path.as_ref().is_some_and(|path| !path.is_absolute()))
        {
            bail!("The desktop profile is invalid. Run setup:desktop again.");
        }
        if value.mode == ProfileMode::Remote {
            server_origin(
                value
                    .server_origin
                    .as_deref()
                    .context("Select an HTTPS server.")?,
            )?;
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
        } else {
            anyhow::ensure!(
                value.server_origin.is_none()
                    && value.server_certificate.is_none()
                    && value.initial_path.is_none(),
                "Remote settings require an explicitly remote profile."
            );
        }
        Ok(value)
    }

    pub fn environment(&self, bun: &Path) -> Result<HashMap<String, String>> {
        let mut env: HashMap<String, String> = std::env::vars().collect();
        if self.config_file.exists() {
            for entry in dotenvy::from_path_iter(&self.config_file)? {
                let (key, value) = entry?;
                env.insert(key, value);
            }
        }
        env.remove("NODE_OPTIONS");
        env.insert("APP_ENV".into(), "development".into());
        env.insert(
            "NGERTIIN_STATE_DIR".into(),
            self.state_directory.to_string_lossy().into(),
        );
        env.insert(
            "NGERTIIN_CONFIG_FILE".into(),
            self.config_file.to_string_lossy().into(),
        );
        env.insert("NGERTIIN_DESKTOP_MANAGER".into(), self.manager_id.clone());
        let mut paths = vec![
            bun.parent().context("Invalid Bun path.")?.to_path_buf(),
            PathBuf::from("/opt/homebrew/bin"),
            PathBuf::from("/usr/local/bin"),
        ];
        if let Some(home) = dirs::home_dir() {
            paths.push(home.join(".bun/bin"));
        }
        paths.extend(std::env::split_paths(
            env.get("PATH")
                .map(String::as_str)
                .unwrap_or("/usr/bin:/bin"),
        ));
        env.insert(
            "PATH".into(),
            std::env::join_paths(paths)?.to_string_lossy().into(),
        );
        if let Some(path) = &self.codex_executable {
            env.insert(
                "NGERTIIN_CODEX_EXECUTABLE".into(),
                path.to_string_lossy().into(),
            );
        }
        if let Some(path) = &self.muse_executable {
            env.insert(
                "NGERTIIN_MUSE_EXECUTABLE".into(),
                path.to_string_lossy().into(),
            );
        }
        Ok(env)
    }
}

#[derive(Clone)]
pub struct RuntimePaths {
    pub root: PathBuf,
    pub bun: PathBuf,
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
        let root = if packaged {
            resource.join("runtime")
        } else {
            profile.project_root.clone()
        };
        let bun = if packaged {
            std::env::current_exe()?
                .parent()
                .context("Executable directory unavailable.")?
                .join("bun")
        } else {
            profile.bun_executable.clone()
        };
        let assets = if packaged {
            resource.join("web")
        } else {
            root.join("apps/web-client/dist")
        };
        if profile.mode == ProfileMode::LocalDevelopment
            && (!bun.is_file() || !root.join("apps/server/src/main.ts").is_file())
        {
            bail!("The bundled backend is missing. Rebuild the desktop application.");
        }
        Ok(Self {
            root,
            bun,
            assets,
            packaged,
        })
    }
}
