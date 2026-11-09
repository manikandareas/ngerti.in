use super::*;
use crate::storage::Operation;
use gpui_kit::component::ActiveTheme;
use ngertiin_client::{ClientError, rows, text};
use serde_json::json;

impl Workspace {
    pub(super) fn request_stop(&mut self, window: &mut Window, cx: &mut Context<Self>) {
        let runs: Vec<_> = rows(self.value(), "runs")
            .iter()
            .filter(|run| matches!(text(run, "status"), "running" | "dispatching"))
            .cloned()
            .collect();
        if runs.len() == 1 {
            self.run_command(runs[0].clone(), "cancel", window, cx);
        } else if runs.len() > 1 {
            let names = self.agents.clone();
            let owner = cx.entity().downgrade();
            window.open_dialog(cx, move |dialog, _, cx| {
                let p = crate::ui::theme::Palette::new(cx.theme().mode.is_dark());
                dialog.title("Choose an agent to stop").child(
                    div()
                        .flex()
                        .flex_col()
                        .gap_2()
                        .children(runs.iter().map(|run| {
                            let run = run.clone();
                            let name = names
                                .iter()
                                .find(|agent| agent["id"] == run["agent_id"])
                                .map(|agent| text(agent, "name"))
                                .unwrap_or("Agent");
                            let owner = owner.clone();
                            crate::ui::controls::button(
                                SharedString::from(format!("stop-choice:{}", text(&run, "id"))),
                                format!("Stop {name}"),
                                crate::ui::controls::ButtonKind::Default,
                                p,
                                cx,
                            )
                            .on_click(move |_, window, cx| {
                                window.close_dialog(cx);
                                let _ = owner.update(cx, |this, cx| {
                                    this.run_command(run.clone(), "cancel", window, cx)
                                });
                            })
                        })),
                )
            });
        }
    }
    pub(super) fn dispatch(
        &mut self,
        slot: String,
        operation: Operation,
        window: &mut Window,
        cx: &mut Context<Self>,
    ) {
        if self.busy || !self.checked || (!self.bound && operation.request.path != "/v1/setup") {
            return;
        }
        if self.store.pending(&slot).is_some_and(|op| !op.replayable) {
            self.refresh(true, window, cx);
            cx.notify();
            return;
        }
        let operation = match self.store.prepare(&slot, operation) {
            Ok(op) => op,
            Err(e) => {
                self.error = e.to_string();
                cx.notify();
                return;
            }
        };
        let Some(worker) = &self.writes else {
            return;
        };
        let sent = operation.clone();
        let receiver = match worker.submit(true, move |api| sent.execute(api)) {
            Ok(v) => v,
            Err(e) => {
                self.error = e.to_string();
                cx.notify();
                return;
            }
        };
        self.busy = true;
        self.lock_composer(cx);
        self.error.clear();
        self.clear_context_error();
        let scope = self.scope;
        self.command_task = Some(cx.spawn_in(window, async move |view, cx| {
            let result = receiver.await.unwrap_or(Err(ClientError::Unavailable));
            let _ = view.update_in(cx, |this, window, cx| {
                this.finish_command(&slot, &operation, scope, result, window, cx);
            });
        }));
        cx.notify();
    }

    fn finish_command(
        &mut self,
        slot: &str,
        operation: &Operation,
        scope: u64,
        result: Result<Value, ClientError>,
        window: &mut Window,
        cx: &mut Context<Self>,
    ) {
        self.busy = false;
        self.command_task = None;
        if let Err(error) = self.store.finish(slot, operation.request.key, &result) {
            self.error = error.to_string();
            self.lock_composer(cx);
            cx.notify();
            return;
        }
        match result {
            Ok(result) => {
                if let Some(authored) = operation.authored.as_deref() {
                    if let Err(error) = self.store.clear_sent(operation) {
                        self.error = error.to_string();
                    }
                    if self.selected == operation.thread
                        && self.scope == scope
                        && self.composer.read(cx).snapshot(cx).draft.text == authored
                    {
                        self.restore_draft(window, cx);
                    }
                }
                if slot.starts_with("message:") && self.scope == scope {
                    self.accepted_focus(window, cx);
                }
                self.context_command_confirmed(operation, &result, window, cx);
                let path = operation.request.path.as_str();
                if path.starts_with("/v1/messages/")
                    && path.ends_with("/edit")
                    && self.scope == scope
                {
                    self.editing = None;
                    self.restore_draft(window, cx);
                }
                if path.starts_with("/v1/creation/") || path == "/v1/setup" {
                    let thread = result["thread"]["id"]
                        .as_str()
                        .or_else(|| result["thread_id"].as_str())
                        .and_then(|id| id.parse().ok());
                    if let Some(thread) = thread
                        && self.scope == scope
                    {
                        window.close_dialog(cx);
                        self.select(thread, window, cx);
                    }
                }
            }
            Err(error) => {
                self.error = error.to_string();
                self.context_failure(error.to_string());
            }
        }
        self.lock_composer(cx);
        self.read_task = None;
        self.refresh(true, window, cx);
        cx.notify();
    }

