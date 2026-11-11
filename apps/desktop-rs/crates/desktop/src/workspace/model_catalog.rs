//! Searchable, retained model presentation inspired by Zed's ModelPickerDelegate.
//! Choosing a row emits intent; the workspace validates the live catalog and receipt.
use super::*;
use crate::ui::{
    controls::{ButtonKind, button},
    theme::{Palette, ui, ui_px},
};
use gpui_kit::base::TestSupportExt;
use gpui_kit::component::{
    ActiveTheme, Disableable, Icon, IndexPath, Side,
    command::{Command, CommandGroup, CommandItem, CommandState},
    menu::{DropdownMenu, PopupMenuItem},
};
use gpui_kit::prelude::FluentBuilder as _;
use ngertiin_client::{rows, text};
use std::collections::BTreeSet;

#[derive(Clone)]
pub(super) enum Choice {
    Model {
        agent: Value,
        connection: Value,
        model: Value,
    },
    Effort {
        agent: Value,
        effort: Value,
    },
    Settings,
}
impl Choice {
    fn key(&self) -> Option<String> {
        match self {
            Self::Model {
                connection, model, ..
            } => Some(format!("{}:{}", text(connection, "id"), text(model, "id"))),
            _ => None,
        }
    }
    fn label(&self) -> String {
        match self {
            Self::Model { model, .. } => model["display_name"]
                .as_str()
                .unwrap_or(text(model, "id"))
                .to_owned(),
            Self::Effort { effort, .. } => super::model_picker::effort_label(effort).into(),
            Self::Settings => "Add or adjust models…".into(),
        }
    }
    fn detail(&self) -> String {
        match self {
            Self::Model {
                connection, model, ..
            } => {
                if connection["state"] != "active" || connection["login"] != "authenticated" {
                    return "Connect this account in Settings".into();
                }
                let provider = if connection["harness"] == "muse" {
                    "Muse Code"
                } else {
                    "Codex"
                };
                let billing = billing_label(&connection["authentication"]["billing_source"]);
                let effective = billing_label(&connection["effective_billing_source"]);
                let modalities = rows(model, "input_modalities")
                    .iter()
                    .filter_map(Value::as_str)
                    .collect::<Vec<_>>()
                    .join(", ");
                format!(
                    "{provider} · {billing} · Effective: {effective}{}",
                    if modalities.is_empty() {
                        String::new()
                    } else {
                        format!(" · {modalities}")
                    }
                )
            }
            Self::Effort { .. } => "Reasoning effort".into(),
            Self::Settings => "Accounts, available models and explicit billing".into(),
        }
    }
    fn enabled(&self) -> bool {
        match self {
            Self::Model { connection, .. } => {
                connection["state"] == "active" && connection["login"] == "authenticated"
            }
            _ => true,
        }
    }
    fn checked(&self) -> bool {
        match self {
            Self::Model {
                agent,
                connection,
                model,
            } => agent["connection_id"] == connection["id"] && agent["model_id"] == model["id"],
            Self::Effort { agent, effort } => agent["reasoning"] == *effort,
            _ => false,
        }
    }
}
fn billing_label(value: &Value) -> &'static str {
    match value.as_str() {
        Some("api_key") => "API key",
        Some("subscription") => "Subscription",
        _ => "Unknown",
    }
}
pub(super) enum CatalogEvent {
    Choose(Choice),
    Favorite(String),
}
pub(super) struct ModelCatalog {
    pub state: Entity<CommandState>,
    pub open: bool,
    pub agent_id: String,
    pub surface: String,
    pub thread_id: Option<Uuid>,
    groups: Vec<(String, Vec<Choice>)>,
    favorites: BTreeSet<String>,
    query: String,
    _observer: Subscription,
}
impl EventEmitter<CatalogEvent> for ModelCatalog {}
impl ModelCatalog {
    pub fn new(window: &mut Window, cx: &mut Context<Self>) -> Self {
        let state = cx.new(|cx| CommandState::new(window, cx));
        let observer = cx.observe(&state, |_, _, cx| cx.notify());
        Self {
            state,
            open: false,
            agent_id: String::new(),
            surface: String::new(),
            thread_id: None,
            groups: vec![],
            favorites: BTreeSet::new(),
            query: String::new(),
            _observer: observer,
        }
    }
    pub fn configure(
        &mut self,
        agent: &Value,
        connections: &[Value],
        favorites: BTreeSet<String>,
        window: &mut Window,
        cx: &mut Context<Self>,
    ) {
        self.agent_id = text(agent, "id").into();
        self.favorites = favorites;
        self.groups = groups(agent, connections, &self.favorites);
        self.query.clear();
        self.state
            .update(cx, |state, cx| state.set_query("", window, cx));
        self.open = true;
        cx.notify();
    }
    fn filtered(&self) -> Vec<(String, Vec<Choice>)> {
        self.groups
            .iter()
            .filter(|(label, _)| label != "Reasoning effort" || !self.query.is_empty())
            .filter_map(|(label, choices)| {
                let mut choices = choices
                    .iter()
                    .filter_map(|choice| {
                        let terms = format!("{} {} {label}", choice.label(), choice.detail());
                        crate::models::matching::score(&self.query, &terms)
                            .map(|score| (score, choice.clone()))
                    })
                    .collect::<Vec<_>>();
                choices.sort_by_key(|(score, _)| *score);
                (!choices.is_empty()).then(|| {
                    (
                        label.clone(),
                        choices.into_iter().map(|(_, choice)| choice).collect(),
                    )
                })
            })
            .collect()
    }
}
fn groups(
    agent: &Value,
    connections: &[Value],
    favorites: &BTreeSet<String>,
) -> Vec<(String, Vec<Choice>)> {
    let mut groups = vec![];
    let mut favorite_choices = vec![];
    let mut connections: Vec<_> = connections
        .iter()
        .filter(|c| c["state"] == "active" || c["id"] == agent["connection_id"])
        .collect();
    connections.sort_by_key(|c| c["id"] != agent["connection_id"]);
    for connection in connections {
        let provider = if connection["harness"] == "muse" {
            "Muse Code"
        } else {
            "Codex"
        };
        let billing = match text(&connection["authentication"], "billing_source") {
            "api_key" => "API key",
            "subscription" => "Subscription",
            _ => "Billing unavailable",
        };
        let choices: Vec<_> = rows(connection, "models")
            .iter()
            .map(|model| Choice::Model {
                agent: agent.clone(),
                connection: connection.clone(),
                model: model.clone(),
            })
            .collect();
        favorite_choices.extend(
            choices
                .iter()
                .filter(|choice| choice.key().is_some_and(|key| favorites.contains(&key)))
                .cloned(),
        );
        if !choices.is_empty() {
            let mut label = format!("{provider} · {billing}");
            if connection["effective_billing_source"]
                != connection["authentication"]["billing_source"]
            {
                label.push_str(&format!(
                    " · Effective: {}",
                    billing_label(&connection["effective_billing_source"])
                ));
            }
            groups.push((label, choices));
        }
        if connection["state"] == "active"
            && connection["login"] == "authenticated"
            && let Some(model) = rows(connection, "models").iter().find(|m| {
                connection["id"] == agent["connection_id"] && m["id"] == agent["model_id"]
            })
        {
            let efforts: Vec<_> = rows(model, "reasoning")
                .iter()
                .map(|effort| Choice::Effort {
                    agent: agent.clone(),
                    effort: effort.clone(),
                })
                .collect();
            if !efforts.is_empty() {
                groups.push(("Reasoning effort".into(), efforts));
            }
        }
    }
    if !favorite_choices.is_empty() {
        groups.insert(0, ("Favorites".into(), favorite_choices));
    }
    groups.push(("Connections".into(), vec![Choice::Settings]));
    groups
}
impl Render for ModelCatalog {
    fn render(&mut self, window: &mut Window, cx: &mut Context<Self>) -> impl IntoElement {
        let p = Palette::new(cx.theme().mode.is_dark());
        let filtered = self.filtered();
        let mut command = Command::new(&self.state)
            .bordered(false)
            .filterable(false)
            .placeholder("Search models…")
            .max_h(
                (window.viewport_size().height - window.rem_size() * 8.)
                    .min(window.rem_size() * 22.5)
                    .max(window.rem_size() * 6.),
            );
        for (index, (label, choices)) in filtered.iter().enumerate() {
            if index > 0 {
                command = command.separator();
            }
            let mut group = CommandGroup::new().label(label.clone());
            for choice in choices {
                let mut label = choice.label();
                if !choice.enabled() {
                    label.push_str(" · Connect in Settings");
                }
                let detail = choice.detail();
                let favorite = choice
                    .key()
                    .is_some_and(|key| self.favorites.contains(&key));
                let keywords = match choice {
                    Choice::Model {
                        connection, model, ..
                    } => format!(
                        "{} {} {}",
                        text(connection, "harness"),
                        text(model, "id"),
                        text(&connection["authentication"], "billing_source")
                    ),
                    _ => String::new(),
                };
                let mut item = CommandItem::new()
                    .label(if favorite {
                        format!("{label} ★")
                    } else {
                        label
                    })
                    .keywords([keywords, detail.clone()])
                    .checked(choice.checked())
                    .disabled(!choice.enabled());
                if let Choice::Model { connection, .. } = choice {
                    let muse = connection["harness"] == "muse";
                    item = item.icon(
                        Icon::default()
                            .path(if muse {
                                "icons/MuseProvider.svg"
                            } else {
                                "icons/CodexProvider.svg"
                            })
                            .text_color(p.color(if muse {
                                "identity-orange"
                            } else {
                                "identity-purple"
                            })),
                    );
                }
                group = group.item(item);
            }
            command = command.group(group);
        }
        let selected = self
            .state
            .read(cx)
            .selected_index()
            .and_then(|path| filtered.get(path.section)?.1.get(path.row))
            .and_then(Choice::key);
        let selected_label = self
            .state
            .read(cx)
            .selected_index()
            .and_then(|path| filtered.get(path.section)?.1.get(path.row))
            .map(Choice::label)
            .unwrap_or_else(|| "model".into());
        let favorite = selected
            .as_ref()
            .is_some_and(|key| self.favorites.contains(key));
        let cancel = cx.entity().downgrade();
        let confirm = cancel.clone();
        let query_owner = cancel.clone();
        let efforts = self
            .groups
            .iter()
            .find(|(label, _)| label == "Reasoning effort")
            .map(|(_, choices)| choices.clone())
            .unwrap_or_default();
        let effort_label = efforts
            .iter()
            .find(|choice| choice.checked())
            .map(Choice::label)
            .unwrap_or_else(|| "Default".into());
        let effort_owner = cancel.clone();
        div()
            .id("native-model-catalog")
            .test_support()
            .w(ui(280.))
            .max_w_full()
            .flex()
            .flex_col()
            .child(
                command
                    .on_query(move |query, _, cx| {
                        let _ = query_owner.update(cx, |this, cx| {
                            this.query = query.to_owned();
                            cx.notify();
                        });
                    })
                    .on_confirm(move |path: IndexPath, _, cx| {
                        if let Some(choice) = filtered
                            .get(path.section)
                            .and_then(|(_, choices)| choices.get(path.row))
                            .cloned()
                        {
                            let _ = confirm.update(cx, |this, cx| {
                                this.open = false;
                                cx.emit(CatalogEvent::Choose(choice));
                                cx.notify();
                            });
                        }
                    })
                    .on_cancel(move |_, cx| {
                        let _ = cancel.update(cx, |this, cx| {
                            this.open = false;
                            cx.notify();
                        });
                    }),
            )
            .when(!efforts.is_empty(), |view| {
                view.child(
                    button(
                        "model-effort",
                        format!("Effort · {effort_label}"),
                        ButtonKind::Ghost,
                        p,
                        cx,
                    )
                    .w_full()
                    .dropdown_menu(move |mut menu, _, cx| {
                        menu = menu.min_w(ui_px(180., cx)).check_side(Side::Right);
                        for choice in &efforts {
                            let choice = choice.clone();
                            let owner = effort_owner.clone();
                            menu = menu.item(
                                PopupMenuItem::new(choice.label())
                                    .checked(choice.checked())
                                    .on_click(move |_, _, cx| {
                                        let _ = owner.update(cx, |this, cx| {
                                            this.open = false;
                                            cx.emit(CatalogEvent::Choose(choice.clone()));
                                            cx.notify();
                                        });
                                    }),
                            );
                        }
                        menu
                    }),
                )
            })
            .child(
                div()
                    .border_t_1()
                    .border_color(p.color("border"))
                    .pt_2()
                    .child(
                        button(
                            "favorite-model",
                            if favorite {
                                format!("Unfavorite {selected_label}")
                            } else {
                                format!("Favorite {selected_label}")
                            },
                            ButtonKind::Ghost,
                            p,
                            cx,
                        )
                        .disabled(selected.is_none())
                        .on_click(cx.listener(move |this, _, _, cx| {
                            if let Some(key) = &selected {
                                if !this.favorites.remove(key) {
                                    this.favorites.insert(key.clone());
                                }
                                cx.emit(CatalogEvent::Favorite(key.clone()));
                                cx.notify();
                            }
                        })),
                    ),
            )
    }
}
