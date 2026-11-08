//! Continuous GPUI PDF viewport. Quartz owns bounded raster work; PDFKit owns
//! native text interpretation/selection. No WebView or browser PDF renderer.
use super::pdf_worker::{PageRaster, PageSize, PdfWorker};
use crate::ui::{controls::*, theme::Palette};
use gpui_kit::{component::ActiveTheme, *};
use objc2::{AnyThread, rc::Retained};
use objc2_foundation::{NSData, NSPoint, NSRange};
use objc2_pdf_kit::{PDFDocument, PDFSelection};
use std::{
    cell::Cell,
    collections::{HashMap, VecDeque},
    path::{Path, PathBuf},
    rc::Rc,
    sync::Arc,
};

pub struct NativePdf {
    path: PathBuf,
    document: Option<Retained<PDFDocument>>,
    bytes: Option<Arc<Vec<u8>>>,
    pages: Vec<PageSize>,
    worker: Option<PdfWorker>,
    load: Option<Task<()>>,
    task: Option<Task<()>>,
    pending: bool,
    cache: HashMap<usize, PageRaster>,
    uploaded: HashMap<usize, usize>,
    lru: VecDeque<usize>,
    generation: u64,
    list: ListState,
    available: f64,
    zoom: f64,
    fit: bool,
    selection: Option<((usize, usize), (usize, usize))>,
    focus: FocusHandle,
    error: Option<String>,
    download_status: String,
    _visibility: Subscription,
}
impl NativePdf {
    pub fn new(path: &Path, window: &mut Window, cx: &mut Context<Self>) -> Self {
        let mut this = Self {
            path: path.into(),
            document: None,
            bytes: None,
            pages: vec![],
            worker: None,
            load: None,
            task: None,
            pending: false,
            cache: HashMap::new(),
            uploaded: HashMap::new(),
            lru: VecDeque::new(),
            generation: 0,
            list: ListState::new(0, ListAlignment::Top, px(200.)),
            available: 600.,
            zoom: 1.,
            fit: true,
            selection: None,
            focus: cx.focus_handle().tab_stop(true),
            error: None,
            download_status: String::new(),
            _visibility: cx.observe_window_visibility(window, |_, _, _, cx| cx.notify()),
        };
        this.load(window, cx);
        this
    }
    fn load(&mut self, window: &mut Window, cx: &mut Context<Self>) {
        self.retire_pages(window, cx);
        self.document = None;
        self.bytes = None;
        self.worker = None;
        self.pages.clear();
        self.error = None;
        match PdfWorker::new(self.path.clone()) {
            Err(e) => {
                self.error = Some(format!(
                    "PDF renderer could not start: {e}. Retry or download the original file."
                ))
            }
            Ok((worker, ready)) => {
                self.worker = Some(worker);
                self.load=Some(cx.spawn(async move|view,cx|{
    let result=ready.await.unwrap_or_else(|_|Err("PDF renderer stopped. Retry or download the original file.".into()));
    let _=view.update(cx,|this,cx|{match result{Ok(loaded)=>{
     let data=NSData::with_bytes(&loaded.bytes);
     // SAFETY: PDFKit receives immutable bytes retained by this view. Native
     // selection objects remain on the GPUI/AppKit main thread.
     let document=unsafe{PDFDocument::initWithData(PDFDocument::alloc(),&data)};
     if let Some(document)=document{this.document=Some(document);this.bytes=Some(loaded.bytes);this.pages=loaded.pages;this.list.reset(this.pages.len());}
     else{this.error=Some("PDF text could not be read. Retry or download the original file.".into());}
    },Err(e)=>this.error=Some(e)}cx.notify();});
   }));
            }
        }
        cx.notify();
    }
    fn logical_width(&self, index: usize) -> f64 {
        let page = &self.pages[index];
        if self.fit {
            self.available.clamp(page.width * 0.5, page.width * 2.)
        } else {
            page.width * self.zoom
        }
    }
    fn row_height(&self, index: usize) -> f64 {
        self.logical_width(index) * self.pages[index].height / self.pages[index].width + 24.
    }
    /// The first visible page (one-based) and its fractional scroll offset.
    pub fn reading_position(&self) -> Option<(usize, f64)> {
        let anchor = self.list.logical_scroll_top();
        self.pages.get(anchor.item_ix).map(|_| {
            (
                anchor.item_ix + 1,
                f64::from(anchor.offset_in_item) / self.row_height(anchor.item_ix),
            )
        })
    }
    fn retire_pages(&mut self, window: &mut Window, cx: &mut Context<Self>) {
        self.task = None;
        self.pending = false;
        self.generation += 1;
        for (_, page) in self.cache.drain() {
            for tile in page.tiles {
                cx.drop_image(tile.image, Some(window));
            }
        }
        self.uploaded.clear();
        self.lru.clear();
    }
    pub fn hide(&mut self, window: &mut Window, cx: &mut Context<Self>) {
        self.retire_pages(window, cx);
    }
    fn change_layout(
        &mut self,
        window: &mut Window,
        cx: &mut Context<Self>,
        change: impl FnOnce(&mut Self),
    ) {
        let anchor = self.list.logical_scroll_top();
        let fraction = if anchor.item_ix < self.pages.len() {
            f64::from(anchor.offset_in_item) / self.row_height(anchor.item_ix)
        } else {
            0.
        };
        change(self);
        self.retire_pages(window, cx);
        self.list.reset(self.pages.len());
        if anchor.item_ix < self.pages.len() {
            self.list.scroll_to(ListOffset {
                item_ix: anchor.item_ix,
                offset_in_item: px((fraction * self.row_height(anchor.item_ix)) as f32),
            });
        }
        cx.notify();
    }
    pub fn zoom(&mut self, multiplier: f64, window: &mut Window, cx: &mut Context<Self>) {
        if !multiplier.is_finite() || multiplier <= 0. {
            return;
        }
        let index = self
            .list
            .logical_scroll_top()
            .item_ix
            .min(self.pages.len().saturating_sub(1));
        let zoom = if self.fit && !self.pages.is_empty() {
            self.logical_width(index) / self.pages[index].width
        } else {
            self.zoom
        };
        self.set_zoom(zoom * multiplier, window, cx);
    }
    pub fn set_zoom(&mut self, factor: f64, window: &mut Window, cx: &mut Context<Self>) {
        if !factor.is_finite() || factor <= 0. {
            return;
        }
        self.change_layout(window, cx, |this| {
            this.zoom = factor.clamp(0.5, 2.);
            this.fit = false;
        });
    }
    pub fn fit(&mut self, window: &mut Window, cx: &mut Context<Self>) {
        self.change_layout(window, cx, |this| this.fit = true);
    }
    pub fn page(&mut self, next: bool, cx: &mut Context<Self>) {
        if self.pages.is_empty() {
            return;
        }
        let index = self.list.logical_scroll_top().item_ix;
        let target = if next {
            (index + 1).min(self.pages.len() - 1)
        } else {
            index.saturating_sub(1)
        };
        self.list.scroll_to(ListOffset {
            item_ix: target,
            offset_in_item: px(0.),
        });
        cx.notify();
    }
    fn request(&mut self, index: usize, width: f64, cx: &mut Context<Self>) {
        if self.pending || self.cache.contains_key(&index) {
            return;
        }
        let Some(worker) = &self.worker else {
            return;
        };
        let Ok(reply) = worker.page(index, width) else {
            return;
        };
        self.pending = true;
        let generation = self.generation;
        self.task = Some(cx.spawn(async move |view, cx| {
            let result = reply.await;
            let _ = view.update(cx, |this, cx| {
                this.pending = false;
                if this.generation != generation {
                    return;
                }
                match result {
                    Ok(Ok(page)) => {
                        if this.cache.len() == 5
                            && let Some(old) = this.lru.pop_front()
                            && let Some(page) = this.cache.remove(&old)
                        {
                            this.uploaded.remove(&old);
                            for tile in page.tiles {
                                cx.drop_image(tile.image, None);
                            }
                        }
                        this.lru.retain(|p| *p != page.page);
                        this.lru.push_back(page.page);
                        this.uploaded.insert(page.page, 0);
                        this.cache.insert(page.page, page);
                    }
                    Ok(Err(e)) => this.error = Some(e),
                    Err(_) => {
                        this.error = Some(
                            "PDF page could not be read. Retry or download the original file."
                                .into(),
                        )
                    }
                }
                cx.notify();
            });
        }));
    }
    fn native_selection(&self, index: usize) -> Option<Retained<PDFSelection>> {
        let (a, b) = self.selection?;
        let (start, end) = if a <= b { (a, b) } else { (b, a) };
        if index < start.0 || index > end.0 {
            return None;
        }
        let page = unsafe { self.document.as_ref()?.pageAtIndex(index) }?;
        let count = unsafe { page.numberOfCharacters() };
        let from = if index == start.0 {
            start.1.min(count)
        } else {
            0
        };
        let to = if index == end.0 {
            (end.1 + 1).min(count)
        } else {
            count
        };
        (to > from)
            .then(|| unsafe { page.selectionForRange(NSRange::new(from, to - from)) })
            .flatten()
    }
    pub fn selected_text(&self) -> String {
        let Some((a, b)) = self.selection else {
            return String::new();
        };
        (a.0.min(b.0)..=a.0.max(b.0))
            .filter_map(|i| {
                self.native_selection(i)
                    .and_then(|s| unsafe { s.string() })
                    .map(|s| s.to_string())
            })
            .collect::<Vec<_>>()
            .join("\n")
    }
    fn hit(&self, index: usize, position: Point<Pixels>, bounds: Bounds<Pixels>) -> Option<usize> {
        let page = unsafe { self.document.as_ref()?.pageAtIndex(index) }?;
        let (x, y) = self.pages[index].to_pdf(
            f64::from(position.x - bounds.origin.x),
            f64::from(position.y - bounds.origin.y),
            self.logical_width(index),
        );
        let hit = unsafe { page.characterIndexAtPoint(NSPoint::new(x, y)) };
        (hit >= 0).then_some(hit as usize)
    }
    fn highlights(&self, index: usize) -> Vec<(f64, f64, f64, f64)> {
        let Some(selection) = self.native_selection(index) else {
            return vec![];
        };
        let Some(document) = &self.document else {
            return vec![];
        };
        let Some(page) = (unsafe { document.pageAtIndex(index) }) else {
            return vec![];
        };
        let geometry = &self.pages[index];
        let width = self.logical_width(index);
        unsafe { selection.selectionsByLine() }
            .iter()
            .map(|line| {
                let r = unsafe { line.boundsForPage(&page) };
                let points = [
                    geometry.display_point(r.origin.x, r.origin.y, width),
                    geometry.display_point(r.origin.x + r.size.width, r.origin.y, width),
                    geometry.display_point(r.origin.x, r.origin.y + r.size.height, width),
                    geometry.display_point(
                        r.origin.x + r.size.width,
                        r.origin.y + r.size.height,
                        width,
                    ),
                ];
                let left = points.iter().map(|p| p.0).fold(f64::INFINITY, f64::min);
                let top = points.iter().map(|p| p.1).fold(f64::INFINITY, f64::min);
                let right = points.iter().map(|p| p.0).fold(0., f64::max);
                let bottom = points.iter().map(|p| p.1).fold(0., f64::max);
                (left, top, right - left, bottom - top)
            })
            .collect()
    }
    fn page_view(&mut self, index: usize, scale: f32, cx: &mut Context<Self>) -> AnyElement {
        let width = self.logical_width(index);
        let height = width * self.pages[index].height / self.pages[index].width;
        self.request(index, width * f64::from(scale), cx);
        let bounds = Rc::new(Cell::new(Bounds::default()));
        let down = bounds.clone();
        let drag = bounds.clone();
        let layout = bounds.clone();
        let highlights = self.highlights(index);
        let mut page = div()
            .id(("pdf-page", index))
            .role(Role::Document)
            .aria_label(format!("PDF page {}", index + 1))
            .relative()
            .w(px(width as f32))
            .h(px(height as f32))
            .bg(rgb(0xffffff))
            .on_mouse_down(
                MouseButton::Left,
                cx.listener(move |this, event: &MouseDownEvent, window, cx| {
                    this.focus.focus(window, cx);
                    if let Some(hit) = this.hit(index, event.position, down.get()) {
                        this.selection = Some(((index, hit), (index, hit)));
                        cx.notify();
                    }
                }),
            )
            .on_mouse_move(cx.listener(move |this, event: &MouseMoveEvent, _, cx| {
                if event.pressed_button == Some(MouseButton::Left)
                    && let (Some((start, _)), Some(hit)) =
                        (this.selection, this.hit(index, event.position, drag.get()))
                {
                    this.selection = Some((start, (index, hit)));
                    cx.notify();
                }
            }));
        if let Some(raster) = self.cache.get(&index) {
            let factor = height as f32 / raster.height as f32;
            for tile in raster
                .tiles
                .iter()
                .take(self.uploaded.get(&index).copied().unwrap_or(0))
            {
                page = page.child(
                    div()
                        .absolute()
                        .left_0()
                        .top(px(tile.top as f32 * factor))
                        .w_full()
                        .h(px(tile.height as f32 * factor))
                        .overflow_hidden()
                        .child(
                            img(tile.image.clone())
                                .absolute()
                                .left_0()
                                .top(px((tile.source_top as f32 - tile.top as f32) * factor))
                                .w_full()
                                .h(px(tile.source_height as f32 * factor)),
                        ),
                );
            }
        } else {
            page = page.child(
                div()
                    .p_6()
                    .text_color(rgb(0x666666))
                    .child(format!("Loading page {}…", index + 1)),
            );
        }
        page = page.child(
            canvas(
                move |area, _, _| {
                    layout.set(area);
                    area
                },
                move |area, _, window, _| {
                    for (x, y, w, h) in &highlights {
                        window.paint_quad(fill(
                            Bounds::new(
                                point(area.origin.x + px(*x as f32), area.origin.y + px(*y as f32)),
                                size(px(*w as f32), px(*h as f32)),
                            ),
                            rgba(0x2f81f755),
                        ));
                    }
                },
            )
            .absolute()
            .top_0()
            .left_0()
            .size_full(),
        );
        div()
            .flex()
            .justify_center()
            .w_full()
            .h(px((height + 24.) as f32))
            .pb_6()
            .child(page)
            .into_any_element()
    }
}
impl NativePdf {
    fn download(&mut self, window: &mut Window, cx: &mut Context<Self>) {
        let original = self.path.clone();
        let bytes = self.bytes.clone();
        let root = crate::host::profile_root();
        self.download_status = "Saving original PDF…".into();
        cx.spawn_in(window, async move |view, cx| {
            let result = cx
                .background_executor()
                .spawn(async move {
                    (|| -> anyhow::Result<PathBuf> {
                        let directory = root?.join("component-exports");
                        std::fs::create_dir_all(&directory)?;
                        let path = directory.join(format!("{}.pdf", uuid::Uuid::new_v4()));
                        if let Some(bytes) = bytes {
                            std::fs::write(&path, bytes.as_slice())?;
                        } else {
                            std::fs::copy(original, &path)?;
                        }
                        Ok(path)
                    })()
                })
                .await;
            let _ = view.update(cx, |this, cx| {
                this.download_status = match result {
                    Ok(path) => format!("Original saved to {}", path.display()),
                    Err(error) => error.to_string(),
                };
                cx.notify();
            });
        })
        .detach();
    }
}
impl Render for NativePdf {
    fn render(&mut self, window: &mut Window, cx: &mut Context<Self>) -> impl IntoElement {
        // Admit one bounded texture band per rendered frame. Original Quartz
        // pixels and overlapping sample rows stay intact; idle/hidden views
        // have no upload clock. Prioritize the current reading page.
        if window.is_visible() {
            let current = self.list.logical_scroll_top().item_ix;
            let next = self
                .cache
                .iter()
                .filter(|(page, raster)| {
                    self.uploaded.get(page).copied().unwrap_or(0) < raster.tiles.len()
                })
                .min_by_key(|(page, _)| page.abs_diff(current))
                .map(|(page, _)| *page);
            if let Some(page) = next {
                *self.uploaded.entry(page).or_default() += 1;
                if self.cache.iter().any(|(page, raster)| {
                    self.uploaded.get(page).copied().unwrap_or(0) < raster.tiles.len()
                }) {
                    let view = cx.entity().downgrade();
                    window.on_next_frame(move |_, cx| {
                        let _ = view.update(cx, |_, cx| cx.notify());
                    });
                }
            }
        }
        let p = Palette::new(cx.theme().mode.is_dark());
        let handle = cx.entity().downgrade();
        let scale = window.scale_factor();
        let content = if let Some(error) = &self.error {
            div()
                .flex()
                .flex_col()
                .gap_3()
                .child(state("pdf-error", "PDF preview unavailable", error, p))
                .child(
                    button("pdf-retry", "Retry PDF", ButtonKind::Default, p, cx)
                        .on_click(cx.listener(|this, _, window, cx| this.load(window, cx))),
                )
                .into_any_element()
        } else if self.pages.is_empty() {
            state(
                "pdf-loading",
                "Reading PDF",
                "Preparing native page rendering…",
                p,
            )
            .into_any_element()
        } else {
            list(self.list.clone(), move |i, _, cx| {
                handle
                    .update(cx, |this, cx| this.page_view(i, scale, cx))
                    .unwrap_or_else(|_| div().into_any_element())
            })
            .size_full()
            .into_any_element()
        };
        let view = cx.entity().downgrade();
        let cached_pixels: u64 = self
            .cache
            .values()
            .map(|page| u64::from(page.width) * u64::from(page.height))
            .sum();
        div()
            .id("native-pdf")
            .role(Role::Document)
            .aria_label("PDF document")
            .track_focus(&self.focus)
            .border_1()
            .border_color(rgba(0))
            .focus_visible(|style| style.border_color(p.color("ring")))
            .flex()
            .flex_col()
            .size_full()
            .capture_key_down(cx.listener(|this, event: &KeyDownEvent, window, cx| {
                if !this.focus.is_focused(window) {
                    return;
                }
                if event.keystroke.modifiers.platform && event.keystroke.key == "c" {
                    cx.write_to_clipboard(ClipboardItem::new_string(this.selected_text()));
                    cx.stop_propagation();
                } else if event.keystroke.modifiers == Modifiers::default() {
                    let page = this.list.viewport_bounds().size.height.max(px(40.));
                    match event.keystroke.key.as_str() {
                        "up" => this.list.scroll_by(px(-40.)),
                        "down" => this.list.scroll_by(px(40.)),
                        "pageup" => this.list.scroll_by(-page),
                        "pagedown" => this.list.scroll_by(page),
                        "home" => this.list.scroll_to(ListOffset {
                            item_ix: 0,
                            offset_in_item: px(0.),
                        }),
                        "end" => this.list.scroll_to_end(),
                        _ => return,
                    }
                    window.prevent_default();
                    cx.stop_propagation();
                    cx.notify();
                }
            }))
            .child(
                row()
                    .child(
                        button(
                            "pdf-download-original",
                            "Download original PDF",
                            ButtonKind::Default,
                            p,
                            cx,
                        )
                        .on_click(cx.listener(|this, _, window, cx| this.download(window, cx))),
                    )
                    .child(caption(format!("{cached_pixels} cached pixels"), p))
                    .child(caption(self.download_status.clone(), p)),
            )
            .child(caption(
                format!(
                    "Page {} / {} · {} · {} cached canvases",
                    self.list.logical_scroll_top().item_ix + 1,
                    self.pages.len(),
                    if self.fit {
                        "Fit width".into()
                    } else {
                        format!("{:.0}%", self.zoom * 100.)
                    },
                    self.cache.len()
                ),
                p,
            ))
            .child(
                div().flex_1().min_h_0().relative().child(content).child(
                    canvas(
                        move |area, window, _| {
                            let width = (f64::from(area.size.width) - 32.).max(200.);
                            let view = view.clone();
                            window.on_next_frame(move |window, cx| {
                                let _ = view.update(cx, |this, cx| {
                                    if (this.available - width).abs() > 1. {
                                        this.change_layout(window, cx, |this| {
                                            this.available = width
                                        });
                                    }
                                });
                            });
                        },
                        |_, _, _, _| {},
                    )
                    .absolute()
                    .top_0()
                    .left_0()
                    .size_full(),
                ),
            )
    }
}
