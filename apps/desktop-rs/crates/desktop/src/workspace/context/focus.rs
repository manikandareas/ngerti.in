use super::*;
use crate::{
    models::content::{SourceDocument, TEXT_PREVIEW_BYTES, TableDocument},
    ui::{source::SourceView, table::RichTable},
};
use gpui_kit::component::text::{TextView, TextViewState};
use sha2::{Digest, Sha256};
use std::sync::Arc;

#[derive(Clone)]
pub(super) struct Target {
    pub name: String,
    pub path: String,
    pub artifact: Option<Value>,
}
impl Target {
    pub(in crate::workspace) fn working(name: String, path: String) -> Self {
        Self {
            name,
            path,
            artifact: None,
        }
    }
}
pub(super) struct Document {
    target: Target,
    bytes: Arc<Vec<u8>>,
    body: Body,
}
enum Body {
    Source(Entity<SourceView>),
    Table(Entity<RichTable>),
    Markdown(Entity<TextViewState>),
    Image(Entity<crate::ui::image_view::ImageView>),
    Pdf(Entity<crate::platform::pdf::NativePdf>),
    Html(Entity<gpui_webview::WebView>),
    Error(String),
}
impl Workspace {
    pub(in crate::workspace) fn is_viewing(&self) -> bool {
        !self.context_work.viewer.is_empty()
            || self.context_work.file_task.is_some()
            || !self.context_work.file_error.is_empty()
    }
    pub(in crate::workspace) fn open_artifact(
        &mut self,
        artifact: Value,
        window: &mut Window,
        cx: &mut Context<Self>,
    ) {
        let path = format!(
            "/v1/artifacts/{}/content?workspace_id={}",
            text(&artifact, "id"),
            text(&artifact, "workspace_id")
        );
        self.open_target(
            Target {
                name: text(&artifact, "name").to_owned(),
                path,
                artifact: Some(artifact),
            },
            window,
            cx,
        );
    }
    pub(in crate::workspace) fn table_actions(
        table: &gpui_kit::component::text::TableData,
        weak: WeakEntity<Self>,
        group: Option<SharedString>,
        cx: &mut App,
    ) -> AnyElement {
        let p = Palette::new(gpui_kit::component::ActiveTheme::theme(cx).mode.is_dark());
        let table = table.clone();
        let copy_table = table.clone();
        let copy = action("copy-table", "Copy table", "Copy01Icon", p, cx)
            .size(ui(26.))
            .on_click(move |_, _, cx| {
                let document = TableDocument {
                    original: String::new(),
                    headers: copy_table.headers.clone(),
                    rows: copy_table.rows.clone(),
                };
                let order = (0..document.rows.len()).collect::<Vec<_>>();
                let text = document.csv(&order);
                cx.write_to_clipboard(ClipboardItem::new_string(text));
            });
        let download_table = table.clone();
        let download_owner = weak.clone();
        let download = action("download-table", "Download table", "Download04Icon", p, cx)
            .size(ui(26.))
            .on_click(move |_, _, cx| {
                let document = TableDocument {
                    original: String::new(),
                    headers: download_table.headers.clone(),
                    rows: download_table.rows.clone(),
                };
                let bytes = document
                    .csv(&(0..document.rows.len()).collect::<Vec<_>>())
                    .into_bytes();
                let directory = dirs::download_dir().unwrap_or_else(std::env::temp_dir);
                let picker = cx.prompt_for_new_path(&directory, Some("Table.csv"));
                let owner = download_owner.clone();
                cx.spawn(async move |cx| {
                    if let Ok(Ok(Some(path))) = picker.await {
                        let result = cx
                            .background_spawn(async move { std::fs::write(path, bytes) })
                            .await;
                        let _ = owner.update(cx, |this, cx| {
                            if let Err(error) = result {
                                this.error = error.to_string();
                            }
                            cx.notify();
                        });
                    }
                })
                .detach();
            });
        let maximize = action(
            "maximize-table",
            "Maximize table",
            "ArrowExpand01Icon",
            p,
            cx,
        )
        .size(ui(26.))
        .on_click(move |_, window, cx| {
            let _ = weak.update(cx, |this, cx| {
                let document = TableDocument {
                    original: String::new(),
                    headers: table.headers.clone(),
                    rows: table.rows.clone(),
                };
                let bytes = document
                    .csv(&(0..document.rows.len()).collect::<Vec<_>>())
                    .into_bytes();
                this.prepare_document(
                    Target::working("Table.csv".into(), format!("table:{}", Uuid::new_v4())),
                    bytes,
                    window,
                    cx,
                );
            });
        });
        let reveal = |button: gpui_kit::component::button::Button| {
            button.when_some(group.clone(), |button, group| {
                button
                    .rounded_full()
                    .bg(p.color("popover"))
                    .opacity(0.)
                    .group_hover(group, |style| style.opacity(1.))
                    .focus_visible(|style| style.opacity(1.))
            })
        };
        div()
            .flex()
            .items_center()
            .justify_end()
            .gap(ui(2.))
            .child(reveal(copy))
            .child(reveal(download))
            .child(reveal(maximize))
            .into_any_element()
    }
    pub(in crate::workspace) fn open_local_file(
        &mut self,
        id: Uuid,
        name: String,
        window: &mut Window,
        cx: &mut Context<Self>,
    ) {
        let path = self.store.file_root().join(format!("{id}.bytes"));
        let scope = self.scope;
        self.context_work.file_task = Some(cx.spawn_in(window, async move |view, cx| {
            let result = cx
                .background_executor()
                .spawn(async move { std::fs::read(path) })
                .await;
            let _ = view.update_in(cx, |this, window, cx| {
                if scope != this.scope {
                    return;
                }
                this.context_work.file_task = None;
                match result {
                    Ok(bytes) => {
                        let path = format!("local:{id}");
                        this.context_work.staged_context = Some((path.clone(), id));
                        this.prepare_document(Target::working(name, path), bytes, window, cx);
                    }
                    Err(e) => this.context_work.file_error = e.to_string(),
                }
                cx.notify();
            });
        }));
        cx.notify();
    }
    pub(super) fn open_target(
        &mut self,
        target: Target,
        window: &mut Window,
        cx: &mut Context<Self>,
    ) {
        if self.context_work.file_task.is_some() {
            return;
        }
        let Some(worker) = &self.reads else {
            return;
        };
        let path = target.path.clone();
        let Ok(reply) = worker.submit(false, move |api| api.bytes(&path)) else {
            return;
        };
        let scope = self.scope;
        self.context_work.file_error.clear();
        self.context_work.read_target = Some(target.clone());
        self.context_work.file_task = Some(cx.spawn_in(window, async move |view, cx| {
            let result = reply.await.unwrap_or(Err(ClientError::Unavailable));
            let _ = view.update_in(cx, |this, window, cx| {
                if this.scope != scope {
                    return;
                }
                this.context_work.file_task = None;
                match result {
                    Ok(bytes) => this.prepare_document(target, bytes, window, cx),
                    Err(e) => {
                        this.context_work.file_error = e.to_string();
                        cx.notify();
                    }
                }
            });
        }));
        cx.notify();
    }
    fn prepare_document(
        &mut self,
        target: Target,
        bytes: Vec<u8>,
        window: &mut Window,
        cx: &mut Context<Self>,
    ) {
        if let Some(artifact) = &target.artifact
            && artifact["sha256"]
                .as_str()
                .is_some_and(|hash| hash != format!("{:x}", Sha256::digest(&bytes)))
        {
            self.context_work.file_error =
                "The original file hash does not match. Refresh and try again.".into();
            cx.notify();
            return;
        }
        let name = target.name.to_lowercase();
        let preview = &bytes[..bytes.len().min(TEXT_PREVIEW_BYTES)];
        let truncated = bytes.len() > TEXT_PREVIEW_BYTES;
        let root = self.store.file_root().join("previews");
        let extension = name
            .rsplit('.')
            .next()
            .filter(|s| s.len() < 12 && s.chars().all(|c| c.is_ascii_alphanumeric()))
            .unwrap_or("bin");
        let path = root.join(format!("{}.{extension}", Uuid::new_v4()));
        let original = Arc::new(bytes.clone());
        let result = (|| -> anyhow::Result<Body> {
            use std::os::unix::fs::PermissionsExt;
            std::fs::create_dir_all(&root)?;
            std::fs::set_permissions(&root, std::fs::Permissions::from_mode(0o700))?;
            if name.ends_with(".pdf")
                || ["png", "jpg", "jpeg", "webp", "gif", "svg"].contains(&extension)
            {
                std::fs::write(&path, &bytes)?;
                return Ok(if name.ends_with(".pdf") {
                    Body::Pdf(cx.new(|cx| {
                        crate::platform::pdf::NativePdf::new(&path, window, cx).workspace_controls()
                    }))
                } else {
                    Body::Image(cx.new(|cx| crate::ui::image_view::ImageView::new(path, cx)))
                });
            }
            if name.ends_with(".html") || name.ends_with(".htm") {
                let html = crate::models::html::prepare(preview, truncated, 0)?;
                return Ok(Body::Html({
                    let view = crate::platform::embedded::static_document(html, window, cx)?;
                    cx.new(|_| view)
                }));
            }
            if name.ends_with(".csv") || name.ends_with(".tsv") {
                let table = Arc::new(TableDocument::parse(
                    preview,
                    if name.ends_with(".tsv") { '\t' } else { ',' },
                    truncated,
                )?);
                return Ok(Body::Table(cx.new(|cx| RichTable::new(table, window, cx))));
            }
            if name.ends_with(".md") || name.ends_with(".markdown") {
                let markdown = crate::models::content::text_preview(preview, truncated)?;
                return Ok(Body::Markdown(
                    cx.new(|cx| TextViewState::markdown(markdown, cx)),
                ));
            }
            let source = Arc::new(SourceDocument::new(&target.name, preview, truncated)?);
            Ok(Body::Source(
                cx.new(|cx| SourceView::new(source, window, cx)),
            ))
        })();
        let body = result.unwrap_or_else(|e| {
            Body::Error(format!("{e}. Download the original file to open it."))
        });
        self.context_work
            .viewer_return_focus
            .push(window.focused(cx));
        self.context_work.context = Some(target.clone());
        self.context_work.viewer.push(Document {
            target,
            bytes: original,
            body,
        });
        self.context_work.focus.focus(window, cx);
        cx.notify();
    }
    pub(in crate::workspace) fn focus_back(&mut self, window: &mut Window, cx: &mut Context<Self>) {
        self.context_work.file_task = None;
        self.context_work.file_error.clear();
        if let Some(document) = self.context_work.viewer.pop()
            && let Body::Pdf(pdf) = document.body
        {
            pdf.update(cx, |pdf, cx| pdf.hide(window, cx));
        }
        self.context_work.context = self.context_work.viewer.last().map(|d| d.target.clone());
        if let Some(Some(focus)) = self.context_work.viewer_return_focus.pop() {
            focus.focus(window, cx);
        } else {
            self.context_work.focus.focus(window, cx);
        }
        cx.notify();
    }
    pub(in crate::workspace) fn focus_view(
        &self,
        window: &mut Window,
        cx: &mut Context<Self>,
    ) -> AnyElement {
        let p = Palette::new(self.store.dark());
        let mut view = div()
            .id("native-focus-view")
            .track_focus(&self.context_work.focus)
            .relative()
            .size_full()
            .min_h_0();
        let body = match self.context_work.viewer.last().map(|d| &d.body) {
            Some(Body::Source(v)) => v.clone().into_any_element(),
            Some(Body::Table(v)) => v.clone().into_any_element(),
            Some(Body::Markdown(v)) => TextView::new(v)
                .selectable(true)
                .scrollable(true)
                .table_actions({
                    let weak = cx.entity().downgrade();
                    move |table, _, cx| Self::table_actions(table, weak.clone(), None, cx)
                })
                .into_any_element(),
            Some(Body::Pdf(v)) => v.clone().into_any_element(),
            Some(Body::Image(v)) => v.clone().into_any_element(),
            Some(Body::Html(v)) => v.clone().into_any_element(),
            Some(Body::Error(e)) => caption(e.clone(), p).into_any_element(),
            _ => caption(
                if self.context_work.file_error.is_empty() {
                    "Reading original file…"
                } else {
                    &self.context_work.file_error
                },
                p,
            )
            .into_any_element(),
        };
        let document_padding = matches!(
            self.context_work.viewer.last().map(|d| &d.body),
            Some(Body::Markdown(_) | Body::Source(_) | Body::Image(_) | Body::Error(_))
        );
        let table_padding = matches!(
            self.context_work.viewer.last().map(|d| &d.body),
            Some(Body::Table(_))
        );
        let viewport_width =
            f32::from(window.viewport_size().width) / f32::from(window.rem_size()) * 16.;
        view = view.child(
            div()
                .when(document_padding, |body| {
                    body.px(ui((viewport_width * 0.04).clamp(16., 64.)))
                        .py(ui(28.))
                })
                .when(table_padding, |body| body.p(ui(24.)))
                .absolute()
                .inset_0()
                .pt(ui(if document_padding {
                    88.
                } else if table_padding {
                    84.
                } else {
                    60.
                }))
                .pb(self.composer_height + ui(24.).to_pixels(window.rem_size()))
                .child(body),
        );
        let title = self
            .context_work
            .viewer
            .last()
            .map(|d| d.target.name.clone())
            .unwrap_or_else(|| "File".into());
        let header = div()
            .absolute()
            .top_0()
            .left_0()
            .right_0()
            .h(ui(60.))
            .px(ui(20.))
            .flex()
            .items_center()
            .justify_between()
            .child(
                action("focus-back", "Back", "ArrowLeft01Icon", p, cx)
                    .size(ui(39.))
                    .rounded_full()
                    .bg(p.color("header-surface"))
                    .on_click(cx.listener(|this, _, window, cx| this.focus_back(window, cx))),
            )
            .child(
                div()
                    .absolute()
                    .left(relative(0.25))
                    .w(relative(0.5))
                    .flex()
                    .items_center()
                    .justify_center()
                    .text_center()
                    .child(
                        div()
                            .rounded_full()
                            .bg(p.color("header-surface"))
                            .px(ui(16.))
                            .py(ui(10.))
                            .truncate()
                            .child(title),
                    ),
            )
            .child(self.focus_actions(cx));
        if !self.context_work.file_error.is_empty() {
            view = view.child(
                div()
                    .absolute()
                    .top(ui(80.))
                    .left(ui(20.))
                    .right(ui(20.))
                    .child(caption(self.context_work.file_error.clone(), p))
                    .child(
                        button("retry-file", "Try again", ButtonKind::Outline, p, cx).on_click(
                            cx.listener(|this, _, window, cx| {
                                if let Some(target) = this.context_work.read_target.clone() {
                                    this.open_target(target, window, cx);
                                }
                            }),
                        ),
                    ),
            );
        }
        let weak = cx.entity().downgrade();
        view.child(header)
            .child(
                div()
                    .absolute()
                    .bottom_0()
                    .left_0()
                    .right_0()
                    .child(self.composer_view(cx))
                    .child(
                        canvas(
                            move |bounds, _, cx| {
                                let height = bounds.size.height;
                                let weak = weak.clone();
                                cx.defer(move |cx| {
                                    let _ = weak.update(cx, |this, cx| {
                                        if (this.composer_height - height).abs() > px(0.5) {
                                            this.composer_height = height;
                                            cx.notify();
                                        }
                                    });
                                });
                            },
                            |_, _, _, _| {},
                        )
                        .absolute()
                        .inset_0()
                        .size_full(),
                    ),
            )
            .into_any_element()
    }
    fn focus_actions(&self, cx: &mut Context<Self>) -> AnyElement {
        use gpui_kit::component::menu::{DropdownMenu, PopupMenuItem};
        let p = Palette::new(self.store.dark());
        let weak = cx.entity().downgrade();
        let info = self
            .context_work
            .viewer
            .last()
            .is_some_and(|d| d.target.artifact.is_some());
        action("focus-actions", "File actions", "MoreHorizontalIcon", p, cx)
            .size(ui(39.))
            .rounded_full()
            .bg(p.color("header-surface"))
            .dropdown_menu_with_anchor(Anchor::TopRight, move |menu, _, _| {
                let download = weak.clone();
                let information = weak.clone();
                menu.item(
                    PopupMenuItem::new("Download original").on_click(move |_, window, cx| {
                        let _ = download.update(cx, |this, cx| this.download_focus(window, cx));
                    }),
                )
                .when(info, |menu| {
                    menu.item(
                        PopupMenuItem::new("Info file").on_click(move |_, window, cx| {
                            let _ =
                                information.update(cx, |this, cx| this.show_file_info(window, cx));
                        }),
                    )
                })
            })
            .into_any_element()
    }
    fn show_file_info(&mut self, window: &mut Window, cx: &mut Context<Self>) {
        let id = self
            .context_work
            .viewer
            .last()
            .and_then(|d| d.target.artifact.as_ref())
            .map(|a| text(a, "id").to_owned());
        if let Some(id) = id {
            self.accepted_focus(window, cx);
            self.panel = Some(Panel::Library);
            self.locate_context(Location::Artifact(id), window, cx);
        }
    }
    fn download_focus(&mut self, window: &mut Window, cx: &mut Context<Self>) {
        let Some(document) = self.context_work.viewer.last() else {
            return;
        };
        let bytes = document.bytes.clone();
        let name = document.target.name.clone();
        let directory = std::env::var_os("HOME")
            .map(std::path::PathBuf::from)
            .unwrap_or_else(std::env::temp_dir)
            .join("Downloads");
        let picker = cx.prompt_for_new_path(&directory, Some(&name));
        cx.spawn_in(window, async move |view, cx| {
            if let Ok(Ok(Some(path))) = picker.await {
                let result = cx
                    .background_executor()
                    .spawn(async move { std::fs::write(path, &*bytes) })
                    .await;
                let _ = view.update(cx, |this, cx| {
                    if let Err(error) = result {
                        this.error = error.to_string();
                    }
                    cx.notify();
                });
            }
        })
        .detach();
    }

