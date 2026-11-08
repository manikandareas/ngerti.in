//! Original-byte exports for native previews; call on a preparation worker.
use std::path::PathBuf;
pub enum Original {
    Bytes(Vec<u8>),
    File(PathBuf),
}
impl From<Vec<u8>> for Original {
    fn from(bytes: Vec<u8>) -> Self {
        Self::Bytes(bytes)
    }
}
pub fn save_original(name: &str, original: Original) -> anyhow::Result<PathBuf> {
    anyhow::ensure!(
        !name.is_empty() && !name.contains(['/', '\\']),
        "Invalid export filename."
    );
    let directory = crate::host::profile_root()?.join("component-exports");
    std::fs::create_dir_all(&directory)?;
    let path = directory.join(format!("{}-{name}", uuid::Uuid::new_v4()));
    match original {
        Original::Bytes(bytes) => std::fs::write(&path, bytes)?,
        Original::File(source) => {
            std::fs::copy(source, &path)?;
        }
    }
    Ok(path)
}
