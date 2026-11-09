use super::*;
use crate::ui::{
    controls::{ButtonKind, ProductButtonStyle, button, caption},
    theme::{Palette, agent_bubble, ui},
    workspace::{action, action_tinted},
};
use gpui_kit::base::TestSupportExt;
use ngertiin_client::{rows, text};

impl Workspace {
    fn queue_view(&self, cx: &mut Context<Self>) -> Option<AnyElement> {
        let p = Palette::new(self.store.dark());
        let value = self.value();
        let queued: Vec<_> = rows(value, "messages")
            .iter()
            .filter_map(|message| {
                if message["author"] != "user"
                    || message["state"] == "deleted"
                    || self
                        .parts
                        .values()
                        .any(|part| part["message_id"] == message["id"])
                {
                    return None;
                }
                rows(value, "runs")
                    .iter()
                    .rev()
                    .find(|run| {
                        run["input_message_id"] == message["id"] && run["status"] == "queued"
                    })
                    .map(|run| (message, run))
            })
            .collect();
        if queued.is_empty() {
            return None;
        }
        let mut tray = div()
            .id("composer-message-queue")
            .role(Role::Group)
            .aria_label(format!("{} queued messages", queued.len()))
            .flex()
            .flex_col()
            .max_h(ui(144.))
            .overflow_y_scroll()
            .mx(ui(12.))
            .px(ui(10.))
            .py(ui(6.))
            .rounded_t(ui(16.))
            .bg(p.color("secondary"));
        for (message, run) in queued {
            let edit = (*message).clone();
            let delete = (*message).clone();
            let disabled = self.busy || self.editing.is_some();
            let mut row = div()
                .flex()
                .items_center()
                .gap(ui(8.))
                .min_h(ui(36.))
                .child(crate::ui::workspace::glyph("ArrowTurnForwardIcon", 14., p))
                .child(
                    div()
                        .flex_1()
                        .min_w_0()
                        .truncate()
                        .text_size(ui(14.))
                        .child(text(message, "text").to_owned()),
                );
            if let Some(active) = rows(value, "runs")
                .iter()
                .find(|active| {
                    active["agent_id"] == run["agent_id"]
                        && active["status"] == "running"
                        && !active["native_run_id"].is_null()
                })
                .cloned()
            {
                let run = (*run).clone();
                row = row.child(
                    action(
                        SharedString::from(format!("steer:{}", text(message, "id"))),
                        "Steer queued message",
                        "ArrowTurnForwardIcon",
                        p,
                        cx,
                    )
                    .size(ui(28.))
                    .disabled_state(disabled, p)
                    .on_click(cx.listener(move |this, _, window, cx| {
                        this.steer(active.clone(), Some(run.clone()), window, cx)
                    })),
                );
            }
            row = row
                .child(
                    action(
                        SharedString::from(format!("edit:{}", text(message, "id"))),
                        "Edit queued message",
                        "PencilEdit01Icon",
                        p,
                        cx,
                    )
                    .size(ui(28.))
                    .disabled_state(disabled, p)
                    .on_click(
                        cx.listener(move |this, _, window, cx| this.edit(edit.clone(), window, cx)),
                    ),
                )
                .child(
                    action(
                        SharedString::from(format!("delete:{}", text(message, "id"))),
                        "Delete queued message",
                        "Delete02Icon",
                        p,
                        cx,
                    )
                    .size(ui(28.))
                    .disabled_state(disabled, p)
                    .on_click(cx.listener(move |this, _, window, cx| {
                        this.delete(delete.clone(), window, cx)
                    })),
                );
            tray = tray.child(row);
        }
        Some(tray.into_any_element())
    }
    pub(super) fn composer_view(&self, cx: &mut Context<Self>) -> AnyElement {
        let p = Palette::new(self.store.dark());
        let draft = self.composer.read(cx).snapshot(cx).draft.text;
        let response_locked = self.composer_response_locked(cx);
        let pending = self
            .selected
            .and_then(|thread| self.store.pending(&format!("message:{thread}")));
        let files = self
            .selected
            .map(|thread| self.store.files(thread))
            .unwrap_or_default();
        let active = rows(self.value(), "runs")
            .iter()
            .find(|run| matches!(text(run, "status"), "running" | "dispatching"));
        let blank = draft.trim().is_empty() && files.is_empty();
        let stop = blank && pending.is_none() && self.editing.is_none() && active.is_some();
        let fill = if self.value()["thread"]["type"] == "group" {
            p.color("primary")
        } else {
            self.selected_agent()
                .map(|agent| agent_bubble(agent, p))
                .unwrap_or(p.color("user-bubble"))
        };
        let mut content = div().flex().flex_col().gap(ui(8.));
        if let Some(notice) = self.context_notice() {
            content = content.child(notice);
        }
        if let Some(chip) = self.context_chip(cx) {
            content = content.child(div().flex().items_start().child(chip));
        }
        if let (Some(thread), Some(agent)) = (self.selected, self.recipient) {
            let name = self
                .agents
                .iter()
                .find(|item| item["id"] == agent.to_string())
                .map(|item| text(item, "name"))
                .unwrap_or("Agent");
            content = content.child(
                button(
                    "clear-recipient",
                    format!("Kepada {name} ×"),
                    ButtonKind::Ghost,
                    p,
                    cx,
                )
                .disabled_state(self.busy || pending.is_some(), p)
                .on_click(cx.listener(move |this, _, _, cx| {
                    match this.store.choose_recipient(thread, None) {
                        Ok(()) => this.recipient = None,
                        Err(error) => this.error = error.to_string(),
                    }
                    cx.notify();
                })),
            );
        }
        for (slot, operation) in self
            .store
            .unresolved()
            .into_iter()
            .filter(|(slot, operation)| {
                !slot.starts_with("message:")
                    && !slot.starts_with("native:")
                    && !slot.starts_with("human:")
                    && !self.busy
                    && (operation.thread.is_none() || operation.thread == self.selected)
            })
        {
            content = content.child(
                div()
                    .flex()
                    .items_center()
                    .gap(ui(8.))
                    .child(caption("Perubahan belum terkonfirmasi", p))
                    .child(
                        button(
                            SharedString::from(format!("recover:{slot}")),
                            "Coba lagi",
                            ButtonKind::Ghost,
                            p,
                            cx,
                        )
                        .disabled_state(self.busy || !self.checked || !operation.replayable, p)
                        .on_click(cx.listener(
                            move |this, _, window, cx| {
                                this.dispatch(slot.clone(), operation.clone(), window, cx);
                            },
                        )),
                    ),
            );
        }
        if self.editing.is_some() {
            content = content.child(
                div()
                    .flex()
                    .items_center()
                    .gap(ui(8.))
                    .child(caption("Mengedit pesan antrean", p))
                    .child(
                        action("cancel-edit", "Batal edit pesan", "Cancel01Icon", p, cx).on_click(
                            cx.listener(|this, _, window, cx| {
                                this.editing = None;
                                this.restore_draft(window, cx);
                                cx.notify();
                            }),
                        ),
                    ),
            );
        }
        if let Some(thread) = self.selected {
            let mut attachments = div().flex().flex_wrap().gap(ui(8.));
            for file in &files {
                let id = file.id;
                if self.is_context_file(id) {
                    continue;
                }
                let name = file.name.clone();
                let preview = button(
                    SharedString::from(format!("preview-file:{id}")),
                    "",
                    ButtonKind::Ghost,
                    p,
                    cx,
                )
                .accessibility_label(file.name.clone())
                .h(ui(32.))
                .gap(ui(8.))
                .child(context::file_icon(
                    &file.name,
                    false,
                    false,
                    self.store.dark(),
                ))
                .child(div().min_w_0().truncate().child(file.name.clone()))
                .max_w(ui(260.))
                .on_click(cx.listener(move |this, _, window, cx| {
                    this.open_local_file(id, name.clone(), window, cx)
                }));
                let remove = action(
                    SharedString::from(format!("remove-file:{id}")),
                    format!("Remove {}", file.name),
                    "Cancel01Icon",
                    p,
                    cx,
                )
                .size(ui(24.))
                .rounded_full()
                .disabled_state(pending.is_some() || self.busy, p)
                .on_click(cx.listener(move |this, _, _, cx| {
                    if let Err(error) = this.store.remove_file(thread, id) {
                        this.error = error.to_string();
                    }
                    cx.notify();
                }));
                attachments = attachments.child(
                    div()
                        .flex()
                        .items_center()
                        .max_w_full()
                        .pr(ui(4.))
                        .rounded(ui(12.))
                        .bg(p.color("composer"))
                        .child(preview)
                        .child(remove),
                );
            }
            if !files.is_empty() {
                content = content.child(attachments);
            }
        }
        if pending.is_some() && !self.busy {
            content = content.child(caption(
                "Pengiriman belum terkonfirmasi. Coba lagi dengan pesan yang sama.",
                p,
            ));
        }
        if self.staging_task.is_some() {
            content = content.child(caption("Menyiapkan lampiran…", p));
        }
        let multiline = draft.contains('\n') || draft.chars().count() > 100;
        let attach = action("attach-file", "Tambah lampiran", "Add01Icon", p, cx)
            .size(ui(28.))
            .rounded_full()
            .bg(p.color("header-surface"))
            .disabled_state(
                self.busy
                    || response_locked
                    || pending.is_some()
                    || self.staging_task.is_some()
                    || self.editing.is_some()
                    || self.selected.is_none(),
                p,
            )
            .on_click(cx.listener(|this, _, window, cx| this.attach(window, cx)));
        let send = action_tinted(
            "send-message",
            if stop {
                "Stop run"
            } else if pending.is_some() {
                "Coba kirim lagi"
            } else if self.editing.is_some() {
                "Simpan perubahan"
            } else {
                "Kirim"
            },
            if stop { "StopIcon" } else { "ArrowUp02Icon" },
            p.color("primary-foreground"),
            p,
            cx,
        )
        .size(ui(28.))
        .rounded_full()
        .bg(fill)
        .text_color(p.color("primary-foreground"))
        .disabled_state(
            self.busy
                || response_locked
                || self.staging_task.is_some()
                || self.projection.is_none()
                || !self.checked
                || (blank && !stop && pending.is_none()),
            p,
        )
        .on_click(cx.listener(move |this, _, window, cx| {
            if stop {
                this.request_stop(window, cx);
            } else {
                this.send(window, cx);
            }
        }));
        let mut actions = div().flex().items_center().gap(ui(6.));
        if let Some(run) = active
            .filter(|run| !run["native_run_id"].is_null())
            .cloned()
            && !blank
        {
            actions =
                actions.child(
                    action(
                        "steer-current",
                        "Arahkan sekarang",
                        "ArrowRight01Icon",
                        p,
                        cx,
                    )
                    .size(ui(28.))
                    .rounded_full()
                    .bg(p.color("header-surface"))
                    .disabled_state(self.busy || response_locked, p)
                    .on_click(cx.listener(move |this, _, window, cx| {
                        this.steer(run.clone(), None, window, cx)
                    })),
                );
        }
        actions = actions.child(send);
        let shell = if multiline {
            div()
                .flex()
                .flex_col()
                .gap(ui(8.))
                .child(self.composer.clone())
                .child(
                    div()
                        .flex()
                        .items_center()
                        .justify_between()
                        .child(attach)
                        .child(actions),
                )
        } else {
            div()
                .flex()
                .items_end()
                .gap(ui(6.))
                .child(attach)
                .child(div().flex_1().min_w_0().child(self.composer.clone()))
                .child(actions)
        };
        if let Some(queue) = self.queue_view(cx) {
            content = content.child(queue);
        }
        content = content.child(
            shell
                .p(ui(8.))
                .rounded(ui(if multiline { 18. } else { 22. }))
                .bg(p.color("composer"))
                .border_1()
                .border_color(p.color("composer-outline")),
        );
        div()
            .w_full()
            .px(ui(20.))
            .pt(ui(12.))
            .pb(ui(16.))
            .child(content.w_full().id("composer-content").test_support())
            .into_any_element()
    }
}
