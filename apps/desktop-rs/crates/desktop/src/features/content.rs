use crate::platform::files::{Original, save_original};
use crate::{
    models::content::*,
    ui::{controls::*, source::SourceView, table::RichTable, theme::Palette},
};
use gpui_kit::{
    component::{
        ActiveTheme,
        text::{TextView, TextViewState},
    },
    *,
};
use std::{path::PathBuf, sync::Arc};
pub struct ContentGallery {
    pub(crate) measurement_locked: bool,
    source: Option<Entity<SourceView>>,
    large_source: Option<Entity<SourceView>>,
    large_original: Arc<[u8]>,
    table: Option<Entity<RichTable>>,
    markdown: Entity<TextViewState>,
    markdown_source: String,
    _preparation: Task<()>,
    image_path: PathBuf,
    tab: usize,
    status: String,
    image_view: Entity<crate::ui::image_view::ImageView>,
}
impl ContentGallery {
    pub(crate) fn workload_id(&self) -> &'static str {
        match self.tab {
            0 => "source-802-lines",
            1 => "table-10000-by-20",
            2 => "markdown-gfm",
            3 => "image",
            _ => "source-2mib-100000-lines-bounded-preview",
        }
    }
    pub fn new(image: PathBuf, window: &mut Window, cx: &mut Context<Self>) -> Self {
        let preparation = cx.spawn_in(window, async move |view, cx| {
            let (source, table, large_source, large_original) = cx
                .background_executor()
                .spawn(async move {
                    let source = Arc::new(
                        SourceDocument::new(
                            "example.ts",
                            format!(
                    "// Read-only TypeScript fixture\n{}",
                    (0..800)
                        .map(|i| format!(
                            "export const item{i} = {{ label: \"Row {i}\", ready: true }};\n"
                        ))
                        .collect::<String>()
                )
                            .as_bytes(),
                            false,
                        )
                        .expect("Bounded source fixture"),
                    );
                    let mut table = TableDocument {
                        original: String::new(),
                        headers: (0..20).map(|i| format!("Column {}", i + 1)).collect(),
                        rows: (0..10000)
                            .map(|r| (0..20).map(|c| format!("Row {r} · cell {c}")).collect())
                            .collect(),
                    };
                    table.original = table.csv(&(0..table.rows.len()).collect::<Vec<_>>());
                    let table = Arc::new(table);
                    let mut large_original = (0..100_000)
                        .map(|i| format!("// source {i:06}   "))
                        .collect::<Vec<_>>()
                        .join("\n");
                    large_original.push_str(&" ".repeat(2_097_152 - large_original.len()));
                    let large_original: Arc<[u8]> = large_original.into_bytes().into();
                    let large_source = Arc::new(
                        SourceDocument::new(
                            "large.ts",
                            &large_original[..TEXT_PREVIEW_BYTES],
                            true,
                        )
                        .expect("Bounded truncated source fixture"),
                    );
                    (source, table, large_source, large_original)
                })
                .await;
            let _ = view.update_in(cx, |this, window, cx| {
                this.source = Some(cx.new(|cx| SourceView::new(source, window, cx)));
                this.large_source = Some(cx.new(|cx| SourceView::new(large_source, window, cx)));
                this.large_original = large_original;
                this.table = Some(cx.new(|cx| RichTable::new(table, window, cx)));
                cx.notify();
            });
        });
        let markdown_source="# Native Markdown and GFM\n\nA paragraph with **bold**, *italic*, ~~strikethrough~~, `inline code` and a [source](https://example.com).\n\n> A quoted result.\n\n- [x] Read the original\n- [ ] Review the result\n\n1. First item\n2. Second item\n\n```typescript\nexport const ready = true;\n```\n\n| Name | Value |\n| --- | ---: |\n| Alpha | 42 |\n| Beta | 7 |\n".to_owned();
        let markdown = cx.new(|cx| TextViewState::markdown(&markdown_source, cx));
        Self{measurement_locked:false,source:None,large_source:None,large_original:Arc::from([]),table:None,_preparation:preparation,image_path:image.clone(),markdown,markdown_source,tab:0,status:"Source copy preserves the original preview. Table copy preserves current cells and order.".into(),image_view:cx.new(|cx|crate::ui::image_view::ImageView::new(image,cx))}
    }
    fn export(&mut self, window: &mut Window, cx: &mut Context<Self>) {
        if self.source.is_none() || self.table.is_none() {
            self.status = "Preparing content…".into();
            return;
        }
        let (name, original) = match self.tab {
            0 => (
                "source.ts",
                self.source
                    .as_ref()
                    .expect("Prepared source")
                    .read(cx)
                    .document
                    .original
                    .as_bytes()
                    .to_vec()
                    .into(),
            ),
            1 => (
                "table.csv",
                self.table
                    .as_ref()
                    .expect("Prepared table")
                    .read(cx)
                    .document
                    .original
                    .as_bytes()
                    .to_vec()
                    .into(),
            ),
            2 => (
                "document.md",
                Original::Bytes(self.markdown_source.as_bytes().to_vec()),
            ),
            4 => ("large.ts", Original::Bytes(self.large_original.to_vec())),
            _ => ("image.png", Original::File(self.image_path.clone())),
        };
        self.status = "Saving original content…".into();
        cx.spawn_in(window, async move |view, cx| {
            let result = cx
                .background_executor()
                .spawn(async move { save_original(name, original) })
                .await;
            let _ = view.update(cx, |this, cx| {
                this.status = match result {
                    Ok(path) => format!("Original saved to {}", path.display()),
                    Err(error) => error.to_string(),
                };
                cx.notify();
            });
        })
        .detach();
    }
}
impl Render for ContentGallery {
    fn render(&mut self, _: &mut Window, cx: &mut Context<Self>) -> impl IntoElement {
        let p = Palette::new(cx.theme().mode.is_dark());
        let tabs = row().children(
            ["Source", "Table", "Markdown", "Image", "Large source"]
                .into_iter()
                .enumerate()
                .map(|(i, label)| {
                    button(
                        ("content-tab", i),
                        label,
                        if self.tab == i {
                            ButtonKind::Primary
                        } else {
                            ButtonKind::Ghost
                        },
                        p,
                        cx,
                    )
                    .disabled_state(self.measurement_locked, p)
                    .on_click(cx.listener(move |this, _, _, cx| {
                        this.tab = i;
                        cx.notify();
                    }))
                }),
        );
        let content = match self.tab {
            0 => self
                .source
                .clone()
                .map(|v| v.into_any_element())
                .unwrap_or_else(|| {
                    state(
                        "source-loading",
                        "Reading source",
                        "Preparing native content…",
                        p,
                    )
                    .into_any_element()
                }),
            1 => self
                .table
                .clone()
                .map(|v| v.into_any_element())
                .unwrap_or_else(|| {
                    state(
                        "table-loading",
                        "Reading table",
                        "Preparing native content…",
                        p,
                    )
                    .into_any_element()
                }),
            2 => TextView::new(&self.markdown)
                .selectable(true)
                .scrollable(true)
                .into_any_element(),
            4 => self
                .large_source
                .clone()
                .map(|v| v.into_any_element())
                .unwrap_or_else(|| {
                    state(
                        "large-source-loading",
                        "Reading source",
                        "Preparing native content…",
                        p,
                    )
                    .into_any_element()
                }),
            _ => self.image_view.clone().into_any_element(),
        };
        div()
            .flex()
            .flex_col()
            .size_full()
            .gap_3()
            .child(tabs)
            .child(
                row()
                    .child(
                        button(
                            "copy-content-original",
                            if self.tab == 4 {
                                "Copy preview text"
                            } else {
                                "Copy original text"
                            },
                            ButtonKind::Default,
                            p,
                            cx,
                        )
                        .on_click(cx.listener(|this, _, _, cx| {
                            let text = match this.tab {
                                0 => this
                                    .source
                                    .as_ref()
                                    .map(|s| s.read(cx).document.original.clone()),
                                1 => this
                                    .table
                                    .as_ref()
                                    .map(|t| t.read(cx).document.original.clone()),
                                2 => Some(this.markdown_source.clone()),
                                4 => this
                                    .large_source
                                    .as_ref()
                                    .map(|s| s.read(cx).document.original.clone()),
                                _ => None,
                            };
                            if let Some(text) = text {
                                cx.write_to_clipboard(ClipboardItem::new_string(text));
                            }
                        })),
                    )
                    .child(
                        button(
                            "content-download",
                            "Download original",
                            ButtonKind::Default,
                            p,
                            cx,
                        )
                        .on_click(cx.listener(|this, _, window, cx| this.export(window, cx))),
                    ),
            )
            .child(div().flex_1().min_h_0().child(content))
            .child(caption(self.status.clone(), p))
    }
}
