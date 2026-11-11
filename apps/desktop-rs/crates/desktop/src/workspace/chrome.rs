use super::*;
use crate::ui::{
    controls::{ButtonKind, ProductButtonStyle, button},
    theme::{Palette, ui},
    workspace::header_action,
};
use gpui_kit::base::TestSupportExt;
use gpui_kit::{
    component::{WindowExt, checkbox::Checkbox, input::Input},
    prelude::FluentBuilder as _,
};
use ngertiin_client::{rows, text};

impl Workspace {
    pub(super) fn selected_agent(&self) -> Option<&Value> {
        let id = if self.value()["thread"]["type"] == "group" {
            self.recipient.map(|id| id.to_string())
        } else {
            rows(&self.value()["thread"], "member_agent_ids")
                .first()
                .and_then(Value::as_str)
                .map(str::to_owned)
        }?;
        self.agents.iter().find(|agent| agent["id"] == id)
    }
    pub(super) fn header_view(&self, narrow: bool, cx: &mut Context<Self>) -> AnyElement {
        let p = Palette::new(self.store.dark());
        let thread = &self.value()["thread"];
        let label = if thread.is_null() {
            "Ngertiin".into()
        } else {
            self.label(thread)
        };
        let left = div()
            .w_full()
            .h_full()
            .flex()
            .items_center()
            .when(narrow, |v| {
                v.child(
                    header_action("toggle-sidebar", "Buka percakapan", "Menu01Icon", p, cx)
                        .on_click(cx.listener(|this, _, window, cx| {
                            this.open_navigation(window, cx);
                        })),
                )
            });
        let identity = button("conversation-identity", "", ButtonKind::Ghost, p, cx)
            .accessibility_label(format!("Detail {label}"))
            .h(ui(39.))
            .pl(ui(7.5))
            .pr(ui(13.5))
            .py(ui(7.5))
            .gap(ui(8.))
            .rounded_full()
            .bg(p.color("header-surface"))
            .text_size(ui(14.))
            .font_weight(FontWeight::MEDIUM)
            .child(self.thread_portrait(thread, "header", cx))
            .child(div().min_w_0().truncate().child(label))
            .on_click(
                cx.listener(|this, _, window, cx| this.toggle_context(Panel::Detail, window, cx)),
            );
        let mut right = div().flex().items_center().justify_end().gap(ui(12.));
        if thread["type"] == "dm"
            && let Some(agent) = self.selected_agent()
        {
            let connection = self
                .connections
                .iter()
                .find(|connection| connection["id"] == agent["connection_id"]);
            let billing = connection
                .and_then(|c| c["authentication"]["billing_source"].as_str())
                .unwrap_or("unknown");
            let model = agent["model_id"].as_str().unwrap_or("Pilih model");
            let trigger = button("model-picker", "", ButtonKind::Ghost, p, cx)
                .accessibility_label("Pilih model")
                .tooltip(format!("{model} · {billing}"))
                .h(ui(39.))
                .rounded_full()
                .bg(p.color("header-surface"))
                .px(ui(12.))
                .gap(ui(7.))
                .text_size(ui(13.))
                .child(super::model_picker::provider_mark(
                    agent["harness"] == "muse",
                    p,
                ))
                .child(div().max_w(ui(156.)).truncate().child(model.to_owned()));
            right = right.child(self.model_picker_trigger(trigger, agent, "header", cx));
        }
        right = right
            .child(
                header_action(
                    "find-in-conversation",
                    "Find in conversation · ⌘F",
                    "Search01Icon",
                    p,
                    cx,
                )
                .toggled(self.conversation.find.read(cx).open)
                .when(self.conversation.find.read(cx).open, |button| {
                    button
                        .accessibility_label("Close conversation search")
                        .bg(p.color("search-surface"))
                        .border_1()
                        .border_color(p.color("search-border"))
                })
                .on_click(cx.listener(|this, _, window, cx| this.toggle_thread_find(window, cx))),
            )
            .child(
                header_action("open-computer", "Browser agent", "ComputerIcon", p, cx).on_click(
                    cx.listener(|this, _, _, cx| {
                        this.panel = Some(Panel::Computer);
                        cx.notify();
                    }),
                ),
            );
        div()
            .id("conversation-header")
            .test_support()
            .relative()
            .h(ui(59.))
            .w_full()
            .flex_shrink_0()
            .px(ui(20.))
            .flex()
            .items_center()
            .justify_between()
            .child(left)
            .child(
                div()
                    .absolute()
                    .inset_0()
                    .flex()
                    .items_center()
                    .justify_center()
                    .child(identity.max_w(relative(0.5))),
            )
            .child(div().absolute().right(ui(20.)).top(ui(10.)).child(right))
            .into_any_element()
    }
    pub(super) fn open_group_dialog(&mut self, window: &mut Window, cx: &mut Context<Self>) {
        let weak = cx.entity().downgrade();
        window.open_dialog(cx, move |dialog, window, cx| {
            dialog
                .title("Create group")
                .width(window.rem_size() * 26.25)
                .child(
                    weak.update(cx, |this, cx| this.group_form(cx))
                        .unwrap_or_else(|_| div().into_any_element()),
                )
        });
        self.group_name
            .update(cx, |input, cx| input.focus(window, cx));
    }
    fn group_form(&self, cx: &mut Context<Self>) -> AnyElement {
        let p = Palette::new(self.store.dark());
        div()
            .flex()
            .flex_col()
            .gap(ui(12.))
            .child(Input::new(&self.group_name).aria_label("Group name"))
            .children(self.agents.iter().filter_map(|agent| {
                let id = text(agent, "id").parse::<Uuid>().ok()?;
                Some(
                    Checkbox::new(SharedString::from(format!("group-member:{id}")))
                        .label(text(agent, "name").to_owned())
                        .checked(self.group_members.contains(&id))
                        .on_click(cx.listener(move |this, checked, _, cx| {
                            this.group_members.retain(|v| *v != id);
                            if *checked {
                                this.group_members.push(id);
                            }
                            cx.notify();
                        })),
                )
            }))
            .child(
                div()
                    .flex()
                    .justify_end()
                    .gap(ui(8.))
                    .child(
                        button("cancel-group", "Cancel", ButtonKind::Ghost, p, cx)
                            .on_click(|_, window, cx| window.close_dialog(cx)),
                    )
                    .child(
                        button("confirm-group", "Create", ButtonKind::Primary, p, cx)
                            .disabled_state(self.busy || self.group_members.is_empty(), p)
                            .on_click(
                                cx.listener(|this, _, window, cx| this.create_group(window, cx)),
                            ),
                    ),
            )
            .into_any_element()
    }
}
