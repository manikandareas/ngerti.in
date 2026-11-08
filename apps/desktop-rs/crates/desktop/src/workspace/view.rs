use super::*;
use crate::ui::{
    controls::{ButtonKind, button},
    theme::{Palette, ui},
};
use gpui_kit::component::{WindowExt, message_scroller::MessageScroller};

impl Render for Workspace {
    fn render(&mut self, window: &mut Window, cx: &mut Context<Self>) -> impl IntoElement {
        let p = Palette::new(self.store.dark());
        let width = f32::from(window.viewport_size().width) / f32::from(window.rem_size()) * 16.;
        let settings = self.panel == Some(Panel::Settings);
        let mobile = width < 768.;
        let inspector = self.panel.is_some() && !settings && !self.is_viewing();
        let show_sidebar = self.sidebar && !mobile && !(inspector && width < 1280.);
        let mut main = div()
            .id("native-conversation-workspace")
            .relative()
            .h_full()
            .flex_1()
            .min_w_0()
            .min_h_0()
            .rounded(ui(16.))
            .bg(p.color("background"))
            .overflow_hidden();
        if self.is_viewing() && !settings {
            main = main.child(self.focus_view(window, cx));
        } else if inspector && mobile {
            use gpui_kit::base::FocusTrapElement;
            main = main.child(
                div()
                    .id("compact-context-sheet")
                    .role(Role::Dialog)
                    .aria_label("Conversation details")
                    .size_full()
                    .focus_trap("context-sheet-focus", &self.context_focus())
                    .child(self.panel(cx)),
            );
        } else {
            let weak = cx.entity().downgrade();
            let scroll = MessageScroller::new(
                "conversation-transcript",
                self.scroller.clone(),
                move |ix, window, cx| {
                    weak.update(cx, |this, cx| this.transcript_row(ix, window, cx))
                        .unwrap_or_else(|_| div().into_any_element())
                },
            )
            .absolute()
            .inset_0()
            .with_list_style(
                StyleRefinement::default()
                    .pt(ui(83.))
                    .pb(self.composer_height + window.rem_size() * 1.75),
            )
            .with_row_style(StyleRefinement::default().pb(ui(16.)))
            .with_jump_button_label("Ke pesan terbaru");
            main = main.child(scroll).child(
                div()
                    .absolute()
                    .top_0()
                    .left_0()
                    .right_0()
                    .bg(linear_gradient(
                        180.,
                        linear_color_stop(p.color("background"), 0.45),
                        linear_color_stop(p.color("background").opacity(0.), 1.),
                    ))
                    .child(self.header_view(!show_sidebar, cx)),
            );
            if !self.error.is_empty() {
                main = main.child(
                    div()
                        .absolute()
                        .top(ui(72.))
                        .left(ui(24.))
                        .right(ui(24.))
                        .p(ui(12.))
                        .rounded(ui(10.))
                        .bg(p.color("danger-soft"))
                        .text_color(p.color("destructive"))
                        .child(self.error.clone())
                        .child(
                            button(
                                "refresh-workspace",
                                "Coba hubungkan lagi",
                                ButtonKind::Ghost,
                                p,
                                cx,
                            )
                            .on_click(
                                cx.listener(|this, _, window, cx| this.reconnect(window, cx)),
                            ),
                        ),
                );
            }
            if self.history_before.is_some()
                && self.scroller.read(cx).logical_scroll_top().item_ix == 0
            {
                main = main.child(
                    div().absolute().top(ui(63.)).left(ui(20.)).child(
                        button(
                            "earlier-history",
                            "Pesan sebelumnya",
                            ButtonKind::Ghost,
                            p,
                            cx,
                        )
                        .text_size(ui(12.))
                        .on_click(cx.listener(|this, _, window, cx| this.earlier(window, cx))),
                    ),
                );
            }
            if self.projection.is_none() && self.error.is_empty() {
                main = main.child(
                    div()
                        .absolute()
                        .inset_0()
                        .flex()
                        .items_center()
                        .justify_center()
                        .text_color(p.color("muted-foreground"))
                        .child("Menghubungkan workspace…"),
                );
            }
            if self.opening["recovery"] == "retry" && self.opening["run"].is_object() {
                let thread = self.selected;
                let run = self.opening["run"]["id"].clone();
                main = main.child(
                    div()
                        .absolute()
                        .bottom(self.composer_height + ui(12.).to_pixels(window.rem_size()))
                        .left(ui(24.))
                        .child(
                            button(
                                "retry-opener",
                                "Coba respons awal lagi",
                                ButtonKind::Ghost,
                                p,
                                cx,
                            )
                            .on_click(cx.listener(
                                move |this, _, window, cx| {
                                    if let Some(thread) = thread {
                                        this.dispatch(
                                            format!("opening:{thread}"),
                                            crate::storage::Operation::command(
                                                format!("/v1/threads/{thread}/opening/retry"),
                                                serde_json::json!({"expected_run_id":run}),
                                                Some(thread),
                                            ),
                                            window,
                                            cx,
                                        );
                                    }
                                },
                            )),
                        ),
                );
            }
            let weak = cx.entity().downgrade();
            let composer = self.composer_view(cx);
            main = main.child(
                div().absolute().bottom_0().left_0().right_0().child(
                    div()
                        .relative()
                        .bg(linear_gradient(
                            0.,
                            linear_color_stop(p.color("background"), 0.45),
                            linear_color_stop(p.color("background").opacity(0.), 1.),
                        ))
                        .child(composer)
                        .child(
                            canvas(
                                move |bounds, _, cx| {
                                    let height = bounds.size.height;
                                    let weak = weak.clone();
                                    cx.defer(move |cx| {
                                        let _ = weak.update(cx, |this, cx| {
                                            if (this.composer_height - height).abs() > px(0.5) {
                                                this.composer_height = height;
                                                this.scroller
                                                    .update(cx, |state, cx| state.remeasure(cx));
                                                cx.notify();
                                            }
                                        });
                                    });
                                },
                                |_, _, _, _| {},
                            )
                            .absolute()
                            .inset_0()
                            .size_full(),
                        ),
                ),
            );
        }
        let mut root = div()
            .id("native-workspace-frame")
            .relative()
            .key_context("NativeWorkspace")
            .size_full()
            .flex()
            .items_stretch()
            .pr(ui(8.))
            .py(ui(8.))
            .font_family("Geist")
            .font_weight(FontWeight::NORMAL)
            .text_size(ui(14.))
            .line_height(ui(20.))
            .bg(p.color("frame"))
            .text_color(p.color("foreground"))
            .on_action(
                cx.listener(|this, _: &CreateAgent, window, cx| this.create_agent(window, cx)),
            )
            .on_action(
                cx.listener(|this, _: &CreateGroup, window, cx| this.open_group_dialog(window, cx)),
            )
            .on_action(
                cx.listener(|this, _: &OpenSettings, window, cx| this.open_settings(window, cx)),
            )
            .on_action(
                cx.listener(|this, _: &ToggleSidebar, window, cx| this.open_navigation(window, cx)),
            )
            .on_action(cx.listener(|this, _: &ToggleDetails, window, cx| {
                this.toggle_context(Panel::Detail, window, cx)
            }))
            .on_mouse_move(cx.listener(|this, event: &MouseMoveEvent, window, cx| {
                this.animator.update(cx, |animator, cx| {
                    animator.look_at(Some(event.position), window, cx)
                })
            }))
            .on_key_down(cx.listener(|this, event: &KeyDownEvent, window, cx| {
                if event.keystroke.key == "escape" && (this.panel.is_some() || this.is_viewing()) {
                    this.context_back(window, cx);
                    cx.stop_propagation();
                }
            }));
        if show_sidebar {
            root = root.child(self.sidebar_view(cx));
        }
        root = root.child(main);
        if inspector && !mobile {
            root = root.child(
                div()
                    .w(ui(320.))
                    .h_full()
                    .flex_shrink_0()
                    .child(self.panel(cx)),
            );
        }
        if settings {
            root = root.child(self.settings_overlay(cx));
        }
        root
    }
}
impl Workspace {
    pub(super) fn open_navigation(&mut self, window: &mut Window, cx: &mut Context<Self>) {
        let weak = cx.entity().downgrade();
        window.open_sheet_at(
            gpui_kit::component::Placement::Left,
            cx,
            move |sheet, _, cx| {
                sheet.size(ui(280.)).child(
                    weak.update(cx, |this, cx| this.sidebar_view(cx))
                        .unwrap_or_else(|_| div().into_any_element()),
                )
            },
        );
    }
    pub(super) fn reconnect(&mut self, window: &mut Window, cx: &mut Context<Self>) {
        if self.busy {
            return;
        }
        match crate::host::api_client(){
            Ok(Some((client,_)))=>match (ApiWorker::new(client.clone()),ApiWorker::new(client)){
                (Ok(reads),Ok(writes))=>{self.read_task=None;self.scope+=1;self.reads=Some(reads);self.writes=Some(writes);self.checked=false;self.bound=false;self.refresh(true,window,cx);},
                _=>self.error="The local connection could not start. Relaunch Ngertiin.".into(),
            },
            Ok(None)=>self.error="Backend lokal belum berjalan. Buka desktop Tauri atau jalankan backend Ngertiin, lalu coba lagi.".into(),
            Err(error)=>self.error=error.to_string(),
        }
        cx.notify();
    }
}
