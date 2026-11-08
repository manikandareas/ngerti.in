use super::*;
use crate::storage::Operation;
use gpui_kit::component::{checkbox::Checkbox, input::Input};
impl Workspace {
    pub(in crate::workspace) fn open_apps(&mut self, window: &mut Window, cx: &mut Context<Self>) {
        self.context_read("apps", "/v1/apps/connections".into(), cx);
        self.context_read("app-catalog", "/v1/apps/catalog".into(), cx);
        self.set_context_field("app-search", "", window, cx);
        self.locate_context(Location::Apps, window, cx);
    }
    pub(in crate::workspace) fn apps_view(&self, cx: &mut Context<Self>) -> AnyElement {
        let p = Palette::new(self.store.dark());
        let mut view = div().flex().flex_col().gap(ui(16.));
        if let Some(input) = self.context_work.fields.get("app-search") {
            view = view.child(Input::new(input).aria_label("Search apps"));
        }
        view = view.child(
            button("search-apps", "Search", ButtonKind::Outline, p, cx).on_click(cx.listener(
                |this, _, _, cx| {
                    let query = this
                        .context_work
                        .fields
                        .get("app-search")
                        .map(|v| v.read(cx).value().to_string())
                        .unwrap_or_default();
                    this.context_read(
                        "app-catalog",
                        format!("/v1/apps/catalog?search={}", super::files::encode(&query)),
                        cx,
                    );
                },
            )),
        );
        if let Some(state) = self.resource_status("apps", cx) {
            view = view.child(state);
        }
        if let Some(state) = self.resource_status("app-catalog", cx) {
            view = view.child(state);
        }
        view = view.child(
            button("refresh-apps", "Refresh", ButtonKind::Ghost, p, cx).on_click(cx.listener(
                |this, _, _, cx| {
                    this.context_read("apps", "/v1/apps/connections".into(), cx);
                    this.context_read("app-catalog", "/v1/apps/catalog".into(), cx);
                },
            )),
        );
        for connection in self
            .context_work
            .resources
            .get("apps")
            .and_then(Value::as_array)
            .into_iter()
            .flatten()
        {
            let id = text(connection, "id").to_owned();
            view = view
                .child(
                    div()
                        .font_weight(FontWeight::SEMIBOLD)
                        .child(text(connection, "toolkit").to_owned()),
                )
                .child(caption(
                    format!(
                        "{} · account {}",
                        text(connection, "state"),
                        text(connection, "account_id")
                    ),
                    p,
                ));
            for grant in rows(connection, "grants")
                .iter()
                .filter(|g| g["thread_id"] == self.value()["thread"]["id"])
            {
                view = view.child(caption(
                    format!(
                        "{}: {}",
                        text(grant, "agent_id"),
                        rows(grant, "tools")
                            .iter()
                            .filter_map(Value::as_str)
                            .collect::<Vec<_>>()
                            .join(", ")
                    ),
                    p,
                ));
            }
            let selected = connection.clone();
            view = view.child(
                button(
                    SharedString::from(format!("manage-grants:{id}")),
                    "Conversation access…",
                    ButtonKind::Ghost,
                    p,
                    cx,
                )
                .disabled_state(connection["state"] != "active", p)
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
            for (operation, label) in [("refresh", "Check connection"), ("reconnect", "Reconnect…")]
            {
                let id = id.clone();
                view = view.child(
                    button(
                        SharedString::from(format!("app:{id}:{operation}")),
                        label,
                        ButtonKind::Outline,
                        p,
                        cx,
                    )
                    .disabled_state(self.busy, p)
                    .on_click(cx.listener(move |this, _, window, cx| {
                        this.provider_operation(
                            format!("/v1/apps/connections/{id}/{operation}"),
                            json!({}),
                            None,
                            window,
                            cx,
                        )
                    })),
                );
            }
        }
        if let Some((kind, connection)) = &self.context_work.form
            && kind == "app"
        {
            view = view.child(self.app_grants(connection, cx));
        }
        if let Some(catalog) = self.context_work.resources.get("app-catalog") {
            for item in rows(catalog, "items") {
                let slug = text(item, "slug").to_owned();
                view = view.child(
                    button(
                        SharedString::from(format!("connect-app:{slug}")),
                        format!("Connect {}…", text(item, "name")),
                        ButtonKind::Ghost,
                        p,
                        cx,
                    )
                    .disabled_state(self.busy, p)
                    .on_click(cx.listener(move |this, _, window, cx| {
                        this.provider_operation(
                            "/v1/apps/connect".into(),
                            json!({"toolkit":slug}),
                            None,
                            window,
                            cx,
                        )
                    })),
                );
            }
        }
        view.into_any_element()
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
                    .font_weight(FontWeight::SEMIBOLD)
                    .child(format!("Access {}", text(connection, "toolkit"))),
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
