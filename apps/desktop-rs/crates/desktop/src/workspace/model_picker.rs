//! Model intent is validated against the live catalog before a durable configuration command.
use super::*;
use crate::{
    storage::Operation,
    ui::{
        controls::{ButtonKind, button},
        theme::{Palette, ui, ui_px},
        workspace::glyph,
    },
};
use gpui_kit::component::{button::Button, popover::Popover};
use ngertiin_client::{rows, text};
use serde_json::json;

pub(super) fn effort_label(value: &Value) -> &str {
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
        surface: &'static str,
        cx: &Context<Self>,
    ) -> AnyElement {
        let id = text(agent, "id").to_owned();
        let owner = cx.entity().downgrade();
        let catalog = self.model_catalog.clone();
        let state = catalog.read(cx);
        let focus = state.state.read(cx).focus_handle(cx);
        let open = state.open && state.agent_id == id && state.surface == surface;
        Popover::new(SharedString::from(format!("model-selector:{surface}:{id}")))
            .trigger(trigger)
            .open(open)
            .track_focus(&focus)
            .on_open_change(move |open, window, cx| {
                let _ = owner.update(cx, |this, cx| {
                    if !*open {
                        if catalog.read(cx).surface == surface {
                            catalog.update(cx, |catalog, cx| {
                                catalog.open = false;
                                cx.notify();
                            });
                        }
                    } else if !this.busy
                        && this.checked
                        && !this.conversation.reconciling
                        && let Some(agent) =
                            this.agents.iter().find(|agent| agent["id"] == id).cloned()
                    {
                        let favorites = this.store.favorite_models();
                        catalog.update(cx, |catalog, cx| {
                            catalog.surface = surface.into();
                            catalog.thread_id = this.selected;
                            catalog.configure(&agent, &this.connections, favorites, window, cx)
                        });
                    }
                });
            })
            .child(self.model_catalog.clone())
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
        self.model_picker_trigger(trigger, agent, "context", cx)
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

impl Workspace {
    pub(super) fn choose_catalog_model(
        &mut self,
        choice: super::model_catalog::Choice,
        window: &mut Window,
        cx: &mut Context<Self>,
    ) {
        use super::model_catalog::Choice;
        if self.busy || !self.checked || self.conversation.reconciling {
            return;
        }
        let (snapshot, changes) = match choice {
            Choice::Settings => {
                self.open_settings(window, cx);
                return;
            }
            Choice::Model {
                agent,
                connection,
                model,
            } => {
                let valid = self
                    .connections
                    .iter()
                    .find(|current| {
                        current["id"] == connection["id"]
                            && current["harness"] == connection["harness"]
                            && current["authentication"]["billing_source"]
                                == connection["authentication"]["billing_source"]
                            && current["state"] == "active"
                            && current["login"] == "authenticated"
                    })
                    .and_then(|current| {
                        rows(current, "models")
                            .iter()
                            .find(|current| current["id"] == model["id"])
                    });
                let Some(model) = valid else {
                    self.error =
                        "The model catalog changed. Open the selector and choose again.".into();
                    cx.notify();
                    return;
                };
                let reasoning = if rows(model, "reasoning").contains(&agent["reasoning"]) {
                    agent["reasoning"].clone()
                } else {
                    Value::Null
                };
                let changes = json!({"connection_id":connection["id"],"harness":connection["harness"],"billing_source":connection["authentication"]["billing_source"],"model_id":model["id"],"reasoning":reasoning});
                (agent, changes)
            }
            Choice::Effort { agent, effort } => {
                let valid = self
                    .connections
                    .iter()
                    .find(|c| c["id"] == agent["connection_id"])
                    .and_then(|c| {
                        rows(c, "models")
                            .iter()
                            .find(|m| m["id"] == agent["model_id"])
                    })
                    .is_some_and(|m| rows(m, "reasoning").contains(&effort));
                if !valid {
                    self.error = "This reasoning effort is no longer available.".into();
                    cx.notify();
                    return;
                }
                (agent, json!({"reasoning":effort}))
            }
        };
        if !self
            .agents
            .iter()
            .any(|agent| agent["id"] == snapshot["id"] && agent["revision"] == snapshot["revision"])
        {
            self.error =
                "The agent configuration changed. Open the selector and choose again.".into();
            cx.notify();
            return;
        }
        let id = text(&snapshot, "id");
        self.dispatch(
            format!("model:{id}"),
            Operation::command(
                format!("/v1/agents/{id}/configuration"),
                json!({"expected_revision":snapshot["revision"],"changes":changes}),
                self.selected,
            ),
            window,
            cx,
        );
    }
}
