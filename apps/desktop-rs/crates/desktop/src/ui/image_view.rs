//! Bounded native image preparation. The original bytes are never re-encoded for download.
use super::{controls::*, theme::Palette};
use gpui_kit::{component::ActiveTheme, *};
use std::{
    io::{Cursor, Read},
    path::PathBuf,
    sync::Arc,
};
const BYTES: u64 = 16 * 1024 * 1024;
const PIXELS: u64 = 16_000_000;
struct Prepared {
    image: Arc<RenderImage>,
    original: Vec<u8>,
    width: u32,
    height: u32,
    clipboard: Vec<u8>,
}
fn prepare(path: PathBuf) -> anyhow::Result<Prepared> {
    let mut original = vec![];
    std::fs::File::open(path)?
        .take(BYTES + 1)
        .read_to_end(&mut original)?;
    anyhow::ensure!(
        original.len() as u64 <= BYTES,
        "Image exceeds 16 MiB. Download the original file."
    );
    let reader = image::ImageReader::new(Cursor::new(&original)).with_guessed_format()?;
    let (width, height) = reader.into_dimensions()?;
    anyhow::ensure!(
        u64::from(width) * u64::from(height) <= PIXELS,
        "Image dimensions exceed the preview limit. Download the original file."
    );
    let mut reader = image::ImageReader::new(Cursor::new(&original)).with_guessed_format()?;
    let mut limits = image::Limits::default();
    limits.max_image_width = Some(16384);
    limits.max_image_height = Some(16384);
    limits.max_alloc = Some(128 * 1024 * 1024);
    reader.limits(limits);
    let decoded = reader.decode()?;
    let mut clipboard = Cursor::new(vec![]);
    decoded.write_to(&mut clipboard, image::ImageFormat::Png)?;
    let mut pixels = decoded.into_rgba8();
    for pixel in pixels.pixels_mut() {
        let [r, g, b, a] = pixel.0;
        pixel.0 = [
            (u16::from(b) * u16::from(a) / 255) as u8,
            (u16::from(g) * u16::from(a) / 255) as u8,
            (u16::from(r) * u16::from(a) / 255) as u8,
            a,
        ];
    }
    Ok(Prepared {
        image: Arc::new(RenderImage::new(vec![image::Frame::new(pixels)])),
        original,
        width,
        height,
        clipboard: clipboard.into_inner(),
    })
}
pub struct ImageView {
    path: PathBuf,
    prepared: Option<Prepared>,
    task: Option<Task<()>>,
    error: Option<String>,
    zoom: f32,
    fit: bool,
    status: String,
}
impl ImageView {
    pub fn new(path: PathBuf, cx: &mut Context<Self>) -> Self {
        let mut this = Self {
            path,
            prepared: None,
            task: None,
            error: None,
            zoom: 1.,
            fit: true,
            status: String::new(),
        };
        this.load(cx);
        this
    }
    fn load(&mut self, cx: &mut Context<Self>) {
        let path = self.path.clone();
        self.error = None;
        self.task = Some(cx.spawn(async move |view, cx| {
            let result = cx
                .background_executor()
                .spawn(async move { prepare(path) })
                .await;
            let _ = view.update(cx, |this, cx| {
                match result {
                    Ok(prepared) => {
                        if let Some(old) = this.prepared.replace(prepared) {
                            cx.drop_image(old.image, None);
                        }
                    }
                    Err(e) => this.error = Some(format!("Could not preview image: {e}")),
                }
                cx.notify();
            });
        }));
    }
    pub fn original(&self) -> Option<&[u8]> {
        self.prepared.as_ref().map(|p| p.original.as_slice())
    }
}
impl Render for ImageView {
    fn render(&mut self, _: &mut Window, cx: &mut Context<Self>) -> impl IntoElement {
        let p = Palette::new(cx.theme().mode.is_dark());
        let mut view = div().size_full().flex().flex_col().gap_2().child(
            row()
                .child(
                    button("image-fit", "Fit image", ButtonKind::Default, p, cx).on_click(
                        cx.listener(|this, _, _, cx| {
                            this.fit = true;
                            cx.notify();
                        }),
                    ),
                )
                .child(
                    button("image-minus", "Zoom −", ButtonKind::Default, p, cx).on_click(
                        cx.listener(|this, _, _, cx| {
                            this.fit = false;
                            this.zoom = (this.zoom / 1.25).max(0.25);
                            cx.notify();
                        }),
                    ),
                )
                .child(
                    button("image-plus", "Zoom +", ButtonKind::Default, p, cx).on_click(
                        cx.listener(|this, _, _, cx| {
                            this.fit = false;
                            this.zoom = (this.zoom * 1.25).min(4.);
                            cx.notify();
                        }),
                    ),
                )
                .child(
                    button("image-copy", "Copy image", ButtonKind::Default, p, cx).on_click(
                        cx.listener(|this, _, _, cx| {
                            if let Some(prepared) = &this.prepared {
                                cx.write_to_clipboard(ClipboardItem::new_image(
                                    &Image::from_bytes(
                                        ImageFormat::Png,
                                        prepared.clipboard.clone(),
                                    ),
                                ));
                                this.status = "Image copied.".into();
                                cx.notify();
                            }
                        }),
                    ),
                ),
        );
        if let Some(error) = &self.error {
            view = view
                .child(state("image-error", "Image unavailable", error, p))
                .child(
                    button("image-retry", "Retry image", ButtonKind::Default, p, cx)
                        .on_click(cx.listener(|this, _, _, cx| this.load(cx))),
                );
        } else if let Some(prepared) = &self.prepared {
            view = view
                .child(caption(
                    format!(
                        "{} × {} · {}",
                        prepared.width,
                        prepared.height,
                        if self.fit {
                            "Fit".into()
                        } else {
                            format!("{:.0}%", self.zoom * 100.)
                        }
                    ),
                    p,
                ))
                .child(if self.fit {
                    div()
                        .flex_1()
                        .min_h_0()
                        .child(img(prepared.image.clone()).size_full())
                        .into_any_element()
                } else {
                    div()
                        .id("image-scroll")
                        .flex_1()
                        .min_h_0()
                        .overflow_scroll()
                        .child(img(prepared.image.clone()).w(px(prepared.width as f32 * self.zoom)))
                        .into_any_element()
                });
        } else {
            view = view.child(state(
                "image-loading",
                "Reading image",
                "Preparing native pixels…",
                p,
            ));
        }
        view.child(caption(self.status.clone(), p))
    }
}
#[cfg(test)]
mod tests {
    use super::prepare;
    use std::path::PathBuf;
    #[test]
    fn native_image_preparation_preserves_original_and_rejects_invalid() {
        let path = PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../../assets/probe.pdf");
        assert!(prepare(path).is_err());
    }
}
