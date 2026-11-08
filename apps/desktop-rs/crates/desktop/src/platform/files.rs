//! Original-byte exports to Downloads; call on a preparation worker.
use std::{
    io::{Read, Write},
    path::{Path, PathBuf},
};
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
    let directory = dirs::download_dir()
        .ok_or_else(|| anyhow::anyhow!("The Downloads folder is unavailable."))?;
    save_in(&directory, name, original)
}
fn save_in(directory: &Path, name: &str, original: Original) -> anyhow::Result<PathBuf> {
    use std::os::unix::fs::OpenOptionsExt;
    let name: String = Path::new(name)
        .file_name()
        .and_then(|n| n.to_str())
        .unwrap_or("download")
        .chars()
        .filter(|c| !c.is_control() && !['/', '\\', ':'].contains(c))
        .take(180)
        .collect();
    let name = if name.is_empty() || name == "." || name == ".." {
        "download"
    } else {
        &name
    };
    let file = Path::new(name);
    let stem = file
        .file_stem()
        .and_then(|n| n.to_str())
        .unwrap_or("download");
    let ext = file
        .extension()
        .and_then(|n| n.to_str())
        .map(|n| format!(".{n}"))
        .unwrap_or_default();
    for ix in 0..1000 {
        let path = directory.join(if ix == 0 {
            name.to_string()
        } else {
            format!("{stem} ({ix}){ext}")
        });
        let result = std::fs::OpenOptions::new()
            .write(true)
            .create_new(true)
            .mode(0o600)
            .open(&path);
        let mut destination = match result {
            Ok(file) => file,
            Err(e) if e.kind() == std::io::ErrorKind::AlreadyExists => continue,
            Err(e) => return Err(e.into()),
        };
        let result = (|| -> anyhow::Result<()> {
            match &original {
                Original::Bytes(bytes) => destination.write_all(bytes)?,
                Original::File(source) => {
                    let mut source = std::fs::File::open(source)?;
                    let mut bytes = [0u8; 65536];
                    loop {
                        let count = source.read(&mut bytes)?;
                        if count == 0 {
                            break;
                        }
                        destination.write_all(&bytes[..count])?;
                    }
                }
            }
            destination.sync_all()?;
            Ok(())
        })();
        if let Err(error) = result {
            drop(destination);
            let _ = std::fs::remove_file(&path);
            return Err(error);
        }
        return Ok(path);
    }
    anyhow::bail!(
        "Too many files share this download name. Rename the existing downloads, then retry."
    )
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn original_downloads_preserve_bytes_and_never_overwrite_a_collision() {
        let root = std::env::temp_dir().join(format!("ngertiin-export-{}", uuid::Uuid::new_v4()));
        std::fs::create_dir(&root).unwrap();
        let bytes = vec![0, 255, 10, 13, 42];
        let first = save_in(&root, "../result.bin", bytes.clone().into()).unwrap();
        let second = save_in(&root, "result.bin", Original::File(first.clone())).unwrap();
        assert_ne!(first, second);
        assert_eq!(second.file_name().unwrap(), "result (1).bin");
        assert_eq!(std::fs::read(first).unwrap(), bytes);
        assert_eq!(std::fs::read(second).unwrap(), bytes);
        std::fs::remove_dir_all(root).unwrap();
    }
}