    pub(in crate::workspace) fn context_chip(&self, cx: &mut Context<Self>) -> Option<AnyElement> {
        let target = self.context_work.context.as_ref()?;
        let context_path = target.path.clone();
        let p = Palette::new(self.store.dark());
        Some(
            div()
                .flex()
                .items_center()
                .gap(ui(8.))
                .px(ui(12.))
                .py(ui(4.))
                .child(super::files::file_icon(
                    &target.name,
                    false,
                    false,
                    self.store.dark(),
                ))
                .max_w_full()
                .rounded(ui(12.))
                .bg(p.color("composer"))
                .child(div().min_w_0().truncate().child(target.name.clone()))
                .child(
                    action(
                        "remove-file-context",
                        "Remove file context",
                        "Cancel01Icon",
                        p,
                        cx,
                    )
                    .size(ui(24.))
                    .rounded_full()
                    .disabled_state(
                        self.busy
                            || self.selected.is_some_and(|thread| {
                                self.store.pending(&format!("message:{thread}")).is_some()
                            }),
                        p,
                    )
                    .on_click(cx.listener(move |this, _, _, cx| {
                        if let Some((path, id)) = this.context_work.staged_context.take()
                            && path == context_path
                            && let Some(thread) = this.selected
                            && let Err(error) = this.store.remove_file(thread, id)
                        {
                            this.error = error.to_string();
                        }
                        this.context_work.context = None;
                        cx.notify();
                    })),
                )
                .into_any_element(),
        )
    }
    pub(in crate::workspace) fn is_context_file(&self, id: Uuid) -> bool {
        self.context_work
            .context
            .as_ref()
            .is_some_and(|target| target.path == format!("local:{id}"))
    }
    pub(in crate::workspace) fn contextual_submission(
        &mut self,
        thread: Uuid,
        agent: Option<Uuid>,
        group: bool,
        text: String,
        cx: &App,
    ) -> anyhow::Result<crate::storage::Operation> {
        let Some(target) = self.context_work.context.clone() else {
            return self.store.submission(thread, agent, group, text);
        };
        let mut authored = text.clone();
        if let Some(artifact) = target.artifact {
            authored.push_str(&format!(
                "\n[{}](ngertiin://file/{})",
                target.name.replace(['[', ']', '\n', '\r'], " "),
                text_field(&artifact, "id")
            ));
        } else if let Some(document) = self.context_work.viewer.last() {
            // The cache is a reading copy; it becomes one staged upload only on Send.
            let local = target
                .path
                .strip_prefix("local:")
                .and_then(|id| id.parse::<Uuid>().ok())
                .is_some_and(|id| self.store.files(thread).iter().any(|file| file.id == id));
            let staged = local
                || self
                    .context_work
                    .staged_context
                    .as_ref()
                    .is_some_and(|(path, id)| {
                        path == &target.path
                            && self.store.files(thread).iter().any(|file| file.id == *id)
                    });
            if !staged {
                let bytes = if target.path.starts_with("table:")
                    && let Body::Table(table) = &document.body
                {
                    table.read(cx).csv_snapshot().into_bytes()
                } else {
                    (*document.bytes).clone()
                };
                let file = Store::write_staged(
                    &self.store.file_root(),
                    target.name.clone(),
                    super::super::commands::media_type(&target.name),
                    bytes,
                )?;
                let id = file.id;
                self.store.retain_staged(thread, file)?;
                self.context_work.staged_context = Some((target.path, id));
            }
        }
        let mut operation = self.store.submission(thread, agent, group, authored)?;
        operation.authored = Some(text);
        Ok(operation)
    }
    pub(in crate::workspace) fn accepted_focus(
        &mut self,
        window: &mut Window,
        cx: &mut Context<Self>,
    ) {
        while !self.context_work.viewer.is_empty() {
            self.focus_back(window, cx);
        }
        self.context_work.context = None;
        self.context_work.staged_context = None;
    }
}
fn text_field<'a>(value: &'a Value, key: &str) -> &'a str {
    text(value, key)
}
