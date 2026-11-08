use std::path::{Path, PathBuf};
pub(crate) mod avatar;
pub(crate) mod composer;
mod compounds;
pub(crate) mod content;
mod controls;
pub(crate) mod measurement;
pub(crate) mod messages;
mod probes;
mod snapshot;

pub struct ProbeAssets {
    pub avatar: [PathBuf; 2],
    pub pdf: PathBuf,
    pub html: crate::models::html::PreparedHtml,
    pub pdf_cases: Vec<(String, PathBuf)>,
    pub format_icons: Vec<(String, PathBuf)>,
}
impl ProbeAssets {
    /// Bounded preparation before the UI loop; later texture pipelines run on bounded workers.
    pub fn prepare(profile: &Path) -> anyhow::Result<Self> {
        use std::os::unix::fs::DirBuilderExt;
        let directory = profile.join("foundation-probes-v1");
        std::fs::DirBuilder::new()
            .recursive(true)
            .mode(0o700)
            .create(&directory)?;
        let avatar = [directory.join("fur-0.png"), directory.join("fur-22.png")];
        for (file, angle) in avatar.iter().zip([0., 22.5]) {
            let svg = ngertiin_avatar::texture_svg("tobi-circle", angle);
            let tree = resvg::usvg::Tree::from_str(&svg, &resvg::usvg::Options::default())?;
            let mut pixmap = resvg::tiny_skia::Pixmap::new(768, 768).expect("Bounded texture size");
            resvg::render(
                &tree,
                resvg::tiny_skia::Transform::identity(),
                &mut pixmap.as_mut(),
            );
            pixmap.save_png(file)?;
        }
        let original = crate::platform::assets::root().join("format-icons");
        let examples: std::collections::BTreeMap<String, String> =
            serde_json::from_slice(&std::fs::read(original.join("examples.json"))?)?;
        let mut format_icons = Vec::new();
        for (name, file) in examples {
            let tree = resvg::usvg::Tree::from_str(
                &std::fs::read_to_string(original.join(&file))?,
                &resvg::usvg::Options::default(),
            )?;
            let mut pixmap = resvg::tiny_skia::Pixmap::new(72, 72).expect("Bounded icon size");
            resvg::render(
                &tree,
                resvg::tiny_skia::Transform::from_scale(
                    72. / tree.size().width(),
                    72. / tree.size().height(),
                ),
                &mut pixmap.as_mut(),
            );
            let path = directory.join(format!("{file}.png"));
            pixmap.save_png(&path)?;
            format_icons.push((name, path));
        }
        let mut pdf_cases = vec![(
            "Two pages".into(),
            crate::platform::assets::root().join("probe.pdf"),
        )];
        for (name, bytes) in [
            (
                "200 pages",
                include_bytes!("../../../../verification/nma-067/pdf/long.pdf").as_slice(),
            ),
            (
                "Protected",
                include_bytes!("../../../../verification/nma-067/pdf/protected.pdf").as_slice(),
            ),
            (
                "501 pages",
                include_bytes!("../../../../verification/nma-067/pdf/page-limit.pdf").as_slice(),
            ),
            ("Malformed", b"not a PDF".as_slice()),
        ] {
            let path = directory.join(format!("{name}.pdf"));
            std::fs::write(&path, bytes)?;
            pdf_cases.push((name.into(), path));
        }
        let oversized = directory.join("oversized.pdf");
        std::fs::File::create(&oversized)?.set_len(16 * 1024 * 1024 + 1)?;
        pdf_cases.push(("Oversized".into(), oversized));
        Ok(Self {
            pdf_cases,
            html: crate::models::html::prepare(
                include_bytes!("../../../../assets/static-document.html"),
                false,
                60,
            )?,
            avatar,
            pdf: crate::platform::assets::root().join("probe.pdf"),
            format_icons,
        })
    }
}
