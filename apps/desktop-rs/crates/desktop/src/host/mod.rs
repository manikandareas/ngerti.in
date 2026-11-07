//! Attach-only host. Process ownership/supervision belongs to NMA-070.
use anyhow::{Context, bail};
use std::path::PathBuf;

#[derive(serde::Deserialize)]
#[serde(deny_unknown_fields)]
struct Attachment {
    origin: String,
    token_file: PathBuf,
    thread_id: uuid::Uuid,
}

fn private_text(path: &std::path::Path, limit: u64) -> anyhow::Result<String> {
    let metadata = std::fs::symlink_metadata(path).context(
        "Cannot read private attachment configuration. Select a private 0600 file, then retry.",
    )?;
    use std::os::unix::fs::PermissionsExt;
    if !metadata.is_file() || metadata.len() > limit || metadata.permissions().mode() & 0o077 != 0 {
        bail!("Attachment configuration must be a bounded regular file with mode 0600");
    }
    Ok(std::fs::read_to_string(path)?)
}

pub fn profile_root() -> anyhow::Result<PathBuf> {
    let home = std::env::var_os("HOME").context("HOME is unavailable")?;
    // No override can accidentally point at the existing Tauri profile.
    Ok(PathBuf::from(home).join("Library/Application Support/Ngertiin Rust Development"))
}

pub fn snapshot_client() -> anyhow::Result<Option<(ngertiin_client::ReadOnlyClient, uuid::Uuid)>> {
    let attachment = if let Some(origin) = std::env::var_os("NGERTIIN_RS_BACKEND_ORIGIN") {
        Attachment {
            origin: origin.to_string_lossy().into_owned(),
            token_file: PathBuf::from(
                std::env::var_os("NGERTIIN_RS_TOKEN_FILE")
                    .context("Set NGERTIIN_RS_TOKEN_FILE to a private installation-token file")?,
            ),
            thread_id: std::env::var("NGERTIIN_RS_THREAD_ID")
                .context("Set NGERTIIN_RS_THREAD_ID to an existing thread UUID")?
                .parse()?,
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
    let bearer = private_text(&attachment.token_file, 8192)?;
    let client = ngertiin_client::ReadOnlyClient::new(&attachment.origin, bearer.trim().into())?;
    Ok(Some((client, attachment.thread_id)))
}
