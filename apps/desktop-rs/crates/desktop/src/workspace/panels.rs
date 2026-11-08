use super::*;
use crate::ui::{
    controls::{ButtonKind, button, caption},
    theme::{Palette, ui},
    workspace::{action, glyph},
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
            if let Some((_, portrait)) = self.portraits.get(&format!("hero:{id}:{agent}")) {
                portraits = portraits.child(portrait.clone());
            }
        }
        hero = hero.child(portraits).child(
            div()
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
                    this.panel = Some([Panel::Detail, Panel::Library, Panel::Computer][next]);
                    this.context_tab_focus[next].focus(window, cx);
                    window.prevent_default();
                    cx.stop_propagation();
                    cx.notify();
                }
            }));
        for (index, label) in ["Details", "Library", "Computer"].into_iter().enumerate() {
            tabs = tabs.child(
                button(("context-tab", index), label, ButtonKind::Ghost, p, cx)
                    .role(Role::Tab)
                    .selected(index == selected)
                    .toggled(index == selected)
                    .tab_index(if index == selected { 0 } else { -1 })
                    .track_focus(&self.context_tab_focus[index])
                    .h(ui(32.))
                    .rounded_full()
                    .px(ui(12.))
                    .when(index == selected, |tab| tab.bg(p.color("secondary")))
                    .on_click(cx.listener(move |this, _, _, cx| {
                        this.panel = Some([Panel::Detail, Panel::Library, Panel::Computer][index]);
                        cx.notify();
                    })),
            );
        }
        let mut content = div().flex().flex_col().gap(ui(24.)).px(ui(16.)).py(ui(20.));
        match panel {
            Panel::Detail => {
                if thread["type"] == "group" {
                    let mut members = div().flex().flex_col().gap(ui(10.)).child(
                        div()
                            .text_size(ui(16.))
                            .font_weight(FontWeight::SEMIBOLD)
                            .child("Members"),
                    );
                    for agent in self
                        .agents
                        .iter()
                        .filter(|agent| rows(thread, "member_agent_ids").contains(&agent["id"]))
                    {
                        members = members.child(
                            div()
                                .flex()
                                .gap(ui(8.))
                                .items_center()
                                .child(glyph("UserIcon", 16., p))
                                .child(text(agent, "name").to_owned()),
                        );
                    }
                    content = content.child(members);
                }
                for field in ["goals", "routines"] {
                    let mut section = div().flex().flex_col().gap(ui(16.)).child(
                        div()
                            .flex()
                            .justify_between()
                            .items_center()
                            .child(
                                div()
                                    .text_size(ui(16.))
                                    .font_weight(FontWeight::SEMIBOLD)
                                    .child(if field == "goals" { "Goals" } else { "Routine" }),
                            )
                            .child(glyph("InformationCircleIcon", 14., p)),
                    );
                    if rows(self.value(), field).is_empty() {
                        section = section.child(caption(
                            if field == "goals" {
                                "Belum ada Goal"
                            } else {
                                "Belum ada Routine"
                            },
                            p,
                        ));
                    }
                    for value in rows(self.value(), field) {
                        let title = value["title"]
                            .as_str()
                            .or_else(|| value["name"].as_str())
                            .or_else(|| value["instruction"].as_str())
                            .unwrap_or("Routine");
                        let description = if field == "goals" {
                            text(value, "progress")
                        } else {
                            text(value, "state")
                        };
                        section = section.child(
                            div()
                                .flex()
                                .items_start()
                                .gap(ui(12.))
                                .child(glyph(
                                    if field == "goals" {
                                        "Target02Icon"
                                    } else {
                                        "Clock01Icon"
                                    },
                                    20.,
                                    p,
                                ))
                                .child(
                                    div()
                                        .flex_1()
                                        .min_w_0()
                                        .child(
                                            div()
                                                .text_size(ui(14.))
                                                .line_height(ui(20.))
                                                .child(title.chars().take(100).collect::<String>()),
                                        )
                                        .child(
                                            div()
                                                .mt(ui(4.))
                                                .text_size(ui(13.))
                                                .line_height(ui(20.))
                                                .text_color(p.color("muted-foreground"))
                                                .child(
                                                    description
                                                        .chars()
                                                        .take(140)
                                                        .collect::<String>(),
                                                ),
                                        ),
                                ),
                        );
                    }
                    content = content.child(section);
                }
            }
            Panel::Library => {
                if rows(self.value(), "artifacts").is_empty() {
                    content = content.child(caption("Belum ada file tersimpan", p));
                }
                for artifact in rows(self.value(), "artifacts") {
                    content = content.child(
                        div()
                            .flex()
                            .items_center()
                            .gap(ui(10.))
                            .child(glyph("File02Icon", 24., p))
                            .child(
                                div()
                                    .flex_1()
                                    .min_w_0()
                                    .child(
                                        div()
                                            .text_size(ui(14.))
                                            .child(text(artifact, "name").to_owned()),
                                    )
                                    .child(caption(text(artifact, "media_type").to_owned(), p)),
                            ),
                    );
                }
            }
            Panel::Computer => {
                content = content.child(
                    div()
                        .flex()
                        .flex_col()
                        .items_center()
                        .gap(ui(16.))
                        .py(ui(32.))
                        .child(glyph("ComputerIcon", 32., p))
                        .child(caption(
                            "Pratinjau Computer belum tersedia di client native ini.",
                            p,
                        )),
                )
            }
            _ => {}
        }
        div()
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
                    .justify_end()
                    .px(ui(12.))
                    .child(
                        action("close-panel", "Tutup detail", "Cancel01Icon", p, cx)
                            .rounded_full()
                            .on_click(cx.listener(|this, _, window, cx| {
                                this.panel = None;
                                this.composer
                                    .read(cx)
                                    .input
                                    .clone()
                                    .update(cx, |input, cx| input.focus(window, cx));
                                cx.notify();
                            })),
                    ),
            )
            .child(
                div()
                    .id("context-panel-scroll")
                    .flex_1()
                    .min_h_0()
                    .overflow_y_scroll()
                    .child(hero)
                    .child(div().px(ui(12.)).mt(ui(16.)).child(tabs))
                    .child(content),
            )
            .into_any_element()
    }
    fn settings_view(&self, cx: &mut Context<Self>) -> AnyElement {
        let p = Palette::new(self.store.dark());
        div()
            .size_full()
            .flex()
            .flex_col()
            .child(
                div()
                    .flex()
                    .items_center()
                    .gap(ui(12.))
                    .p(ui(20.))
                    .child(
                        action(
                            "close-settings",
                            "Kembali ke percakapan",
                            "ArrowLeft01Icon",
                            p,
                            cx,
                        )
                        .rounded_full()
                        .on_click(cx.listener(|this, _, _, cx| {
                            this.panel = None;
                            cx.notify();
                        })),
                    )
                    .child(
                        div()
                            .text_size(ui(18.))
                            .font_weight(FontWeight::MEDIUM)
                            .child("Settings"),
                    ),
            )
            .child(
                div()
                    .max_w(ui(720.))
                    .w_full()
                    .mx_auto()
                    .p(ui(24.))
                    .flex()
                    .flex_col()
                    .gap(ui(24.))
                    .child(
                        div()
                            .text_size(ui(16.))
                            .font_weight(FontWeight::MEDIUM)
                            .child("Appearance"),
                    )
                    .child(
                        button(
                            "appearance",
                            if self.store.dark() {
                                "Use light appearance"
                            } else {
                                "Use dark appearance"
                            },
                            ButtonKind::Default,
                            p,
                            cx,
                        )
                        .on_click(cx.listener(|this, _, _, cx| {
                            let dark = !this.store.dark();
                            if let Err(error) = this.store.theme(dark) {
                                this.error = error.to_string();
                            }
                            crate::ui::theme::apply(dark, None, cx);
                            cx.notify();
                        })),
                    )
                    .child(
                        div()
                            .text_size(ui(16.))
                            .font_weight(FontWeight::MEDIUM)
                            .child("Providers"),
                    )
                    .children(self.connections.iter().map(|connection| {
                        div()
                            .flex()
                            .justify_between()
                            .items_center()
                            .child(if connection["harness"] == "muse" {
                                "Muse Code"
                            } else {
                                "ChatGPT"
                            })
                            .child(caption(
                                format!(
                                    "{} · {}",
                                    text(connection, "login"),
                                    text(&connection["authentication"], "billing_source")
                                ),
                                p,
                            ))
                    })),
            )
            .into_any_element()
    }
}
