use gpui_kit::{AssetSource, SharedString};
use std::{borrow::Cow, path::PathBuf};

pub struct ExperimentAssets(pub PathBuf);

pub fn asset_root() -> PathBuf {
    let bundled = std::env::current_exe().ok().and_then(|path| {
        path.parent()
            .map(|parent| parent.join("../Resources/assets"))
    });
    bundled
        .filter(|path| path.is_dir())
        .unwrap_or_else(|| PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("assets"))
}

impl AssetSource for ExperimentAssets {
    fn load(&self, path: &str) -> anyhow::Result<Option<Cow<'static, [u8]>>> {
        if !path.contains("..") {
            let file = self.0.join(path);
            if file.is_file() {
                return Ok(Some(Cow::Owned(std::fs::read(file)?)));
            }
        }
        gpui_kit::assets::Assets.load(path)
    }
    fn list(&self, path: &str) -> anyhow::Result<Vec<SharedString>> {
        gpui_kit::assets::Assets.list(path)
    }
}