    pub(super) fn send(&mut self, window: &mut Window, cx: &mut Context<Self>) {
        if self.staging_task.is_some()
            || self
                .composer
                .update(cx, |composer, cx| composer.is_composing(window, cx))
        {
            return;
        }
        let Some(thread) = self.selected else {
            return;
        };
        let draft = self.composer.read(cx).snapshot(cx).draft;
        if let Some(message) = self.editing.clone() {
            if draft.text.trim().is_empty() {
                return;
            }
            let id = text(&message, "id");
            self.dispatch(
                format!("edit:{id}"),
                Operation::command(
                    format!("/v1/messages/{id}/edit"),
                    json!({"expected_revision":message["revision"],"text":draft.text}),
                    Some(thread),
                ),
                window,
                cx,
            );
            return;
        }
        if self.answer_from_composer(&draft.text, window, cx) {
            return;
        }
        let slot = format!("message:{thread}");
        let operation = if let Some(op) = self.store.pending(&slot) {
            Ok(op)
        } else {
            if draft.text.trim().is_empty() && self.store.files(thread).is_empty() {
                return;
            }
            let group = self.value()["thread"]["type"] == "group";
            let agent = if group {
                self.recipient
            } else {
                rows(&self.value()["thread"], "member_agent_ids")
                    .first()
                    .and_then(|id| id.as_str())
                    .and_then(|id| id.parse().ok())
            };
            if !group && agent.is_none() {
                return;
            }
            self.contextual_submission(thread, agent, group, draft.text, cx)
        };
        match operation {
            Ok(op) => self.dispatch(slot, op, window, cx),
            Err(e) => self.error = e.to_string(),
        }
        self.scroller
            .update(cx, |state, cx| state.scroll_to_end(cx));
    }
    pub(super) fn create_agent(&mut self, window: &mut Window, cx: &mut Context<Self>) {
        let Some(defaults) = self.agents.iter().find(|a| a["system_role"] == "tobi") else {
            self.error = "Set up Tobi before creating an agent.".into();
            cx.notify();
            return;
        };
        let connection = self
            .connections
            .iter()
            .find(|c| c["id"] == defaults["connection_id"]);
        let billing = defaults["billing_source"]
            .as_str()
            .or_else(|| connection.and_then(|c| c["authentication"]["billing_source"].as_str()));
        let Some(billing) = billing else {
            self.error="Select a default connection, model and billing source for Tobi in Settings before creating an agent.".into();
            cx.notify();
            return;
        };
        let body = json!({"connection_id":defaults["connection_id"],"harness":defaults["harness"],"model_id":defaults["model_id"],"reasoning":defaults["reasoning"],"billing_source":billing});
        self.dispatch(
            "create-agent".into(),
            Operation::command("/v1/creation/agents".into(), body, None),
            window,
            cx,
        );
    }
    pub(super) fn create_group(&mut self, window: &mut Window, cx: &mut Context<Self>) {
        let name = self.group_name.read(cx).value().to_string();
        if name.trim().is_empty() || self.group_members.is_empty() {
            return;
        }
        let body = json!({"name":name,"member_agent_ids":self.group_members});
        self.dispatch(
            "create-group".into(),
            Operation::command("/v1/creation/groups".into(), body, None),
            window,
            cx,
        );
    }
    pub(super) fn run_command(
        &mut self,
        run: Value,
        action: &str,
        window: &mut Window,
        cx: &mut Context<Self>,
    ) {
        let id = text(&run, "id");
        let body = if matches!(action, "cancel" | "reconcile") {
            json!({})
        } else {
            json!({"expected_revision":run["revision"]})
        };
        self.dispatch(
            format!("{action}:{id}"),
            Operation::command(format!("/v1/runs/{id}/{action}"), body, self.selected),
            window,
            cx,
        );
    }
    pub(super) fn edit(&mut self, message: Value, window: &mut Window, cx: &mut Context<Self>) {
        let value = text(&message, "text").to_owned();
        self.editing = Some(message);
        self.restoring = true;
        self.composer.update(cx, |composer, cx| {
            composer.restore(
                Snapshot {
                    selection: value.len()..value.len(),
                    draft: Draft {
                        text: value,
                        tokens: vec![],
                    },
                    reversed: false,
                },
                window,
                cx,
            )
        });
        self.restoring = false;
        cx.notify();
    }
    pub(super) fn delete(&mut self, message: Value, window: &mut Window, cx: &mut Context<Self>) {
        let id = text(&message, "id");
        self.dispatch(
            format!("delete:{id}"),
            Operation::command(
                format!("/v1/messages/{id}/delete"),
                json!({"expected_revision":message["revision"]}),
                self.selected,
            ),
            window,
            cx,
        );
    }
    pub(super) fn steer(
        &mut self,
        run: Value,
        queued: Option<Value>,
        window: &mut Window,
        cx: &mut Context<Self>,
    ) {
        if run["native_run_id"].is_null()
            || self.composer_response_locked(cx)
            || self
                .composer
                .update(cx, |composer, cx| composer.is_composing(window, cx))
        {
            return;
        }
        let body = if let Some(queued) = queued {
            json!({"queued_run_id":queued["id"],"expected_native_run_id":run["native_run_id"]})
        } else {
            let draft = self.composer.read(cx).snapshot(cx).draft.text;
            if draft.trim().is_empty()
                || self
                    .selected
                    .is_some_and(|id| !self.store.files(id).is_empty())
            {
                return;
            }
            json!({"text":draft,"expected_native_run_id":run["native_run_id"]})
        };
        let id = text(&run, "id");
        self.dispatch(
            format!("steer:{id}"),
            Operation::command(format!("/v1/runs/{id}/steer"), body, self.selected),
            window,
            cx,
        );
    }
    pub(super) fn attach(&mut self, window: &mut Window, cx: &mut Context<Self>) {
        let paths = cx.prompt_for_paths(PathPromptOptions {
            files: true,
            directories: false,
            multiple: true,
            prompt: None,
        });
        cx.spawn_in(window, async move |view, cx| {
            if let Ok(Ok(Some(paths))) = paths.await {
                let _ = view.update(cx, |this, cx| {
                    this.stage_entries(
                        vec![ClipboardEntry::ExternalPaths(ExternalPaths(paths.into()))],
                        cx,
                    )
                });
            }
        })
        .detach();
    }
    pub(super) fn stage_entries(&mut self, entries: Vec<ClipboardEntry>, cx: &mut Context<Self>) {
        let Some(thread) = self.selected else {
            return;
        };
        if self.staging_task.is_some() || self.store.pending(&format!("message:{thread}")).is_some()
        {
            cx.notify();
            return;
        }
        let root = self.store.file_root();
        let available = 20usize.saturating_sub(self.store.files(thread).len());
        self.staging_task = Some(cx.spawn(async move |view, cx| {
            let results = cx
                .background_executor()
                .spawn(async move {
                    let mut staged = vec![];
                    for entry in entries.into_iter().take(20) {
                        let results = match entry {
                            ClipboardEntry::ExternalPaths(paths) => paths
                                .0
                                .into_iter()
                                .take(available.saturating_sub(staged.len()))
                                .map(|path| {
                                    let metadata = std::fs::metadata(&path)?;
                                    anyhow::ensure!(
                                        metadata.is_file() && metadata.len() <= 10 * 1024 * 1024,
                                        "Choose a regular file of at most 10 MiB."
                                    );
                                    let name = path
                                        .file_name()
                                        .context("The file has no name")?
                                        .to_string_lossy()
                                        .into_owned();
                                    Ok((name.clone(), media_type(&name), std::fs::read(path)?))
                                })
                                .collect::<Vec<anyhow::Result<_>>>(),
                            ClipboardEntry::Image(image) => {
                                let extension = match image.format {
                                    ImageFormat::Png => "png",
                                    ImageFormat::Jpeg => "jpg",
                                    ImageFormat::Webp => "webp",
                                    ImageFormat::Gif => "gif",
                                    ImageFormat::Svg => "svg",
                                    ImageFormat::Bmp => "bmp",
                                    ImageFormat::Tiff => "tiff",
                                    ImageFormat::Ico => "ico",
                                    ImageFormat::Pnm => "pnm",
                                };
                                let name = format!("Pasted image.{extension}");
                                vec![Ok((name.clone(), media_type(&name), image.bytes))]
                            }
                            _ => vec![],
                        };
                        for result in results {
                            if staged.len() >= available {
                                break;
                            }
                            staged.push(result.and_then(|(name, kind, bytes)| {
                                Store::write_staged(&root, name, kind, bytes)
                            }));
                        }
                    }
                    staged
                })
                .await;
            let _ = view.update(cx, |this, cx| {
                this.staging_task = None;
                for result in results {
                    if let Err(e) = result.and_then(|file| this.store.retain_staged(thread, file)) {
                        this.error = e.to_string();
                    }
                }
                cx.notify();
            });
        }));
        cx.notify();
    }
}
pub(super) fn media_type(name: &str) -> String {
    match name
        .rsplit('.')
        .next()
        .unwrap_or("")
        .to_ascii_lowercase()
        .as_str()
    {
        "png" => "image/png",
        "jpg" | "jpeg" => "image/jpeg",
        "webp" => "image/webp",
        "gif" => "image/gif",
        "svg" => "image/svg+xml",
        "pdf" => "application/pdf",
        "csv" => "text/csv",
        "txt" | "md" | "rs" | "ts" | "py" => "text/plain",
        _ => "application/octet-stream",
    }
    .into()
}
use anyhow::Context as _;
