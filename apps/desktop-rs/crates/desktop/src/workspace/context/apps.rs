use super::*;
use crate::storage::Operation;
use gpui_kit::component::{
    checkbox::Checkbox,
    input::{Input, InputEvent},
};
impl Workspace {
    pub(in crate::workspace) fn open_apps(&mut self, window: &mut Window, cx: &mut Context<Self>) {
        if self.panel.is_none() {
            self.context_work.return_focus = window.focused(cx);
        }
        self.computer
            .update(cx, |computer, cx| computer.present(false, cx));
        self.panel = Some(Panel::Detail);
        self.context_work.form = None;
        self.context_read("apps", "/v1/apps/connections".into(), cx);
        self.context_read("app-effects", "/v1/entities/app_effect".into(), cx);
        self.context_read("app-catalog", "/v1/apps/catalog".into(), cx);
        self.set_context_field("app-search", "", window, cx);
        let input = self.context_work.fields["app-search"].clone();
        let subscription = cx.subscribe(&input, |this, input, event, cx| {
            if !matches!(event, InputEvent::Change) {
                return;
            }
            let query = input.read(cx).value().trim().to_owned();
            this.context_work.app_search_task = Some(cx.spawn(async move |view, cx| {
                cx.background_executor()
                    .timer(std::time::Duration::from_millis(180))
                    .await;
                let _ = view.update(cx, |this, cx| {
                    this.context_work.tasks.remove("app-catalog");
                    this.context_read(
                        "app-catalog",
                        format!("/v1/apps/catalog?search={}", super::files::encode(&query)),
                        cx,
                    );
                    cx.notify();
                });
            }));
            cx.notify();
        });
        self.context_work
            .field_observers
            .insert("app-search".into(), subscription);
        self.locate_context(Location::Apps, window, cx);
    }
    pub(in crate::workspace) fn apps_view(&self, cx: &mut Context<Self>) -> AnyElement {
        let p = Palette::new(self.store.dark());
        let query = self
            .context_field_value("app-search", cx)
            .trim()
            .to_lowercase();
        let matches = |name: &str| name.to_lowercase().contains(&query);
        let inventory: Vec<_> = self
            .context_work
            .resources
            .get("apps")
            .and_then(Value::as_array)
            .into_iter()
            .flatten()
            .filter(|connection| connection["state"] != "revoked")
            .collect();
        let connected = inventory
            .iter()
            .filter(|connection| connection["state"] == "active")
            .count();
        let mut search = div().flex().items_center().gap(ui(8.));
        if let Some(input) = self.context_work.fields.get("app-search") {
            search = search.child(
                div()
                    .flex_1()
                    .min_w_0()
                    .rounded_full()
                    .bg(p.color("secondary"))
                    .px(ui(12.))
                    .child(
                        Input::new(input)
                            .aria_label("Search apps")
                            .appearance(false)
                            .bordered(false)
                            .h(ui(36.))
                            .text_size(ui(14.))
                            .prefix(glyph("Search01Icon", 15., p)),
                    ),
            );
        }
        search = search
            .child(
                button(
                    "connected-apps",
                    if connected > 0 {
                        format!("Connected {connected}")
                    } else {
                        "Connected".into()
                    },
                    if self.context_work.app_connected_only {
                        ButtonKind::Secondary
                    } else {
                        ButtonKind::Ghost
                    },
                    p,
                    cx,
                )
                .h(ui(28.))
                .rounded_full()
                .on_click(cx.listener(|this, _, _, cx| {
                    this.context_work.app_connected_only = !this.context_work.app_connected_only;
                    cx.notify();
                })),
            )
            .child(
                action("refresh-apps", "Refresh apps", "RefreshIcon", p, cx)
                    .size(ui(28.))
                    .on_click(cx.listener(|this, _, _, cx| {
                        this.context_read("apps", "/v1/apps/connections".into(), cx);
                        this.context_read("app-effects", "/v1/entities/app_effect".into(), cx);
                        let query = this.context_field_value("app-search", cx);
                        this.context_read(
                            "app-catalog",
                            format!(
                                "/v1/apps/catalog?search={}",
                                super::files::encode(query.trim())
                            ),
                            cx,
                        );
                    })),
            );
        let mut view = div()
            .flex()
            .flex_col()
            .gap(ui(16.))
            .child(caption(
                "Connect apps through Composio, then choose access for this conversation.",
                p,
            ))
            .child(search);
        if let Some(status) = self.resource_status("apps", cx) {
            view = view.child(status);
        }
        if !self.context_work.app_connected_only
            && let Some(status) = self.resource_status("app-catalog", cx)
        {
            view = view.child(status);
        }
        let editing = self
            .context_work
            .form
            .as_ref()
            .filter(|(kind, _)| kind == "app");
        if let Some((_, connection)) = editing {
            view = view.child(self.app_grants(connection, cx));
        } else {
            let mut list = div().flex().flex_col().gap(ui(4.));
            let mut represented = std::collections::BTreeSet::new();
            let mut count = 0;
            if !self.context_work.app_connected_only
                && let Some(catalog) = self.context_work.resources.get("app-catalog")
            {
                for item in rows(catalog, "items").iter().filter(|item| {
                    matches(&format!("{} {}", text(item, "name"), text(item, "slug")))
                }) {
                    count += 1;
                    let name = text(item, "name");
                    if let Some(connection) = inventory
                        .iter()
                        .rev()
                        .find(|connection| connection["toolkit"] == item["slug"])
                    {
                        represented.insert(text(connection, "id").to_owned());
                        list = list.child(self.app_connection_row(connection, name, cx));
                    } else {
                        let slug = text(item, "slug").to_owned();
                        let connect = button(
                            SharedString::from(format!("connect-app:{slug}")),
                            "Connect",
                            ButtonKind::Secondary,
                            p,
                            cx,
                        )
                        .accessibility_label(format!("Connect {name}"))
                        .h(ui(28.))
                        .rounded_full()
                        .disabled_state(
                            self.busy || !self.context_work.resources.contains_key("apps"),
                            p,
                        )
                        .on_click(cx.listener(
                            move |this, _, window, cx| {
                                this.provider_operation(
                                    "/v1/apps/connect".into(),
                                    json!({"toolkit":slug}),
                                    None,
                                    window,
                                    cx,
                                )
                            },
                        ));
                        list = list.child(app_row(
                            name,
                            if item["connected"] == true {
                                "Account connected in Composio"
                            } else {
                                "Connect through Composio"
                            },
                            connect.into_any_element(),
                            p,
                        ));
                    }
                }
                if let Some(cursor) = catalog["cursor"].as_str() {
                    let cursor = cursor.to_owned();
                    list = list.child(
                        button("more-apps", "More apps", ButtonKind::Secondary, p, cx)
                            .h(ui(28.))
                            .rounded_full()
                            .on_click(cx.listener(move |this, _, _, cx| {
                                let query = this.context_field_value("app-search", cx);
                                this.context_read(
                                    "app-catalog",
                                    format!(
                                        "/v1/apps/catalog?search={}&cursor={}",
                                        super::files::encode(query.trim()),
                                        super::files::encode(&cursor)
                                    ),
                                    cx,
                                );
                            })),
                    );
                }
            }
            for connection in inventory.iter().filter(|connection| {
                !represented.contains(text(connection, "id"))
                    && matches(text(connection, "toolkit"))
            }) {
                count += 1;
                list = list.child(self.app_connection_row(
                    connection,
                    text(connection, "toolkit"),
                    cx,
                ));
            }
            if count == 0
                && self.context_work.resources.contains_key(
                    if self.context_work.app_connected_only {
                        "apps"
                    } else {
                        "app-catalog"
                    },
                )
            {
                list = list.child(caption("No matching apps.", p));
            }
            view = view.child(list);
        }
        let effects = self
            .context_work
            .resources
            .get("app-effects")
            .and_then(Value::as_array)
            .into_iter()
            .flatten()
            .filter(|effect| {
                effect["thread_id"] == self.value()["thread"]["id"]
                    && rows(&self.value()["thread"], "member_agent_ids")
                        .contains(&effect["agent_id"])
            });
        for effect in effects {
            let id = text(effect, "id").to_owned();
            let expanded = self.context_work.app_effect_expanded.contains(&id);
            let status = match text(effect, "state") {
                "succeeded" => "Succeeded",
                "unknown" => "Result not confirmed",
                "failed" => "Failed",
                _ => "Processing",
            };
            let mut result = div()
                .flex()
                .flex_col()
                .gap(ui(8.))
                .p(ui(12.))
                .rounded(ui(12.))
                .bg(p.color("card"));
            result = result.child(
                button(
                    SharedString::from(format!("app-effect:{id}")),
                    format!(
                        "{} · {status}",
                        text(effect, "tool").to_lowercase().replace('_', " ")
                    ),
                    ButtonKind::Ghost,
                    p,
                    cx,
                )
                .h_auto()
                .max_w_full()
                .on_click(cx.listener(move |this, _, _, cx| {
                    if !this.context_work.app_effect_expanded.remove(&id) {
                        this.context_work.app_effect_expanded.insert(id.clone());
                    }
                    cx.notify();
                })),
            );
            if expanded {
                let detail = if effect["result"].is_null() {
                    "No verified result yet.".into()
                } else {
                    serde_json::to_string_pretty(&effect["result"])
                        .unwrap_or_default()
                        .chars()
                        .take(6000)
                        .collect::<String>()
                };
                result = result.child(caption(
                    if effect["state"] == "unknown" {
                        "Check the result in the app before requesting the same action again."
                    } else {
                        "Backend receipt"
                    },
                    p,
                ));
                if let Some(log) = effect["log_id"].as_str() {
                    result = result.child(caption(format!("Receipt: {log}"), p));
                }
                result = result.child(
                    div()
                        .id("app-result-body")
                        .max_h(ui(256.))
                        .overflow_y_scroll()
                        .text_size(ui(13.))
                        .child(detail),
                );
            }
            view = view.child(result);
        }
        if self.context_work.errors.contains_key("app-effects")
            && let Some(status) = self.resource_status("app-effects", cx)
        {
            view = view.child(status);
        }
        view.into_any_element()
    }
    fn app_connection_row(
        &self,
        connection: &Value,
        name: &str,
        cx: &mut Context<Self>,
    ) -> AnyElement {
        let p = Palette::new(self.store.dark());
        let id = text(connection, "id").to_owned();
        let granted = rows(connection, "grants").iter().any(|grant| {
            grant["thread_id"] == self.value()["thread"]["id"]
                && rows(&self.value()["thread"], "member_agent_ids").contains(&grant["agent_id"])
        });
        let subtitle = match text(connection, "state") {
            "active" if granted => "Conversation access granted",
            "active" => "Connected · choose conversation access",
            "auth_required" => "Login required",
            _ => "Waiting for connection",
        };
        let check = id.clone();
        let mut actions = div().flex().items_center().gap(ui(6.)).child(
            action(
                SharedString::from(format!("app:{id}:refresh")),
                "Check connection",
                "RefreshIcon",
                p,
                cx,
            )
            .size(ui(28.))
            .disabled_state(self.busy, p)
            .on_click(cx.listener(move |this, _, window, cx| {
                this.provider_operation(
                    format!("/v1/apps/connections/{check}/refresh"),
                    json!({}),
                    None,
                    window,
                    cx,
                )
            })),
        );
        if connection["state"] == "active" {
            let selected = connection.clone();
            actions = actions.child(
                button(
                    SharedString::from(format!("manage-grants:{id}")),
                    "Manage access",
                    ButtonKind::Secondary,
                    p,
                    cx,
                )
                .h(ui(28.))
                .rounded_full()
                .disabled_state(self.busy, p)
                .on_click(cx.listener(move |this, _, window, cx| {
                    this.context_work.form = Some(("app".into(), selected.clone()));
                    this.context_work.grant_agent =
                        rows(&this.value()["thread"], "member_agent_ids")
                            .first()
                            .and_then(Value::as_str)
                            .unwrap_or("")
                            .into();
                    this.restore_grant_tools(&selected);
                    this.set_context_field("app-tool-search", "", window, cx);
                    this.context_work.resources.remove("app-tools");
                    cx.notify();
                })),
            );
        } else if connection["state"] == "auth_required" {
            actions = actions.child(
                button(
                    SharedString::from(format!("app:{id}:reconnect")),
                    "Reconnect",
                    ButtonKind::Secondary,
                    p,
                    cx,
                )
                .h(ui(28.))
                .rounded_full()
                .disabled_state(self.busy, p)
                .on_click(cx.listener(move |this, _, window, cx| {
                    this.provider_operation(
                        format!("/v1/apps/connections/{id}/reconnect"),
                        json!({}),
                        None,
                        window,
                        cx,
                    )
                })),
            );
        }
        app_row(name, subtitle, actions.into_any_element(), p)
    }
    fn restore_grant_tools(&mut self, connection: &Value) {
        self.context_work.grant_tools = rows(connection, "grants")
            .iter()
            .find(|g| {
                g["thread_id"] == self.value()["thread"]["id"]
                    && g["agent_id"] == self.context_work.grant_agent
            })
            .map(|g| {
                rows(g, "tools")
                    .iter()
                    .filter_map(Value::as_str)
                    .map(str::to_owned)
                    .collect()
            })
            .unwrap_or_default();
    }
    fn app_grants(&self, connection: &Value, cx: &mut Context<Self>) -> AnyElement {
        let p = Palette::new(self.store.dark());
        let mut editor = div()
            .flex()
            .flex_col()
            .gap(ui(12.))
            .p(ui(12.))
            .bg(p.color("card"))
            .rounded(ui(12.))
            .child(
                div()
                    .flex()
                    .items_center()
                    .justify_between()
                    .child(
                        div()
                            .font_weight(FontWeight::SEMIBOLD)
                            .child(format!("Access {}", text(connection, "toolkit"))),
                    )
                    .child(
                        button("done-app-grants", "Done", ButtonKind::Ghost, p, cx).on_click(
                            cx.listener(|this, _, _, cx| {
                                this.context_work.form = None;
                                cx.notify();
                            }),
                        ),
                    ),
            );
        for agent in self
            .agents
            .iter()
            .filter(|a| rows(&self.value()["thread"], "member_agent_ids").contains(&a["id"]))
        {
            let agent = agent.clone();
            let connection = connection.clone();
            editor = editor.child(
                button(
                    SharedString::from(format!("grant-agent:{}", text(&agent, "id"))),
                    text(&agent, "name").to_owned(),
                    if self.context_work.grant_agent == text(&agent, "id") {
                        ButtonKind::Secondary
                    } else {
                        ButtonKind::Ghost
                    },
                    p,
                    cx,
                )
                .on_click(cx.listener(move |this, _, _, cx| {
                    this.context_work.grant_agent = text(&agent, "id").into();
                    this.restore_grant_tools(&connection);
                    cx.notify();
                })),
            );
        }
        if let Some(input) = self.context_work.fields.get("app-tool-search") {
            editor = editor.child(Input::new(input).aria_label("Search app actions"));
        }
        let search = connection.clone();
        editor = editor.child(
            button(
                "search-app-actions",
                "Search actions",
                ButtonKind::Outline,
                p,
                cx,
            )
            .disabled_state(self.busy, p)
            .on_click(cx.listener(move |this, _, window, cx| {
                let query = this
                    .context_work
                    .fields
                    .get("app-tool-search")
                    .map(|i| i.read(cx).value().to_string())
                    .unwrap_or_default();
                if !query.trim().is_empty() {
                    this.provider_operation(
                        "/v1/apps/search".into(),
                        json!({"connection_id":search["id"],"query":query}),
                        None,
                        window,
                        cx,
                    );
                }
            })),
        );
        let discovered = self
            .context_work
            .resources
            .get("app-tools")
            .and_then(Value::as_array);
        let mut tools = self.context_work.grant_tools.clone();
        for tool in discovered.into_iter().flatten() {
            tools.insert(text(tool, "slug").into());
        }
        for slug in tools {
            let label = slug.clone();
            editor = editor.child(
                Checkbox::new(SharedString::from(format!("app-tool:{slug}")))
                    .label(label)
                    .checked(self.context_work.grant_tools.contains(&slug))
                    .on_click(cx.listener(move |this, checked, _, cx| {
                        if *checked {
                            this.context_work.grant_tools.insert(slug.clone());
                        } else {
                            this.context_work.grant_tools.remove(&slug);
                        }
                        cx.notify();
                    })),
            );
        }
        let save = connection.clone();
        editor = editor.child(
            button(
                "save-app-grants",
                "Save conversation access",
                ButtonKind::Primary,
                p,
                cx,
            )
            .disabled_state(self.busy, p)
            .on_click(cx.listener(move |this, _, window, cx| {
                let thread = this.value()["thread"]["id"].clone();
                let agent = this.context_work.grant_agent.clone();
                let mut grants: Vec<_> = rows(&save, "grants")
                    .iter()
                    .filter(|g| g["thread_id"] != thread || g["agent_id"] != agent)
                    .cloned()
                    .collect();
                if !this.context_work.grant_tools.is_empty() {
                    grants.push(json!({
                        "thread_id": thread, "agent_id": agent,
                        "tools": this.context_work.grant_tools
                    }));
                }
                let id = text(&save, "id");
                this.dispatch(
                    format!("app-assign:{id}"),
                    Operation::command(
                        format!("/v1/apps/connections/{id}/assign"),
                        json!({"expected_revision": save["revision"], "grants": grants}),
                        this.selected,
                    ),
                    window,
                    cx,
                );
            })),
        );
        editor
            .child(caption(
                "Only the selected account, agent, conversation and actions receive access.",
                p,
            ))
            .into_any_element()
    }
}

