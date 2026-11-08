use super::*;
use crate::storage::Operation;
use gpui_kit::component::input::Input;

impl Workspace {
    pub(in crate::workspace) fn settings_overlay(&self, cx: &mut Context<Self>) -> AnyElement {
        use gpui_kit::base::FocusTrapElement;
        let p = Palette::new(self.store.dark());
        div()
            .absolute()
            .inset_0()
            .bg(p.color("overlay"))
            .px(ui(16.))
            .py(ui(48.))
            .flex()
            .items_center()
            .justify_center()
            .child(
                div()
                    .id("native-settings-dialog")
                    .role(Role::Dialog)
                    .aria_label("Pengaturan")
                    .w(ui(900.))
                    .max_w_full()
                    .h(ui(700.))
                    .max_h_full()
                    .rounded(ui(12.))
                    .overflow_hidden()
                    .bg(p.color("background"))
                    .focus_trap("settings-focus-trap", &self.context_work.focus)
                    .child(self.settings_view(cx)),
            )
            .into_any_element()
    }
    pub(in crate::workspace) fn settings_view(&self, cx: &mut Context<Self>) -> AnyElement {
        let p = Palette::new(self.store.dark());
        let section = &self.context_work.section;
        let mut nav = div()
            .w(ui(198.))
            .h_full()
            .flex_shrink_0()
            .p(ui(16.))
            .flex()
            .flex_col()
            .gap(ui(8.))
            .bg(p.color("frame"));
        if let Some(input) = self.context_work.fields.get("settings-search") {
            nav = nav.child(Input::new(input).aria_label("Cari pengaturan"));
        }
        let query = self
            .context_field_value("settings-search", cx)
            .to_lowercase();
        for (id, label, icon) in [
            ("general", "Umum", "Settings01Icon"),
            ("providers", "Providers", "SparklesIcon"),
            ("about", "Tentang", "InformationCircleIcon"),
        ] {
            if !query.is_empty() && !format!("{label} {id}").to_lowercase().contains(&query) {
                continue;
            }
            nav = nav.child(
                button(
                    SharedString::from(format!("settings-section:{id}")),
                    "",
                    ButtonKind::Ghost,
                    p,
                    cx,
                )
                .accessibility_label(label)
                .w_full()
                .justify_start()
                .gap(ui(10.))
                .h(ui(36.))
                .rounded(ui_px(8., cx))
                .when(section == id, |b| b.bg(p.color("secondary")))
                .child(glyph(icon, 15., p))
                .child(label)
                .child(div().flex_1())
                .on_click(cx.listener(move |this, _, _, cx| {
                    this.context_work.section = id.into();
                    cx.notify();
                })),
            );
        }
        let title = match section.as_str() {
            "providers" => "Providers",
            "about" => "Tentang",
            _ => "Umum",
        };
        let content=match section.as_str(){
            "providers"=>self.providers_view(cx),
            "about"=>div().flex().flex_col().gap(ui(24.))
                .child(div().text_size(ui(16.)).font_weight(FontWeight::SEMIBOLD).child("Ngertiin"))
                .child(caption("Persistent agents. Continue work through conversations with Tobi and your agents.",p))
                .child(caption("Agent names, directions, memory, skills, model and reasoning are available in the conversation context.",p)).into_any_element(),
            _=>self.appearance_view(cx),
        };
        div()
            .size_full()
            .flex()
            .items_stretch()
            .track_focus(&self.context_work.focus)
            .child(nav)
            .child(
                div()
                    .flex_1()
                    .min_w_0()
                    .h_full()
                    .flex()
                    .flex_col()
                    .child(
                        div()
                            .h(ui(68.))
                            .flex_shrink_0()
                            .px(ui(32.))
                            .flex()
                            .items_center()
                            .justify_between()
                            .child(
                                div()
                                    .text_size(ui(18.))
                                    .font_weight(FontWeight::SEMIBOLD)
                                    .child(title),
                            )
                            .child(
                                action("close-settings", "Close settings", "Cancel01Icon", p, cx)
                                    .on_click(cx.listener(|this, _, window, cx| {
                                        this.close_context(window, cx)
                                    })),
                            ),
                    )
                    .child(
                        div()
                            .id("settings-scroll")
                            .flex_1()
                            .min_h_0()
                            .overflow_y_scroll()
                            .p(ui(32.))
                            .child(content),
                    )
                    .when(!self.error.is_empty(), |v| {
                        v.child(
                            div()
                                .id("settings-error")
                                .p(ui(16.))
                                .role(Role::Alert)
                                .text_color(p.color("destructive"))
                                .child(self.error.clone()),
                        )
                    }),
            )
            .into_any_element()
    }
    fn appearance_view(&self, cx: &mut Context<Self>) -> AnyElement {
        use gpui_kit::component::Selectable;
        let p = Palette::new(self.store.dark());
        let mut choices = div()
            .id("appearance-options")
            .role(Role::RadioGroup)
            .aria_label("Tema tampilan")
            .flex()
            .gap(ui(4.))
            .p(ui(4.))
            .bg(p.color("secondary"))
            .rounded(ui(8.));
        for (mode, label) in [("system", "Sistem"), ("light", "Terang"), ("dark", "Gelap")] {
            choices = choices.child(
                button(
                    SharedString::from(format!("theme:{mode}")),
                    label,
                    ButtonKind::Ghost,
                    p,
                    cx,
                )
                .role(Role::RadioButton)
                .selected(self.store.appearance() == mode)
                .h(ui(28.))
                .rounded(ui_px(6., cx))
                .when(self.store.appearance() == mode, |button| {
                    button.bg(p.color("background"))
                })
                .on_click(cx.listener(move |this, _, window, cx| {
                    let dark = if mode == "system" {
                        matches!(
                            window.appearance(),
                            WindowAppearance::Dark | WindowAppearance::VibrantDark
                        )
                    } else {
                        mode == "dark"
                    };
                    if let Err(error) = this.store.set_appearance(mode, dark) {
                        this.error = error.to_string();
                    }
                    crate::ui::theme::apply(dark, None, cx);
                    cx.notify();
                })),
            );
        }
        div()
            .flex()
            .flex_col()
            .gap(ui(24.))
            .child(
                div()
                    .text_size(ui(16.))
                    .font_weight(FontWeight::SEMIBOLD)
                    .child("Tampilan"),
            )
            .child(
                div()
                    .flex()
                    .items_center()
                    .justify_between()
                    .child("Tema")
                    .child(choices),
            )
            .into_any_element()
    }
    fn providers_view(&self, cx: &mut Context<Self>) -> AnyElement {
        let p = Palette::new(self.store.dark());
        let mut view = div().flex().flex_col().gap(ui(24.));
        if let Some(tobi) = self.agents.iter().find(|a| a["system_role"] == "tobi") {
            view = view
                .child(
                    div()
                        .font_weight(FontWeight::SEMIBOLD)
                        .child("Tobi dan agent baru"),
                )
                .child(self.contained_model_picker(tobi, cx));
        }
        let mut providers = div().flex().gap(ui(8.));
        for (id, label) in [("codex", "ChatGPT"), ("muse", "Muse Code")] {
            providers = providers.child(
                button(
                    SharedString::from(format!("provider:{id}")),
                    label,
                    if self.context_work.provider == id {
                        ButtonKind::Secondary
                    } else {
                        ButtonKind::Outline
                    },
                    p,
                    cx,
                )
                .on_click(cx.listener(move |this, _, _, cx| {
                    this.context_work.provider = id.into();
                    cx.notify();
                })),
            );
        }
        view = view.child(providers);
        for connection in self
            .connections
            .iter()
            .filter(|c| c["harness"] == self.context_work.provider)
        {
            let id = text(connection, "id");
            let mut account = div()
                .flex()
                .flex_col()
                .gap(ui(12.))
                .border_b_1()
                .border_color(p.color("border-subtle"))
                .pb(ui(20.))
                .child(div().font_weight(FontWeight::MEDIUM).child(format!(
                    "{} · {}",
                    if connection["harness"] == "muse" {
                        "Muse Code"
                    } else {
                        "ChatGPT"
                    },
                    text(&connection["authentication"], "method")
                )));
            for (label, value) in [
                ("Account", text(connection, "account_id")),
                ("Login", text(connection, "login")),
                ("Model discovery", text(connection, "discovery")),
                ("Inference", text(connection, "inference")),
                (
                    "Selected billing",
                    text(&connection["authentication"], "billing_source"),
                ),
                (
                    "Effective billing",
                    connection["effective_billing_source"]
                        .as_str()
                        .unwrap_or("Unverified"),
                ),
            ] {
                account = account.child(caption(format!("{label}: {value}"), p));
            }
            let mut controls = div().flex().flex_wrap().gap(ui(8.));
            for (action, label) in [
                ("inspect", "Check account & models"),
                ("login", "Log in"),
                ("login/cancel", "Cancel login"),
            ] {
                let id = id.to_owned();
                controls = controls.child(
                    button(
                        SharedString::from(format!("account:{id}:{action}")),
                        label,
                        ButtonKind::Outline,
                        p,
                        cx,
                    )
                    .disabled_state(
                        self.busy
                            || connection["state"] == "revoked"
                            || (action.starts_with("login")
                                && connection["authentication"]["method"] != "native_login"),
                        p,
                    )
                    .on_click(cx.listener(move |this, _, window, cx| {
                        this.provider_operation(
                            format!("/v1/connections/{id}/{action}"),
                            json!({}),
                            None,
                            window,
                            cx,
                        )
                    })),
                );
            }
            let id = id.to_owned();
            controls = controls.child(
                button(
                    SharedString::from(format!("revoke-provider:{id}")),
                    "Disconnect…",
                    ButtonKind::Ghost,
                    p,
                    cx,
                )
                .disabled_state(self.busy || connection["state"] == "revoked", p)
                .on_click(cx.listener(move |_this, _, window, cx| {
                    let id = id.clone();
                    let weak = cx.entity().downgrade();
                    window.open_dialog(cx, move |dialog, _, _cx| {
                        let id = id.clone();
                        let weak = weak.clone();
                        dialog
                            .title("Disconnect this account?")
                            .child("Agents using this account will need another connection.")
                            .on_ok(move |_, window, cx| {
                                let _ = weak.update(cx, |this, cx| {
                                    this.dispatch(
                                        format!("revoke:{id}"),
                                        Operation::command(
                                            format!("/v1/connections/{id}/revoke"),
                                            json!({}),
                                            None,
                                        ),
                                        window,
                                        cx,
                                    )
                                });
                                true
                            })
                    });
                })),
            );
            account = account.child(controls);
            view = view.child(account);
        }
        view = view.child(
            button("add-subscription", "Add account…", ButtonKind::Outline, p, cx)
                .disabled_state(self.busy, p)
                .on_click(cx.listener(|this, _, window, cx| {
                    this.dispatch(
                        "add-provider".into(),
                        Operation::command(
                            "/v1/connections".into(),
                            json!({
                                "harness": this.context_work.provider,
                                "authentication": {"method": "native_login", "billing_source": "subscription"}
                            }),
                            None,
                        ),
                        window, cx,
                    );
                })),
        );
        view = view.child(
            button("add-api-key", "Add API key…", ButtonKind::Ghost, p, cx).on_click(cx.listener(
                |this, _, window, cx| {
                    if !this.context_work.fields.contains_key("api-key") {
                        let input = cx.new(|cx| {
                            InputState::new(window, cx)
                                .masked(true)
                                .placeholder("API key")
                        });
                        this.context_work.fields.insert("api-key".into(), input);
                    }
                    cx.notify();
                },
            )),
        );
        if let Some(input) = self.context_work.fields.get("api-key") {
            view = view
                .child(
                    Input::new(input)
                        .aria_label("API key")
                        .disabled(self.busy || self.context_work.secret_pending.is_some()),
                )
                .child(
                    button(
                        "save-api-key",
                        if self.context_work.secret_pending.is_some() {
                            "Retry the same request"
                        } else {
                            "Save API key"
                        },
                        ButtonKind::Primary,
                        p,
                        cx,
                    )
                    .disabled_state(self.busy, p)
                    .on_click(cx.listener(|this, _, window, cx| {
                        let body = if let Some(body) = &this.context_work.secret_pending {
                            body.clone()
                        } else {
                            let Some(input) = this.context_work.fields.get("api-key") else {
                                return;
                            };
                            let key = input.read(cx).value().trim().to_owned();
                            if key.is_empty() {
                                return;
                            }
                            json!({"harness":this.context_work.provider,"api_key":key})
                        };
                        this.context_work.secret_pending = Some(body.clone());
                        this.provider_operation(
                            "/v1/connections/api-key".into(),
                            body,
                            Some(this.context_work.secret_operation),
                            window,
                            cx,
                        );
                    })),
                );
        }
        if let Some(login) = self.context_work.resources.get("authorization") {
            if let Some(code) = login["user_code"].as_str() {
                view = view.child(caption(format!("Login code: {code}"), p));
            }
            if let Some(url) = login["auth_url"].as_str() {
                let url = url.to_owned();
                view = view.child(
                    button(
                        "open-login-link",
                        "Open login page",
                        ButtonKind::Outline,
                        p,
                        cx,
                    )
                    .on_click(
                        cx.listener(move |this, _, _, cx| this.open_authorization_url(&url, cx)),
                    ),
                );
            }
        }
        view.child(caption("Account login, model discovery and completed inference are separate. Billing changes only when you explicitly select another connection.",p)).into_any_element()
    }
    pub(super) fn provider_operation(
        &mut self,
        path: String,
        body: Value,
        key: Option<Uuid>,
        window: &mut Window,
        cx: &mut Context<Self>,
    ) {
        if self.busy || !self.checked {
            return;
        }
        let Some(worker) = &self.writes else {
            return;
        };
        let operation_path = path.clone();
        let Ok(reply) = worker.submit(true, move |api| api.post(&path, &body, key)) else {
            return;
        };
        self.busy = true;
        self.error.clear();
        let scope = self.scope;
        self.command_task = Some(cx.spawn_in(window, async move |view, cx| {
            let result = reply.await.unwrap_or(Err(ClientError::Unavailable));
            let _ = view.update_in(cx, |this, window, cx| {
                this.busy = false;
                this.command_task = None;
                if scope != this.scope {
                    return;
                }
                match result {
                    Ok(value) => {
                        if operation_path == "/v1/learning/skills/read" {
                            this.context_work.form =
                                Some(("skill-edit".into(), value["skill"].clone()));
                            this.context_work.fields.remove("skill-name");
                            this.set_context_field(
                                "skill-description",
                                text(&value["revision"]["package"], "description"),
                                window,
                                cx,
                            );
                            this.set_context_textarea(
                                "skill-instructions",
                                text(&value["revision"]["package"], "instructions"),
                                window,
                                cx,
                            );
                            this.set_context_field(
                                "skill-version",
                                &value["revision"]["version"].to_string(),
                                window,
                                cx,
                            );
                            this.context_work
                                .resources
                                .insert("skill-revision".into(), value.clone());
                        }
                        if operation_path == "/v1/connections/api-key" {
                            this.context_work.fields.remove("api-key");
                            this.context_work.secret_pending = None;
                            this.context_work.secret_operation = Uuid::new_v4();
                        }
                        for key in ["connect_url", "auth_url", "url"] {
                            if let Some(url) = value[key].as_str() {
                                this.open_authorization_url(url, cx);
                            }
                        }
                        let resource = if operation_path == "/v1/apps/search" {
                            "app-tools"
                        } else {
                            "authorization"
                        };
                        this.context_work.resources.insert(resource.into(), value);
                    }
                    Err(e) => {
                        if operation_path == "/v1/connections/api-key"
                            && matches!(e, ClientError::Rejected { .. })
                        {
                            this.context_work.secret_pending = None;
                            this.context_work.secret_operation = Uuid::new_v4();
                        }
                        this.error = e.to_string();
                    }
                }
                this.context_read("apps", "/v1/apps/connections".into(), cx);
                this.refresh(true, window, cx);
                cx.notify();
            });
        }));
        cx.notify();
    }
    fn open_authorization_url(&mut self, url: &str, cx: &mut Context<Self>) {
        // External authorization is an OS browser handoff, never a shell or an embedded app page.
        if crate::host::is_external_url(url) {
            cx.open_url(url);
        } else {
            self.error =
                "The provider returned an unsupported authorization link. Check the account again."
                    .into();
        }
    }
}
