use gpui_kit::{AssetSource, SharedString};
use std::{borrow::Cow, path::PathBuf};

pub fn root() -> PathBuf {
    // dx creates an empty asset directory; hot-reload builds read the source assets.
    if cfg!(all(debug_assertions, feature = "hot-reload")) {
        return PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../../assets");
    }
    std::env::current_exe()
        .ok()
        .and_then(|path| path.parent().map(|p| p.join("../Resources/assets")))
        .filter(|path| path.is_dir())
        .unwrap_or_else(|| PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../../assets"))
}
pub struct Assets;
impl AssetSource for Assets {
    fn load(&self, path: &str) -> anyhow::Result<Option<Cow<'static, [u8]>>> {
        use std::path::{Component, Path};
        if Path::new(path)
            .components()
            .any(|part| !matches!(part, Component::Normal(_)))
        {
            return Ok(None);
        }
        let local = root().join(path);
        if local.is_file() {
            return Ok(Some(Cow::Owned(std::fs::read(local)?)));
        }
        gpui_kit::assets::Assets.load(path)
    }
    fn list(&self, path: &str) -> anyhow::Result<Vec<SharedString>> {
        gpui_kit::assets::Assets.list(path)
    }
}
