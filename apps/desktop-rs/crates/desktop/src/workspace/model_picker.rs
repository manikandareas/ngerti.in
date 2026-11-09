//! Native menu behavior owns keyboard navigation, submenus and focus restoration.
use super::*;
use crate::{
    storage::Operation,
    ui::{
        controls::{ButtonKind, button},
        theme::{Palette, ui, ui_px},
        workspace::glyph,
    },
};
use gpui_kit::component::{
    ActiveTheme, Icon, Side,
    button::Button,
    menu::{DropdownMenu, PopupMenu, PopupMenuItem},
};
use ngertiin_client::{rows, text};
use serde_json::json;

fn effort_label(value: &Value) -> &str {
    match value.as_str() {
        Some("minimal") => "Minimal",
        Some("low") => "Low",
        Some("medium") => "Medium",
        Some("high") => "High",
        Some("xhigh") => "Extra high",
        Some("max") => "Maximum",
        _ => "Default",
    }
}

impl Workspace {
    pub(super) fn model_picker_trigger(
        &self,
        trigger: Button,
        agent: &Value,
        cx: &Context<Self>,
    ) -> AnyElement {
        let agent = agent.clone();
        let connections = self.connections.clone();
        let owner = cx.entity().downgrade();
        let busy = self.busy || !self.checked;
        trigger
            .dropdown_menu(move |menu, window, cx| {
                model_menu(menu, &agent, &connections, owner.clone(), busy, window, cx)
            })
            .into_any_element()
    }

    pub(super) fn contained_model_picker(
        &self,
        agent: &Value,
        cx: &mut Context<Self>,
    ) -> AnyElement {
        let p = Palette::new(self.store.dark());
        let trigger = button("context-model-trigger", "", ButtonKind::Outline, p, cx)
            .accessibility_label("Choose model")
            .w_full()
            .h(ui(36.))
            .rounded(ui_px(8., cx))
            .child(
                div()
                    .w_full()
                    .min_w_0()
                    .flex()
                    .items_center()
                    .gap(ui(8.))
                    .child(provider_mark(agent["harness"] == "muse", p))
                    .child(
                        div()
                            .min_w_0()
                            .flex_1()
                            .truncate()
                            .text_size(ui(13.))
                            .child(text(agent, "model_id").to_owned()),
                    )
                    .child(glyph("ArrowDown01Icon", 14., p)),
            );
        self.model_picker_trigger(trigger, agent, cx)
    }
}

pub(super) fn provider_mark(muse: bool, p: Palette) -> AnyElement {
    if muse {
        glyph("MuseProvider", 18., p).into_any_element()
    } else {
        img(crate::platform::assets::root().join("providers/chatgpt.png"))
            .size(ui(18.))
            .rounded(ui(4.))
            .into_any_element()
    }
}

