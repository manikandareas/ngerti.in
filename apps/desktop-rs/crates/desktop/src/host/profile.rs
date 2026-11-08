//! Private native-host configuration. Backend data may be shared; host state is distinct.
use anyhow::{Context, Result, bail};
use serde::{Deserialize, Serialize};
use std::{
    collections::HashMap,
    fs,
    path::{Path, PathBuf},
};

#[derive(Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub(super) struct Profile {
    pub version: u32,
    pub manager_id: String,
    pub state_directory: PathBuf,
    pub project_root: PathBuf,
    pub config_file: PathBuf,
    pub bun_executable: PathBuf,
    pub codex_executable: Option<PathBuf>,
    pub muse_executable: Option<PathBuf>,
}
pub(super) fn prepare_home(home: &Path) -> Result<()> {
    use std::os::unix::fs::MetadataExt;
    if !home.exists() {
        std::fs::DirBuilder::new()
            .recursive(true)
            .mode(0o700)
            .create(home)?;
    }
    let meta = fs::symlink_metadata(home)?;
    if !meta.is_dir() || meta.mode() & 0o077 != 0 || meta.uid() != unsafe { libc::geteuid() } {
        bail!("The native profile directory must belong to you with permissions 0700.");
    }
    Ok(())
}
use std::os::unix::fs::DirBuilderExt;
pub(super) fn private_json<T: serde::de::DeserializeOwned>(path: &Path) -> Result<T> {
    Ok(serde_json::from_str(&super::private_text(path, 65536)?)?)
}
pub(super) fn write_private<T: Serialize>(path: &Path, value: &T) -> Result<()> {
    use std::{io::Write, os::unix::fs::OpenOptionsExt};
    let temporary = path.with_extension(format!("{}.tmp", uuid::Uuid::new_v4()));
    let result = (|| -> Result<()> {
        let mut file = fs::OpenOptions::new()
            .write(true)
            .create_new(true)
            .mode(0o600)
            .open(&temporary)?;
        file.write_all(&serde_json::to_vec_pretty(value)?)?;
        file.sync_all()?;
        fs::rename(&temporary, path)?;
        fs::File::open(path.parent().context("Profile directory unavailable")?)?.sync_all()?;
        Ok(())
    })();
    if result.is_err() {
        let _ = fs::remove_file(temporary);
    }
    result
}
impl Profile {
    pub fn load_or_import(home: &Path) -> Result<Option<Self>> {
        let path = home.join("profile.json");
        let value: Self = if path.try_exists()? {
            private_json(&path)?
        } else {
            let source = std::env::var_os("NGERTIIN_DESKTOP_HOME")
                .map(PathBuf::from)
                .unwrap_or(
                    dirs::data_dir()
                        .context("Application data unavailable")?
                        .join("Ngertiin Tauri"),
                )
                .join("profile.json");
            if !source.is_file() {
                return Ok(None);
            }
            let mut value: Self = private_json(&source)?;
            value.manager_id = uuid::Uuid::new_v4().to_string();
            value.validate()?;
            write_private(&path, &value)?;
            value
        };
        value.validate()?;
        Ok(Some(value))
    }
    fn validate(&self) -> Result<()> {
        if self.version != 1
            || uuid::Uuid::parse_str(&self.manager_id).is_err()
            || [
                &self.state_directory,
                &self.project_root,
                &self.config_file,
                &self.bun_executable,
            ]
            .iter()
            .any(|p| !p.is_absolute())
            || [&self.codex_executable, &self.muse_executable]
                .iter()
                .any(|p| p.as_ref().is_some_and(|p| !p.is_absolute()))
        {
            bail!("The native host profile is invalid. Check profile.json, then relaunch.");
        }
        Ok(())
    }
    pub fn environment(&self, bun: &Path) -> Result<HashMap<String, String>> {
        let mut env: HashMap<_, _> = std::env::vars().collect();
        if self.config_file.exists() {
            for entry in dotenvy::from_path_iter(&self.config_file)? {
                let (k, v) = entry?;
                env.insert(k, v);
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
            bun.parent().context("Invalid Bun path")?.to_path_buf(),
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
        for (key, path) in [
            ("NGERTIIN_CODEX_EXECUTABLE", &self.codex_executable),
            ("NGERTIIN_MUSE_EXECUTABLE", &self.muse_executable),
        ] {
            if let Some(path) = path {
                env.insert(key.into(), path.to_string_lossy().into());
            }
        }
        Ok(env)
    }
}
pub(super) struct RuntimePaths {
    pub root: PathBuf,
    pub bun: PathBuf,
}
impl RuntimePaths {
    pub fn resolve(profile: &Profile) -> Result<Self> {
        if !profile.bun_executable.is_file()
            || !profile
                .project_root
                .join("apps/server/src/main.ts")
                .is_file()
        {
            bail!(
                "The configured backend is missing. Check the native host profile, then relaunch."
            );
        }
        Ok(Self {
            root: profile.project_root.clone(),
            bun: profile.bun_executable.clone(),
        })
    }
}
