use super::*;
use crate::ui::{
    controls::{ButtonKind, button},
    theme::{Palette, ui},
    workspace::action,
};
use gpui_kit::component::Selectable;
use gpui_kit::prelude::FluentBuilder as _;
use ngertiin_client::{rows, text};

impl Workspace {
    pub(super) fn panel(&self, cx: &mut Context<Self>) -> AnyElement {
        let p = Palette::new(self.store.dark());
        let Some(panel) = self.panel else {
            return div().into_any_element();
        };
        if panel == Panel::Settings {
            return self.settings_view(cx);
        }
        let thread = &self.value()["thread"];
        let title = self.label(thread);
        let id = text(thread, "id");
        let mut hero = div()
            .flex()
            .flex_col()
            .items_center()
            .gap(ui(8.))
            .mt(ui(14.))
            .px(ui(20.));
        let mut portraits = div().flex().items_center().justify_center();
        for agent in rows(thread, "member_agent_ids")
            .iter()
            .filter_map(Value::as_str)
            .take(if thread["type"] == "group" { 3 } else { 1 })
        {
            if let Some(portrait) = self.portrait(&format!("hero:{id}:{agent}")) {
                portraits = portraits.child(portrait);
            }
        }
        hero = hero.child(portraits).child(
            div()
                .w_full()
                .whitespace_normal()
                .text_size(ui(20.))
                .line_height(ui(28.))
                .font_weight(FontWeight::MEDIUM)
                .text_center()
                .child(title),
        );
        let selected = match panel {
            Panel::Library => 1,
            Panel::Computer => 2,
            _ => 0,
        };
        let mut tabs = div()
            .id("conversation-context-tabs")
            .role(Role::TabList)
            .aria_label("Conversation details")
            .flex()
            .items_center()
            .justify_center()
            .w_full()
            .gap(ui(6.))
            .on_key_down(cx.listener(|this, event: &KeyDownEvent, window, cx| {
                let selected = match this.panel {
                    Some(Panel::Library) => 1,
                    Some(Panel::Computer) => 2,
                    _ => 0,
                };
                if let Some(next) =
                    crate::ui::tabs::navigation_target(selected, 3, &event.keystroke.key)
                {
                    this.select_context_tab(
                        [Panel::Detail, Panel::Library, Panel::Computer][next],
                        window,
                        cx,
                    );
                    this.context_tab_focus[next].focus(window, cx);
                    window.prevent_default();
                    cx.stop_propagation();
                    cx.notify();
                }
            }));
        for (index, label) in ["Details", "Library", "Computer"].into_iter().enumerate() {
            tabs = tabs.child(
                button(("context-tab", index), "", ButtonKind::Ghost, p, cx)
                    .accessibility_label(label)
                    .child(
                        div()
                            .w_full()
                            .text_center()
                            .text_size(ui(13.))
                            .line_height(ui(20.))
                            .child(label),
                    )
                    .role(Role::Tab)
                    .selected(index == selected)
                    .toggled(index == selected)
                    .tab_index(if index == selected { 0 } else { -1 })
                    .track_focus(&self.context_tab_focus[index])
                    .h(ui(32.))
                    .flex_1()
                    .min_w_0()
                    .rounded_full()
                    .px(ui(8.))
                    .when(index == selected, |tab| tab.bg(p.color("secondary")))
                    .on_click(cx.listener(move |this, _, window, cx| {
                        this.select_context_tab(
                            [Panel::Detail, Panel::Library, Panel::Computer][index],
                            window,
                            cx,
                        );
                    })),
            );
        }
        let content = self.context_body(cx);

        let body = if self.working_files_open() {
            content
        } else {
            div()
                .id("context-panel-scroll")
                .flex_1()
                .min_h_0()
                .overflow_y_scroll()
                .track_scroll(&self.context_scroll())
                .when(!self.context_nested(), |view| {
                    view.child(hero)
                        .child(div().px(ui(12.)).mt(ui(16.)).child(tabs))
                })
                .child(div().px(ui(16.)).py(ui(20.)).child(content))
                .into_any_element()
        };
        div()
            .id("native-context-panel")
            .track_focus(&self.context_focus())
            .h_full()
            .flex()
            .flex_col()
            .min_h_0()
            .bg(p.color("background"))
            .rounded_r(ui(16.))
            .border_l_1()
            .border_color(p.color("border-subtle"))
            .child(
                div()
                    .h(ui(56.))
                    .flex_shrink_0()
                    .flex()
                    .items_center()
                    .justify_between()
                    .px(ui(12.))
                    .child(self.context_toolbar(cx))
                    .child(
                        action("close-panel", "Tutup detail", "Cancel01Icon", p, cx)
                            .rounded_full()
                            .on_click(cx.listener(|this, _, window, cx| {
                                this.close_context(window, cx);
                            })),
                    ),
            )
            .child(body)
            .into_any_element()
    }
}