fn model_menu(
    mut menu: PopupMenu,
    agent: &Value,
    connections: &[Value],
    owner: WeakEntity<Workspace>,
    busy: bool,
    window: &mut Window,
    cx: &mut Context<PopupMenu>,
) -> PopupMenu {
    let p = Palette::new(cx.theme().mode.is_dark());
    menu = menu
        .min_w(ui_px(260., cx))
        .max_w(ui_px(340., cx))
        .max_h(ui_px(560., cx))
        .scrollable(true)
        .check_side(Side::Right);
    let mut groups: Vec<_> = connections
        .iter()
        .filter(|connection| {
            connection["state"] == "active" || connection["id"] == agent["connection_id"]
        })
        .collect();
    groups.sort_by_key(|connection| connection["id"] != agent["connection_id"]);
    for (index, connection) in groups.iter().enumerate() {
        if index > 0 {
            menu = menu.separator();
        }
        let muse = connection["harness"] == "muse";
        let provider = if muse { "Muse Code" } else { "Codex" };
        let billing = match text(&connection["authentication"], "billing_source") {
            "api_key" => "API key",
            "subscription" => "Subscription",
            _ => "Check billing",
        };
        menu = menu.label(format!("{provider} · {billing}"));
        let ready = connection["state"] == "active" && connection["login"] == "authenticated";
        for model in rows(connection, "models") {
            let current =
                agent["connection_id"] == connection["id"] && agent["model_id"] == model["id"];
            let label = model["display_name"]
                .as_str()
                .unwrap_or(text(model, "id"))
                .to_owned();
            let agent = agent.clone();
            let connection = (*connection).clone();
            let model = model.clone();
            let owner = owner.clone();
            let icon = Icon::default()
                .path(if muse {
                    "icons/MuseProvider.svg"
                } else {
                    "icons/CodexProvider.svg"
                })
                .text_color(p.color(if muse {
                    "identity-orange"
                } else {
                    "identity-purple"
                }));
            menu = menu.item(
                PopupMenuItem::new(label)
                    .icon(icon)
                    .checked(current)
                    .disabled(busy || !ready)
                    .on_click(move |_, window, cx| {
                        let _ = owner.update(cx, |this, cx| {
                            let id = text(&agent, "id");
                            let reasoning = if rows(&model, "reasoning").contains(&agent["reasoning"]) {
                                agent["reasoning"].clone()
                            } else {
                                Value::Null
                            };
                            this.dispatch(
                                format!("model:{id}"),
                                Operation::command(
                                    format!("/v1/agents/{id}/configuration"),
                                    json!({
                                        "expected_revision": agent["revision"],
                                        "changes": {
                                            "connection_id": connection["id"],
                                            "harness": connection["harness"],
                                            "billing_source": connection["authentication"]["billing_source"],
                                            "model_id": model["id"],
                                            "reasoning": reasoning
                                        }
                                    }),
                                    this.selected,
                                ),
                                window,
                                cx,
                            );
                        });
                    }),
            );
        }
        if !ready || rows(connection, "models").is_empty() {
            menu = menu.item(
                PopupMenuItem::new(if !ready {
                    "Connect account…"
                } else {
                    "Refresh models…"
                })
                .on_click({
                    let owner = owner.clone();
                    move |_, window, cx| {
                        let _ = owner.update(cx, |this, cx| this.open_settings(window, cx));
                    }
                }),
            );
        }
    }
    if let Some(model) = connections
        .iter()
        .find(|c| c["id"] == agent["connection_id"])
        .and_then(|c| {
            rows(c, "models")
                .iter()
                .find(|m| m["id"] == agent["model_id"])
        })
    {
        let efforts = rows(model, "reasoning").to_vec();
        if !efforts.is_empty() {
            let agent = agent.clone();
            let owner = owner.clone();
            menu = menu.separator().submenu(
                format!("Effort · {}", effort_label(&agent["reasoning"])),
                window,
                cx,
                move |mut submenu, _, _| {
                    submenu = submenu.check_side(Side::Right);
                    for effort in &efforts {
                        let owner = owner.clone();
                        let agent = agent.clone();
                        let effort = effort.clone();
                        submenu = submenu.item(
                            PopupMenuItem::new(effort_label(&effort))
                                .checked(agent["reasoning"] == effort)
                                .disabled(busy)
                                .on_click(move |_, window, cx| {
                                    let _ = owner.update(cx, |this, cx| {
                                        let id = text(&agent, "id");
                                        this.dispatch(
                                            format!("reasoning:{id}"),
                                            Operation::command(
                                                format!("/v1/agents/{id}/configuration"),
                                                json!({
                                                    "expected_revision": agent["revision"],
                                                    "changes": { "reasoning": effort }
                                                }),
                                                this.selected,
                                            ),
                                            window,
                                            cx,
                                        );
                                    });
                                }),
                        );
                    }
                    submenu
                },
            );
        }
    }
    menu.separator()
        .item(
            PopupMenuItem::new("Add or adjust models…").on_click(move |_, window, cx| {
                let _ = owner.update(cx, |this, cx| this.open_settings(window, cx));
            }),
        )
}