fn app_row(name: &str, subtitle: &str, actions: AnyElement, p: Palette) -> AnyElement {
    div()
        .flex()
        .items_center()
        .gap(ui(12.))
        .px(ui(8.))
        .py(ui(8.))
        .rounded(ui(12.))
        .hover(|style| style.bg(p.color("secondary")))
        .child(
            div()
                .size(ui(40.))
                .flex_shrink_0()
                .flex()
                .items_center()
                .justify_center()
                .rounded(ui(10.))
                .bg(p.color("secondary"))
                .text_size(ui(15.))
                .font_weight(FontWeight::SEMIBOLD)
                .text_color(p.color("muted-foreground"))
                .child(
                    name.chars()
                        .next()
                        .unwrap_or(' ')
                        .to_uppercase()
                        .to_string(),
                ),
        )
        .child(
            div()
                .flex_1()
                .min_w_0()
                .child(
                    div()
                        .truncate()
                        .text_size(ui(14.))
                        .line_height(ui(20.))
                        .font_weight(FontWeight::SEMIBOLD)
                        .child(name.to_owned()),
                )
                .child(
                    caption(subtitle.to_owned(), p)
                        .truncate()
                        .text_size(ui(13.)),
                ),
        )
        .child(actions)
        .into_any_element()
}
