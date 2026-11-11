//! Backend-owned FIFO messages, with Zed-inspired next-entry and edit affordances.
use super::*;
use crate::ui::{
    controls::{ButtonKind, ProductButtonStyle, button, caption},
    theme::{Palette, ui},
    workspace::action,
};
use ngertiin_client::{rows, text};
impl Workspace {
    pub(super) fn queue_view(&self, cx: &mut Context<Self>) -> Option<AnyElement> {
        let p = Palette::new(self.store.dark());
        let value = self.value();
        let queued: Vec<_> = rows(value, "messages")
            .iter()
            .filter_map(|message| {
                if message["author"] != "user"
                    || message["state"] == "deleted"
                    || self
                        .conversation
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
        let owner = cx.entity().downgrade();
        tray = tray.child(
            button(
                "toggle-message-queue",
                format!(
                    "{} queued · {}",
                    queued.len(),
                    if self.conversation.queue_expanded {
                        "Hide"
                    } else {
                        "Show"
                    }
                ),
                ButtonKind::Ghost,
                p,
                cx,
            )
            .w_full()
            .justify_start()
            .on_click(move |_, _, cx| {
                let _ = owner.update(cx, |this, cx| {
                    this.conversation.queue_expanded = !this.conversation.queue_expanded;
                    cx.notify();
                });
            }),
        );
        if !self.conversation.queue_expanded {
            return Some(tray.into_any_element());
        }
        tray = tray.child(caption("↑ in an empty composer edits the next message", p));
        for (index, (message, run)) in queued.into_iter().enumerate() {
            let edit = (*message).clone();
            let delete = (*message).clone();
            let disabled =
                self.busy || self.conversation.reconciling || self.conversation.editing.is_some();
            let mut row = div()
                .flex()
                .items_center()
                .gap(ui(8.))
                .min_h(ui(36.))
                .child(caption(
                    if index == 0 {
                        "Next".to_owned()
                    } else {
                        format!("{}", index + 1)
                    },
                    p,
                ))
                .child(
                    div()
                        .flex_1()
                        .min_w_0()
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
                    .disabled_state(disabled || !self.steer_supported(&active), p)
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

    pub(super) fn edit_next_queued(&mut self, window: &mut Window, cx: &mut Context<Self>) {
        if self.busy
            || self.conversation.reconciling
            || self.conversation.editing.is_some()
            || self.staging_task.is_some()
            || self.selected.is_some_and(|thread| {
                !self.store.files(thread).is_empty()
                    || self.store.pending(&format!("message:{thread}")).is_some()
            })
        {
            return;
        }
        let message = rows(self.value(), "messages")
            .iter()
            .find(|message| {
                message["author"] == "user"
                    && message["state"] != "deleted"
                    && rows(self.value(), "runs").iter().any(|run| {
                        run["input_message_id"] == message["id"] && run["status"] == "queued"
                    })
            })
            .cloned();
        if let Some(message) = message {
            self.edit(message, window, cx);
        }
    }
    pub(super) fn steer_supported(&self, run: &Value) -> bool {
        self.connections
            .iter()
            .find(|connection| connection["id"] == run["connection_id"])
            .is_some_and(|connection| {
                connection["state"] == "active"
                    && connection["capabilities"]["steer"] == "supported"
            })
    }
}
