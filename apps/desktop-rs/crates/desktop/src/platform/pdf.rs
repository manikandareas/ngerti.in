//! Native PDFKit child view in GPUI Fast's composition surface. No browser renderer.
//! UI-thread-only ownership; the parent Gallery retires visibility on every scene switch.
use anyhow::{Context as _, anyhow};
use gpui_kit::*;
use objc2::{AnyThread, MainThreadMarker, MainThreadOnly, rc::Retained};
use objc2_app_kit::NSView;
use objc2_foundation::{NSPoint, NSRect, NSSize, NSString, NSURL};
use objc2_pdf_kit::{PDFDisplayMode, PDFDocument, PDFView};
use std::path::Path;

pub struct NativePdf {
    view: Retained<PDFView>,
    surface: WindowCompositionSurface,
    window: AnyWindowHandle,
    async_cx: AsyncApp,
}
impl NativePdf {
    pub fn new(path: &Path, window: &mut Window, cx: &mut App) -> anyhow::Result<Self> {
        let mtm = MainThreadMarker::new().context("PDFKit requires the UI thread")?;
        let url = NSURL::fileURLWithPath(&NSString::from_str(&path.to_string_lossy()));
        // SAFETY: generated bindings require an unsafe call; the URL is local and the
        // retained document/view stay on the AppKit main thread for their entire lifetime.
        let document = unsafe { PDFDocument::initWithURL(PDFDocument::alloc(), &url) }
            .context("PDFKit could not decode the PDF proof")?;
        let view = unsafe {
            PDFView::initWithFrame(
                PDFView::alloc(mtm),
                NSRect::new(NSPoint::ZERO, NSSize::new(600., 600.)),
            )
        };
        unsafe {
            view.setDocument(Some(&document));
            view.setDisplayMode(PDFDisplayMode::SinglePage);
            view.setAutoScales(true);
        }
        let composition = window.enable_window_composition()?;
        let surface = composition.create_native_surface()?;
        let handle = surface.platform_surface()?.platform_handle()?;
        let parent = *handle
            .downcast::<usize>()
            .map_err(|_| anyhow!("PDF surface is not an AppKit view"))?;
        anyhow::ensure!(parent != 0, "PDF surface has no AppKit parent");
        // SAFETY: the composition surface owns the parent NSView; PDFView is retained here.
        unsafe {
            (&*(parent as *const NSView)).addSubview(&view);
        }
        surface.platform_surface()?.set_visible(false)?;
        Ok(Self {
            view,
            surface,
            window: window.window_handle(),
            async_cx: cx.to_async(),
        })
    }
    pub fn hide(&self) {
        let _ = self
            .surface
            .platform_surface()
            .and_then(|s| s.set_visible(false));
    }
    pub fn zoom(&self, multiplier: f64) {
        unsafe {
            self.view.setAutoScales(false);
            self.view
                .setScaleFactor((self.view.scaleFactor() * multiplier).clamp(0.25, 4.));
        }
    }
    pub fn fit(&self) {
        unsafe {
            self.view.setAutoScales(true);
        }
    }
    pub fn selected_text(&self) -> String {
        unsafe {
            self.view
                .currentSelection()
                .and_then(|selection| selection.string())
                .map(|s| s.to_string())
                .unwrap_or_default()
        }
    }
    pub fn page(&self, next: bool) {
        unsafe {
            if next {
                self.view.goToNextPage(None);
            } else {
                self.view.goToPreviousPage(None);
            }
        }
    }
}
impl Drop for NativePdf {
    fn drop(&mut self) {
        self.hide();
        let surface = self.surface.clone();
        let view = self.view.clone();
        let window = self.window;
        self.async_cx
            .clone()
            .spawn(async move |cx| {
                view.removeFromSuperview();
                let _ = window.update(cx, |_, window, _| {
                    window
                        .enable_window_composition()?
                        .remove_surface(surface.id())
                });
            })
            .detach();
    }
}
impl Render for NativePdf {
    fn render(&mut self, _: &mut Window, _: &mut Context<Self>) -> impl IntoElement {
        let surface = self.surface.clone();
        let view = self.view.clone();
        canvas(
            move |bounds, window, _| {
                let visible = bounds.intersect(&window.content_mask().bounds);
                let result = (|| -> anyhow::Result<()> {
                    let platform = surface.platform_surface()?;
                    platform.set_bounds(visible.to_device_pixels(window.scale_factor()))?;
                    platform.set_visible(!visible.is_empty())?;
                    let offset = bounds.origin - visible.origin;
                    view.setFrame(NSRect::new(
                        NSPoint::new(
                            f64::from(offset.x),
                            f64::from(visible.size.height - offset.y - bounds.size.height),
                        ),
                        NSSize::new(f64::from(bounds.size.width), f64::from(bounds.size.height)),
                    ));
                    Ok(())
                })();
                if result.is_err() {
                    let _ = surface
                        .platform_surface()
                        .and_then(|p| p.set_visible(false));
                }
                window.insert_hitbox(visible, HitboxBehavior::BlockMouse)
            },
            |_, _, _, _| {},
        )
        .size_full()
    }
}
