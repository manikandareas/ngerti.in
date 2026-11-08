use super::*;
use crate::storage::Operation;
use gpui_kit::component::input::Input;
impl Workspace {
    pub(in crate::workspace) fn select_context_tab(
        &mut self,
        panel: Panel,
        window: &mut Window,
        cx: &mut Context<Self>,
    ) {
        self.computer.update(cx, |computer, cx| {
            computer.present(panel == Panel::Computer, cx)
        });
        self.panel = Some(panel);
        self.context_work.location = Location::Overview;
        self.context_work.history.clear();
        if panel == Panel::Library {
            self.load_library(cx);
        }
        self.context_work.focus.focus(window, cx);
        cx.notify();
    }
    pub(super) fn load_library(&mut self, cx: &mut Context<Self>) {
        if let Some(context) = self.learning_context() {
            if self.value()["thread"]["type"] == "dm" {
                self.context_read(
                    "memories",
                    format!(
                        "/v1/learning/memories?agent_id={}&thread_id={}",
                        text(&context, "agent_id"),
                        text(&context, "thread_id")
                    ),
                    cx,
                );
            }
            self.context_read(
                "skills",
                format!(
                    "/v1/learning/skills?agent_id={}&thread_id={}",
                    text(&context, "agent_id"),
                    text(&context, "thread_id")
                ),
                cx,
            );
        }
    }
    pub(in crate::workspace) fn library_view(&self, cx: &mut Context<Self>) -> AnyElement {
        let p = Palette::new(self.store.dark());
        let mut view = div().flex().flex_col().gap(ui(24.));
        let mut memory = div().flex().flex_col().gap(ui(12.)).child(
            div()
                .text_size(ui(16.))
                .font_weight(FontWeight::SEMIBOLD)
                .child("Memory"),
        );
        if self.value()["thread"]["type"] == "group" {
            memory = memory.child(caption("Private memories stay in direct conversations.", p));
        } else {
            if let Some(state) = self.resource_status("memories", cx) {
                memory = memory.child(state);
            }
            let value = self
                .context_work
                .resources
                .get("memories")
                .unwrap_or(&Value::Null);
            for item in rows(value, "memories") {
                let item = item.clone();
                let id = text(&item, "id").to_owned();
                memory = memory
                    .child(caption(text(&item, "text").to_owned(), p))
                    .child(
                        button(
                            SharedString::from(format!("correct-memory:{id}")),
                            "Correct…",
                            ButtonKind::Ghost,
                            p,
                            cx,
                        )
                        .on_click(cx.listener(
                            move |this, _, window, cx| {
                                this.set_context_field("memory", text(&item, "text"), window, cx);
                                this.context_work.form = Some(("memory".into(), item.clone()));
                                cx.notify();
                            },
                        )),
                    );
            }
            if rows(value, "memories").is_empty() && value.is_object() {
                memory = memory.child(caption("No memories from this conversation yet.", p));
            }
            if let Some(after) = value["next_after"].as_str() {
                let after = after.to_owned();
                memory = memory.child(
                    button(
                        "more-memory",
                        "Show more memories",
                        ButtonKind::Ghost,
                        p,
                        cx,
                    )
                    .on_click(cx.listener(move |this, _, _, cx| {
                        if let Some(context) = this.learning_context() {
                            this.context_read(
                                "memories",
                                format!(
                                    "/v1/learning/memories?agent_id={}&thread_id={}&after={}",
                                    text(&context, "agent_id"),
                                    text(&context, "thread_id"),
                                    super::files::encode(&after)
                                ),
                                cx,
                            );
                        }
                    })),
                );
            }
            memory = memory.child(
                button("refresh-memory", "Refresh", ButtonKind::Ghost, p, cx)
                    .on_click(cx.listener(|this, _, _, cx| this.load_library(cx))),
            );
            if let Some((kind, item)) = &self.context_work.form
                && kind == "memory"
                && let Some(input) = self.context_work.fields.get("memory")
            {
                let write = item.clone();
                let delete = item.clone();
                memory = memory.child(Input::new(input).aria_label("Memory correction"))
                    .child(
                        button("save-memory", "Save correction", ButtonKind::Primary, p, cx)
                            .disabled_state(self.busy, p)
                            .on_click(cx.listener(move |this, _, window, cx| {
                                let Some(input) = this.context_work.fields.get("memory") else { return; };
                                let body = json!({
                                    "memory_id": write["id"], "expected_revision": write["revision"],
                                    "visibility": write["visibility"], "text": input.read(cx).value().to_string(),
                                    "context": this.learning_context()
                                });
                                this.dispatch(
                                    "memory-write".into(),
                                    Operation::command("/v1/learning/memories/write".into(), body, this.selected),
                                    window, cx,
                                );
                            })),
                    ).child(
                        button("delete-memory", "Delete memory", ButtonKind::Ghost, p, cx)
                            .disabled_state(self.busy, p)
                            .on_click(cx.listener(move |this, _, window, cx| {
                                this.dispatch(
                                    "memory-delete".into(),
                                    Operation::command(
                                        "/v1/learning/memories/delete".into(),
                                        json!({
                                            "memory_id": delete["id"], "expected_revision": delete["revision"],
                                            "context": this.learning_context()
                                        }),
                                        this.selected,
                                    ),
                                    window, cx,
                                );
                            })),
                    );
            }
        }
        memory = memory.child(
            button("library-skills", "Skills", ButtonKind::Ghost, p, cx).on_click(cx.listener(
                |this, _, window, cx| {
                    this.load_library(cx);
                    this.locate_context(Location::Skills, window, cx);
                },
            )),
        );
        view = view.child(memory);
        let mut files = div().flex().flex_col().gap(ui(12.)).child(
            div()
                .text_size(ui(16.))
                .font_weight(FontWeight::SEMIBOLD)
                .child("Files"),
        );
        let outputs: Vec<_> = rows(self.value(), "artifacts")
            .iter()
            .filter(|a| a["origin"] == "native_output")
            .collect();
        if outputs.is_empty() {
            files = files.child(caption("Files created by your agent will appear here.", p));
        }
        for artifact in outputs {
            let artifact = artifact.clone();
            let id = text(&artifact, "id").to_owned();
            files = files.child(
                button(
                    SharedString::from(format!("library-file:{id}")),
                    "",
                    ButtonKind::Ghost,
                    p,
                    cx,
                )
                .accessibility_label(format!("File {}", text(&artifact, "name")))
                .w_full()
                .h_auto()
                .p(ui(12.))
                .justify_start()
                .gap(ui(12.))
                .child(super::files::file_icon(
                    text(&artifact, "name"),
                    false,
                    false,
                    self.store.dark(),
                ))
                .child(
                    div()
                        .flex_1()
                        .min_w_0()
                        .text_left()
                        .child(text(&artifact, "name").to_owned()),
                )
                .on_click(cx.listener(move |this, _, window, cx| {
                    this.open_artifact(artifact.clone(), window, cx)
                })),
            );
        }
        view.child(files).into_any_element()
    }
    pub(in crate::workspace) fn artifact_info(
        &self,
        id: &str,
        cx: &mut Context<Self>,
    ) -> AnyElement {
        let p = Palette::new(self.store.dark());
        let Some(artifact) = rows(self.value(), "artifacts")
            .iter()
            .find(|a| a["id"] == id)
        else {
            return caption("This file is no longer available.", p).into_any_element();
        };
        let mut view = div().flex().flex_col().gap(ui(16.)).child(
            div()
                .text_size(ui(18.))
                .child(text(artifact, "name").to_owned()),
        );
        for key in [
            "media_type",
            "origin",
            "sha256",
            "source_path",
            "created_at",
        ] {
            view = view.child(caption(
                format!("{}: {}", key.replace('_', " "), text(artifact, key)),
                p,
            ));
        }
        let open = artifact.clone();
        view = view
            .child(
                button("open-saved-file", "Open file", ButtonKind::Outline, p, cx).on_click(
                    cx.listener(move |this, _, window, cx| {
                        this.open_artifact(open.clone(), window, cx)
                    }),
                ),
            )
            .child(
                button(
                    "share-file-destinations",
                    "Share a copy to another conversation…",
                    ButtonKind::Ghost,
                    p,
                    cx,
                )
                .on_click(cx.listener(|this, _, _, cx| {
                    this.context_read("destinations", "/v1/entities/workspace".into(), cx)
                })),
            );
        if let Some(destinations) = self
            .context_work
            .resources
            .get("destinations")
            .and_then(Value::as_array)
        {
            for destination in destinations
                .iter()
                .filter(|w| w["state"] == "active" && w["id"] != artifact["workspace_id"])
            {
                let artifact = artifact.clone();
                let destination = destination.clone();
                view = view.child(
                    button(
                        SharedString::from(format!("share-to:{}", text(&destination, "id"))),
                        format!("Share to {}", text(&destination, "name")),
                        ButtonKind::Outline,
                        p,
                        cx,
                    )
                    .disabled_state(self.busy, p)
                    .on_click(cx.listener(move |this, _, window, cx| {
                        let id = text(&artifact, "id");
                        this.dispatch(
                            format!("share:{id}"),
                            Operation::command(
                                format!("/v1/artifacts/{id}/share"),
                                json!({"workspace_id":destination["id"]}),
                                this.selected,
                            ),
                            window,
                            cx,
                        );
                    })),
                );
            }
        }
        view.into_any_element()
    }
}
