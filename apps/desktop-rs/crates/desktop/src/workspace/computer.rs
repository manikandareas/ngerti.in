//! One authoritative machine, two independently retired native viewer surfaces.
use super::*;
use crate::{
    host::views::Views,
    platform::embedded::{self, ComputerHealth},
    ui::{
        controls::{ButtonKind, button},
        theme::{Palette, ui},
        workspace::{action, glyph},
    },
};
use gpui_kit::component::{ActiveTheme, Disableable};
use gpui_kit::prelude::FluentBuilder;
use gpui_webview::WebView;
use ngertiin_client::text;
use std::{
    sync::{Arc, Mutex},
    time::{Duration, Instant},
};
struct Surface {
    grant: Value,
    view: Entity<WebView>,
    health: Arc<Mutex<ComputerHealth>>,
    started: Instant,
}
pub(super) struct Computer {
    worker: Option<ApiWorker>,
    origin: String,
    registry: Option<Arc<Views>>,
    machine: Value,
    agents: BTreeMap<String, String>,
    compact: Option<Surface>,
    expanded: Option<Surface>,
    pub open: bool,
    present: bool,
    suspended: bool,
    registry_epoch: u64,
    epoch: u64,
    pending: bool,
    busy: bool,
    error: String,
    timer: Option<Task<()>>,
    task: Option<Task<()>>,
    control_task: Option<Task<()>>,
    focus: FocusHandle,
    return_focus: Option<FocusHandle>,
    ticks: u64,
}
impl Computer {
    pub(super) fn activity_view(
        &self,
        run: &Value,
        preview: bool,
        cx: &mut Context<Self>,
    ) -> AnyElement {
        let p = Palette::new(cx.theme().mode.is_dark());
        let active = matches!(
            text(run, "status"),
            "running" | "dispatching" | "cancel_requested"
        );
        let other = self.machine["lease"]["holder"] == "human"
            || self.machine["lease"]["holder"] == "agent"
                && self.machine["lease"]["run_id"] != run["id"];
        let ready = active
            && run["computer_activity"]["phase"] == "active"
            && self.machine["id"] == run["computer_activity"]["machine_id"]
            && self.machine["generation"] == run["computer_activity"]["generation"]
            && self.machine["state"] == "ready"
            && !other;
        let label = if !active {
            match text(run, "status") {
                "cancelled" => "Activity stopped",
                "failed" => "Activity failed",
                _ => "Activity finished",
            }
        } else if self.machine["lease"]["holder"] == "human" {
            "You have control"
        } else if other {
            "Waiting for computer"
        } else if ready {
            "Connected"
        } else {
            "Connecting computer…"
        };
        let mut card = div()
            .id(SharedString::from(format!(
                "computer-activity:{}",
                text(run, "id")
            )))
            .role(Role::Group)
            .aria_label("Computer activity")
            .w_full()
            .max_w(ui(420.))
            .min_w_0()
            .p(ui(12.))
            .rounded(ui(16.))
            .border_1()
            .border_color(p.color("border-subtle"))
            .bg(p.color("composer"))
            .flex()
            .flex_col()
            .gap(ui(12.))
            .child(
                div()
                    .flex()
                    .items_center()
                    .gap(ui(12.))
                    .child(
                        div()
                            .size(ui(40.))
                            .rounded(ui(12.))
                            .bg(p.color("header-surface"))
                            .flex()
                            .items_center()
                            .justify_center()
                            .child(glyph("ComputerIcon", 22., p)),
                    )
                    .child(
                        div()
                            .min_w_0()
                            .child(
                                div()
                                    .text_size(ui(14.))
                                    .font_weight(FontWeight::MEDIUM)
                                    .child("Computer"),
                            )
                            .child(
                                div()
                                    .text_size(ui(13.))
                                    .text_color(p.color("muted-foreground"))
                                    .child(label),
                            ),
                    ),
            );
        if ready {
            if preview {
                card = card.child(self.screen(true, cx));
            }
            card = card.child(
                button(
                    SharedString::from(format!("activity-open:{}", text(run, "id"))),
                    "Open Computer",
                    ButtonKind::Secondary,
                    p,
                    cx,
                )
                .w_full()
                .rounded(ui(16.).to_pixels(cx.theme().font_size))
                .on_click(cx.listener(|this, _, window, cx| this.show(window, cx))),
            );
        }
        if let Ok(time) = crate::models::message::PublicationTime::local(
            run["computer_activity"]["started_at"]
                .as_str()
                .unwrap_or(text(run, "created_at")),
        ) {
            card = card.child(crate::ui::message::clock(&time, p));
        }
        card.into_any_element()
    }
    fn show(&mut self, window: &mut Window, cx: &mut Context<Self>) {
        self.open = true;
        if let Some(surface) = &self.compact {
            surface.view.update(cx, |view, _| {
                let _ = view.set_visible(false);
            });
        }
        self.return_focus = window.focused(cx);
        self.focus.focus(window, cx);
        cx.notify();
    }
    pub fn new(window: &mut Window, cx: &mut Context<Self>) -> Self {
        let mut this = Self {
            worker: None,
            origin: String::new(),
            registry: None,
            machine: Value::Null,
            agents: BTreeMap::new(),
            compact: None,
            expanded: None,
            open: false,
            present: false,
            suspended: false,
            registry_epoch: 0,
            epoch: 0,
            pending: false,
            busy: false,
            error: String::new(),
            timer: None,
            task: None,
            control_task: None,
            focus: cx.focus_handle().tab_stop(true),
            return_focus: None,
            ticks: 0,
        };
        this.timer = Some(cx.spawn_in(window, async move |view, cx| {
            loop {
                cx.background_executor().timer(Duration::from_secs(1)).await;
                if view
                    .update_in(cx, |this, window, cx| this.tick(window, cx))
                    .is_err()
                {
                    break;
                }
            }
        }));
        this
    }
    fn connect(&mut self) {
        if self.worker.is_some() {
            return;
        }
        if let Ok(Some((api, _))) = crate::host::api_client() {
            self.origin = api.origin().to_string();
            self.registry = Some(Views::new(api.clone()));
            self.worker = ApiWorker::new(api).ok();
        }
    }
    pub fn set_agents(&mut self, agents: &[Value], cx: &mut Context<Self>) {
        let names = agents
            .iter()
            .filter_map(|agent| {
                Some((
                    agent["id"].as_str()?.to_string(),
                    agent["name"].as_str()?.to_string(),
                ))
            })
            .collect();
        if self.agents != names {
            self.agents = names;
            cx.notify();
        }
    }
    pub fn present(&mut self, present: bool, cx: &mut Context<Self>) {
        if self.present == present {
            return;
        }
        self.present = present;
        if !present {
            self.retire(cx);
            self.open = false;
        }
        cx.notify();
    }
    pub fn suspend(&mut self, hidden: bool, cx: &mut Context<Self>) {
        if self.suspended == hidden {
            return;
        }
        self.suspended = hidden;
        if hidden {
            self.retire(cx);
        }
        cx.notify();
    }
    fn retire(&mut self, cx: &mut Context<Self>) {
        if let Some(registry) = &self.registry {
            registry.retire();
            self.registry_epoch = registry.epoch();
        }
        self.epoch += 1;
        self.compact = None;
        self.expanded = None;
        // Keep an in-flight task alive so its returned grant is reconciled natively.
        cx.notify();
    }
    fn tick(&mut self, window: &mut Window, cx: &mut Context<Self>) {
        if !self.present || self.suspended {
            return;
        }
        self.connect();
        self.ticks += 1;
        if std::env::var_os("NGERTIIN_RS_DIAGNOSTICS").is_some()
            && let Ok(home) = crate::host::profile_root()
        {
            let health = |surface: &Option<Surface>| {
                surface.as_ref().map(|s| {
                let h=s.health.lock().unwrap();
                serde_json::json!({"interactive":s.grant["interactive"],"control_revision":s.grant["control_revision"],"frames_decoded":h.frames,"status":h.status,"age_ms":h.received.elapsed().as_millis()})
            })
            };
            let _ = crate::host::write_diagnostic(
                &home.join("computer-status.json"),
                &serde_json::json!({"machine_id":self.machine["id"],"lease":self.machine["lease"],"compact":health(&self.compact),"expanded":health(&self.expanded),"epoch":self.epoch,"error":self.error}),
            );
        }

        if let Some(registry) = &self.registry
            && registry.epoch() != self.registry_epoch
        {
            self.registry_epoch = registry.epoch();
            self.compact = None;
            self.expanded = None;
            self.epoch += 1;
        }
        if self.pending || self.busy {
            return;
        }
        let Some(worker) = &self.worker else {
            return;
        };
        let reply = worker.submit(false, |api| api.get("/v1/machine"));
        let epoch = self.epoch;
        self.pending = true;
        self.task = Some(cx.spawn_in(window, async move |view, cx| {
            let result = match reply {
                Ok(reply) => reply
                    .await
                    .unwrap_or(Err(ngertiin_client::ClientError::Unavailable)),
                Err(error) => Err(error),
            };
            let _ = view.update_in(cx, |this, window, cx| {
                this.pending = false;
                if this.busy || epoch != this.epoch || !this.present || this.suspended {
                    return;
                }
                match result {
                    Ok(machine) => {
                        this.machine = machine;
                        this.error.clear();
                        this.reconcile_surfaces(window, cx);
                    }
                    Err(_) => {
                        this.error =
                            "Desktop status is unavailable. Reconnect and try again.".into();
                        this.retire(cx);
                        this.worker = None;
                        this.registry = None;
                    }
                }
                cx.notify();
            });
        }));
    }
    fn reconcile_surfaces(&mut self, window: &mut Window, cx: &mut Context<Self>) {
        if self.machine["state"] != "ready" {
            if self.compact.is_some() || self.expanded.is_some() {
                self.retire(cx);
            }
            return;
        }
        let human = self.machine["lease"]["holder"] == "human"
            && self.machine["lease"]["state"] == "active";
        let revision = self.machine["lease"]["revision"].as_u64().unwrap_or(0);
        let stale = self.expanded.as_ref().is_some_and(|s| {
            s.grant["interactive"] != human
                || human && s.grant["control_revision"].as_u64() != Some(revision)
        });
        if stale {
            self.replace(false, cx);
        }
        if self.compact.is_none() {
            self.issue(true, false, revision, window, cx);
        } else if self.open && self.expanded.is_none() {
            self.issue(false, human, revision, window, cx);
        } else {
            let recovery = [(true, &self.compact), (false, &self.expanded)]
                .into_iter()
                .find_map(|(compact, s)| {
                    let surface = s.as_ref()?;
                    let health = surface.health.lock().unwrap();
                    let expired =
                        chrono::DateTime::parse_from_rfc3339(text(&surface.grant, "expires_at"))
                            .is_ok_and(|t| {
                                t.timestamp_millis() - chrono::Utc::now().timestamp_millis()
                                    < 60_000
                            });
                    let failed = !(compact && self.open)
                        && (health.status == "failed"
                            || health.received.elapsed() > Duration::from_secs(15)
                            || health.frames == 0
                                && surface.started.elapsed() > Duration::from_secs(20));
                    (expired || failed).then_some((
                        compact,
                        expired,
                        text(&surface.grant, "viewer_id").to_string(),
                    ))
                });
            if let Some((compact, renew, id)) = recovery {
                if renew {
                    self.renew(compact, id, window, cx);
                } else {
                    self.replace(compact, cx);
                }
            }
        }
    }
    fn issue(
        &mut self,
        compact: bool,
        interactive: bool,
        revision: u64,
        window: &mut Window,
        cx: &mut Context<Self>,
    ) {
        if self.pending {
            return;
        }
        let (Some(worker), Some(registry)) = (&self.worker, &self.registry) else {
            return;
        };
        let registry = registry.clone();
        let registry_epoch = registry.epoch();
        let epoch = self.epoch;
        let reply = worker.submit(false, move |_| {
            registry.issue(interactive, revision, registry_epoch)
        });
        self.pending = true;
        self.task = Some(cx.spawn_in(window, async move |view, cx| {
            let result = match reply {
                Ok(reply) => reply
                    .await
                    .unwrap_or(Err(ngertiin_client::ClientError::Unavailable)),
                Err(error) => Err(error),
            };
            let _ =
                view.update_in(cx, |this, window, cx| {
                    this.pending = false;
                    if epoch != this.epoch || !this.present || this.suspended {
                        return;
                    }
                    match result {
                        Ok(grant) => {
                            let health = Arc::new(Mutex::new(ComputerHealth::default()));
                            let mut url = format!(
                                "{}{}",
                                this.origin.trim_end_matches('/'),
                                text(&grant, "viewer_url")
                            );
                            if compact {
                                url.push_str("&ngertiin_preview=1");
                            }
                            match embedded::computer(
                                &url,
                                text(&grant, "viewer_id"),
                                health.clone(),
                                window,
                                cx,
                            ) {
                                Ok(webview) => {
                                    let surface = Surface {
                                        grant,
                                        view: cx.new(|_| webview),
                                        health,
                                        started: Instant::now(),
                                    };
                                    if compact {
                                        this.compact = Some(surface);
                                    } else {
                                        this.expanded = Some(surface);
                                    }
                                    this.error.clear();
                                }
                                Err(_) => this.error =
                                    "The desktop preview could not open. Reconnect and try again."
                                        .into(),
                            }
                        }
                        Err(_) => this.error = "Desktop is reconnecting…".into(),
                    }
                    cx.notify();
                });
        }));
    }
    fn renew(&mut self, compact: bool, id: String, window: &mut Window, cx: &mut Context<Self>) {
        let (Some(worker), Some(registry)) = (&self.worker, &self.registry) else {
            return;
        };
        let registry = registry.clone();
        let epoch = self.epoch;
        let reply = worker.submit(false, move |_| registry.renew(&id));
        self.pending = true;
        self.task = Some(cx.spawn_in(window, async move |view, cx| {
            let result = match reply {
                Ok(reply) => reply
                    .await
                    .unwrap_or(Err(ngertiin_client::ClientError::Unavailable)),
                Err(error) => Err(error),
            };
            let _ = view.update_in(cx, |this, _, cx| {
                this.pending = false;
                if epoch != this.epoch {
                    return;
                }
                match result {
                    Ok(value) => {
                        if let Some(surface) = if compact {
                            &mut this.compact
                        } else {
                            &mut this.expanded
                        } {
                            surface.grant["expires_at"] = value["expires_at"].clone();
                        }
                    }
                    Err(_) => this.replace(compact, cx),
                }
                cx.notify();
            });
        }));
    }
    fn replace(&mut self, compact: bool, cx: &mut Context<Self>) {
        let old = if compact {
            self.compact.take()
        } else {
            self.expanded.take()
        };
        if let (Some(surface), Some(registry)) = (old, self.registry.clone()) {
            let id = text(&surface.grant, "viewer_id").to_string();
            std::thread::spawn(move || registry.revoke(&id));
        }
        cx.notify();
    }
    fn control(&mut self, window: &mut Window, cx: &mut Context<Self>) {
        if self.busy || self.machine["state"] != "ready" {
            return;
        }
        let operation = if self.machine["lease"]["state"] == "unknown" {
            "reconcile"
        } else if self.machine["lease"]["holder"] == "human" {
            "release"
        } else {
            "acquire"
        };
        let revision = self.machine["lease"]["revision"].as_u64().unwrap_or(0);
        let (Some(worker), Some(registry)) = (&self.worker, &self.registry) else {
            return;
        };
        let registry = registry.clone();
        let registry_epoch = registry.epoch();
        let epoch = self.epoch;
        let reply = worker.submit(false, move |_| {
            registry.control(operation, revision, registry_epoch)
        });
        self.busy = true;
        // Never replay a timed-out control mutation. The next read reconciles state.
        self.control_task = Some(cx.spawn_in(window, async move |view, cx| {
            let result = match reply {
                Ok(reply) => reply
                    .await
                    .unwrap_or(Err(ngertiin_client::ClientError::Unavailable)),
                Err(error) => Err(error),
            };
            let _ = view.update_in(cx, |this, _, cx| {
                this.busy = false;
                if epoch != this.epoch {
                    return;
                }
                match result {
                    Ok(machine) => {
                        this.machine = machine;
                        this.error.clear();
                        this.replace(false, cx);
                    }
                    Err(_) => {
                        this.error =
                            "Control could not be changed. Reconnect and try again.".into();
                        this.replace(false, cx);
                    }
                }
                cx.notify();
            });
        }));
        cx.notify();
    }
    pub fn close(&mut self, window: &mut Window, cx: &mut Context<Self>) {
        self.open = false;
        self.retire(cx);
        if let Some(focus) = self.return_focus.take() {
            focus.focus(window, cx);
        }
        cx.notify();
    }
    fn label(&self) -> String {
        if self.machine["lease"]["state"] == "unknown" {
            "Control needs reconnection".into()
        } else if self.machine["lease"]["holder"] == "human" {
            "You have control".into()
        } else if self.machine["lease"]["holder"] == "agent" {
            format!(
                "{} has control",
                self.agents
                    .get(text(&self.machine["lease"], "agent_id"))
                    .map(String::as_str)
                    .unwrap_or("An agent")
            )
        } else {
            "Ready for your agents".into()
        }
    }
    fn screen(&self, compact: bool, cx: &App) -> AnyElement {
        let surface = if compact {
            &self.compact
        } else {
            &self.expanded
        };
        let p = Palette::new(cx.theme().mode.is_dark());
        let mut frame = div()
            .relative()
            .w_full()
            .overflow_hidden()
            .rounded(ui(12.))
            .bg(p.color("computer-background"));
        if compact {
            frame = frame.aspect_ratio(1.6);
        } else {
            frame = frame.flex_1().min_h_0();
        }
        if let Some(surface) = surface {
            frame = frame.child(embedded::computer_surface(
                &surface.view,
                !self.suspended && self.present && (!compact || !self.open),
            ));
        } else {
            frame = frame
                .flex()
                .items_center()
                .justify_center()
                .text_color(p.color("muted-foreground"))
                .child(
                    if self.error.is_empty() {
                        "Connecting desktop…"
                    } else {
                        &self.error
                    }
                    .to_string(),
                );
        }
        frame.into_any_element()
    }
    pub fn overlay(&self, cx: &mut Context<Self>) -> AnyElement {
        use gpui_kit::base::FocusTrapElement;
        let p = Palette::new(cx.theme().mode.is_dark());
        div().id("shared-desktop-dialog").absolute().inset_0().p(ui(20.)).bg(p.color("overlay")).flex().items_center().justify_center()
            .child(div().id("expanded-computer").role(Role::Dialog).aria_label("Shared desktop").focus_trap("computer-focus",&self.focus).size_full().max_w(ui(1400.)).max_h(ui(1000.)).p(ui(16.)).rounded(ui(16.)).bg(p.color("popover")).flex().flex_col().gap(ui(12.))
                .on_key_down(cx.listener(|this,event:&KeyDownEvent,window,cx|if event.keystroke.key=="escape" {this.close(window,cx);cx.stop_propagation();}))
                .child(div().flex().items_center().gap(ui(8.)).child(glyph("ComputerIcon",17.,p)).child(div().flex_1().font_weight(FontWeight::MEDIUM).child("Shared desktop")).child(action("close-computer","Close shared desktop","Cancel01Icon",p,cx).on_click(cx.listener(|this,_,window,cx|this.close(window,cx)))))
                .child(div().text_color(p.color("muted-foreground")).child("The same Linux desktop your agents use. Take control to click, type, or sign in."))
                .child(div().flex().items_center().justify_between().gap(ui(8.)).child(div().id("computer-status").role(Role::Status).text_color(p.color("muted-foreground")).child(self.label())).child(button("computer-control",if self.busy {"Changing control…"} else if self.machine["lease"]["state"]=="unknown" {"Reconnect control"} else if self.machine["lease"]["holder"]=="human" {"Return control"} else {"Take control"},if self.machine["lease"]["holder"]=="human" {ButtonKind::Outline} else {ButtonKind::Primary},p,cx).text_size(ui(13.)).h(ui(32.)).disabled(self.busy || self.pending || self.machine["state"]!="ready").on_click(cx.listener(|this,_,window,cx|this.control(window,cx)))))
                .when(!self.error.is_empty(),|v|v.child(div().id("computer-error").role(Role::Alert).text_color(p.color("destructive")).child(self.error.clone())))
                .child(self.screen(false,cx)))
            .into_any_element()
    }
}
impl Render for Computer {
    fn render(&mut self, _: &mut Window, cx: &mut Context<Self>) -> impl IntoElement {
        let p = Palette::new(cx.theme().mode.is_dark());
        let ready = self.machine["state"] == "ready";
        let label = if ready {
            "Open shared desktop"
        } else if self.machine["state"] == "unconfigured" {
            "Desktop not set up"
        } else {
            "Desktop unavailable"
        };
        let open = button("open-shared-desktop", "", ButtonKind::Ghost, p, cx)
            .accessibility_label("View desktop")
            .disabled(!ready)
            .w_full()
            .h(ui(36.))
            .rounded(ui(12.).to_pixels(cx.theme().font_size))
            .bg(p.color("composer"))
            .child(
                div()
                    .w_full()
                    .flex()
                    .items_center()
                    .justify_center()
                    .gap(ui(8.))
                    .text_size(ui(13.))
                    .child(glyph("ComputerIcon", 18., p))
                    .child(label),
            )
            .on_click(cx.listener(|this, _, window, cx| this.show(window, cx)));
        div()
            .flex()
            .flex_col()
            .gap(ui(12.))
            .pt(ui(14.))
            .when(ready, |view| view.child(self.screen(true, cx)))
            .child(open)
            .child(
                div()
                    .id("computer-status")
                    .role(Role::Status)
                    .text_center()
                    .text_size(ui(13.))
                    .text_color(p.color("muted-foreground"))
                    .child(if ready {
                        self.label()
                    } else {
                        "Reconnect the local machine to continue desktop work.".into()
                    }),
            )
            .child(div().text_size(ui(13.)).text_color(p.color("muted-foreground")).child("One desktop for you and all your agents. Browser sessions, working files, and attachment copies on this machine are shared."))
            .when(!self.error.is_empty(), |view| {
                view.child(
                    div()
                        .id("computer-error")
                        .role(Role::Alert)
                        .text_color(p.color("destructive"))
                        .child(self.error.clone()),
                )
            })
            .when(!ready || !self.error.is_empty(), |view| {
                view.child(
                    button("reconnect-computer", "Reconnect", ButtonKind::Outline, p, cx)
                        .on_click(cx.listener(|this, _, _, cx| this.retire(cx))),
                )
            })
    }
}
