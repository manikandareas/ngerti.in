use crate::{
    features::ProbeAssets,
    platform::{embedded, pdf::NativePdf},
    ui::{
        controls::*,
        theme::{self, Palette},
    },
};
use gpui_kit::component::tab::{Tab, TabBar};
use gpui_kit::prelude::FluentBuilder as _;
use gpui_kit::{
    component::{
        WindowExt,
        input::{EditorState, InputState, TextareaState},
        slider::SliderState,
    },
    *,
};
use gpui_webview::WebView;

actions!(desktop_rs, [Quit, ToggleTheme]);

#[derive(Clone, Copy, PartialEq, Eq)]
pub(crate) enum Scene {
    Controls,
    Composer,
    EditorProbe,
    Messages,
    Content,
    Avatar,
    Material,
    Source,
    Pdf,
    Html,
    Snapshot,
}
impl Scene {
    pub const ALL: [(Scene, &'static str); 11] = [
        (Self::Controls, "Controls"),
        (Self::Composer, "Composer"),
        (Self::Messages, "Messages"),
        (Self::Content, "Content"),
        (Self::EditorProbe, "Editor probe"),
        (Self::Avatar, "Avatar"),
        (Self::Material, "Material probe"),
        (Self::Source, "Source and table"),
        (Self::Pdf, "Native PDF"),
        (Self::Html, "Static HTML"),
        (Self::Snapshot, "Read-only snapshot"),
    ];
}

pub struct Gallery {
    pub(crate) dark: bool,
    animator: Entity<crate::ui::avatar_view::AvatarAnimator>,
    pub(crate) scene: Scene,
    pub(crate) assets: ProbeAssets,
    pub(crate) checked: bool,
    pub(crate) enabled: bool,
    pub(crate) radio: Option<usize>,
    pub(crate) input: Entity<InputState>,
    pub(crate) disabled_input: Entity<InputState>,
    scene_focus: Vec<FocusHandle>,
    pub(crate) composer: Entity<TextareaState>,
    composer_component: Entity<crate::features::composer::ComposerLab>,
    messages_component: Entity<crate::features::messages::MessageGallery>,
    pub(crate) content_component: Option<Entity<crate::features::content::ContentGallery>>,
    pub(crate) measurement: Option<crate::features::measurement::ContentMeasurement>,
    pub(crate) measurement_task: Option<Task<()>>,
    pub(crate) editor: Entity<EditorState>,
    pub(crate) slider: Entity<SliderState>,
    pub(crate) saved: Option<gpui_kit::component::input::InputContent>,
    pub(crate) html: Option<Entity<WebView>>,
    pub(crate) pdf: Option<Entity<NativePdf>>,
    pub(crate) rotated: bool,
    pub(crate) avatar_component: Entity<crate::features::avatar::AvatarGallery>,
    pub(crate) status: String,
    pub(crate) snapshot: Result<Option<ngertiin_client::Snapshot>, String>,
    snapshot_task: Option<Task<()>>,
    snapshot_worker: Option<ngertiin_client::SnapshotWorker>,
}
impl Gallery {
    pub fn new(assets: ProbeAssets, window: &mut Window, cx: &mut Context<Self>) -> Self {
        let view = cx.entity().downgrade();
        App::on_action(cx, move |_: &ToggleTheme, cx| {
            let _ = view.update(cx, |view, cx| {
                view.dark = !view.dark;
                theme::apply(view.dark, None, cx);
                cx.notify();
            });
        });
        let input = cx.new(|cx| InputState::new(window, cx).placeholder("Search agents"));
        let disabled_input =
            cx.new(|cx| InputState::new(window, cx).default_value("Unavailable field"));
        let composer = cx.new(|cx| {
            TextareaState::new(window, cx)
                .placeholder("Message Tobi…")
                .auto_grow(2, 7)
        });
        let editor = cx.new(|cx| {
            EditorState::new(window, cx)
                .language("rust")
                .default_value(include_str!("../platform/embedded.rs"))
        });
        let slider = cx.new(|_| SliderState::new().min(0.).max(100.).default_value(45.));
        let animator = cx.new(|cx| crate::ui::avatar_view::AvatarAnimator::new(window, cx));
        let mut this = Self {
            animator: animator.clone(),
            dark: false,
            scene: Scene::Controls,
            assets,
            checked: true,
            enabled: false,
            radio: Some(0),
            input,
            disabled_input,
            scene_focus: Scene::ALL.iter().map(|_| cx.focus_handle()).collect(),
            composer,
            composer_component: cx
                .new(|cx| crate::features::composer::ComposerLab::new(window, cx)),
            messages_component: cx
                .new(|cx| crate::features::messages::MessageGallery::new(animator.clone(), cx)),
            content_component: None,
            measurement: None,
            measurement_task: None,
            editor,
            slider,
            saved: None,
            html: None,
            pdf: None,
            rotated: false,
            avatar_component: cx.new(|_| crate::features::avatar::AvatarGallery::new(animator)),
            status: crate::storage::description().into(),
            snapshot: Ok(None),
            snapshot_task: None,
            snapshot_worker: ngertiin_client::SnapshotWorker::new().ok(),
        };
        this.load_snapshot(cx);
        this
    }
    pub(crate) fn load_snapshot(&mut self, cx: &mut Context<Self>) {
        self.snapshot_task = None;
        match crate::host::snapshot_client() {
            Ok(Some((client, thread))) => {
                self.snapshot = Err("Loading read-only snapshot…".into());
                let result = self
                    .snapshot_worker
                    .as_ref()
                    .ok_or(ngertiin_client::ClientError::Unavailable)
                    .and_then(|worker| worker.read(client, thread));
                let result = match result {
                    Ok(result) => result,
                    Err(error) => {
                        self.snapshot = Err(error.to_string());
                        cx.notify();
                        return;
                    }
                };
                self.snapshot_task = Some(cx.spawn(async move |view, cx| {
                    let result = result
                        .await
                        .unwrap_or(Err(ngertiin_client::ClientError::Unavailable));
                    let _ = view.update(cx, |view, cx| {
                        view.snapshot = result.map(Some).map_err(|e| e.to_string());
                        cx.notify();
                    });
                }));
            }
            Ok(None) => self.snapshot = Ok(None),
            Err(error) => self.snapshot = Err(error.to_string()),
        }
        cx.notify();
    }
    pub(crate) fn switch(&mut self, scene: Scene, window: &mut Window, cx: &mut Context<Self>) {
        if self.measurement.is_some() {
            self.status =
                "Content measurement in progress. Wait for the visible sample to finish.".into();
            cx.notify();
            return;
        }
        if self.scene == Scene::Avatar && self.avatar_component.read(cx).is_benchmarking() {
            self.status =
                "Benchmark in progress. Use Stop benchmark matrix before changing scenes.".into();
            cx.notify();
            return;
        }
        if self.scene == Scene::Messages {
            self.messages_component
                .update(cx, |messages, cx| messages.retire(window, cx));
        }
        if self.scene == Scene::Avatar {
            self.avatar_component
                .update(cx, |avatar, cx| avatar.retire(window, cx));
        }
        if let Some(html) = self.html.take() {
            html.update(cx, |view, _| view.hide());
        }
        if let Some(pdf) = self.pdf.take() {
            pdf.update(cx, |pdf, cx| pdf.hide(window, cx));
        }
        self.scene = scene;
        match scene {
            Scene::Avatar => self
                .avatar_component
                .update(cx, |avatar, cx| avatar.refresh(cx)),
            Scene::Html => match embedded::static_document(self.assets.html.clone(), window, cx) {
                Ok(view) => self.html = Some(cx.new(|_| view)),
                Err(_) => {
                    self.status =
                        "Static HTML renderer unavailable. Select another scene and retry.".into()
                }
            },
            Scene::Content => {
                if self.content_component.is_none() {
                    let image = self.assets.avatar[0].clone();
                    self.content_component = Some(cx.new(|cx| {
                        crate::features::content::ContentGallery::new(image, window, cx)
                    }));
                }
            }
            Scene::Pdf => {
                let path = self.assets.pdf.clone();
                self.pdf = Some(cx.new(|cx| NativePdf::new(&path, window, cx)));
            }
            _ => {}
        }
        cx.notify();
    }
    pub(crate) fn overlay(window: &mut Window, cx: &mut App) {
        window.open_dialog(cx, |dialog, _, _| {
            dialog
                .title(accessible_text(
                    "native-dialog-title",
                    "Native focus proof",
                    Role::Heading,
                ))
                .child(accessible_text(
                    "native-dialog-description",
                    "This dialog must cover the child content and return focus after Escape.",
                    Role::Paragraph,
                ))
        });
    }
}
impl Render for Gallery {
    fn render(&mut self, window: &mut Window, cx: &mut Context<Self>) -> impl IntoElement {
        let p = Palette::new(self.dark);
        let content = match self.scene {
            Scene::Controls => self.controls(p, cx),
            Scene::Composer => self.composer_component.clone().into_any_element(),
            Scene::EditorProbe => self.composer_probe(p, cx),
            Scene::Messages => self.messages_component.clone().into_any_element(),
            Scene::Content => self
                .content_component
                .clone()
                .expect("Initialized content")
                .into_any_element(),
            Scene::Avatar => self.avatar_component.clone().into_any_element(),
            Scene::Material => self.avatar_probe(p, cx),
            Scene::Source => self.source_probe(p, cx),
            Scene::Pdf => self.pdf_probe(p, cx),
            Scene::Html => self.html_probe(p, cx),
            Scene::Snapshot => self.snapshot_view(p, cx),
        };
        let _ = window;
        div()
            .id("native-gallery")
            .on_mouse_move(cx.listener(|this, event: &MouseMoveEvent, window, cx| {
                this.animator
                    .update(cx, |a, cx| a.look_at(Some(event.position), window, cx))
            }))
            .on_hover(cx.listener(|this, hovered: &bool, window, cx| {
                if !hovered {
                    this.animator
                        .update(cx, |a, cx| a.look_at(None, window, cx));
                }
            }))
            .flex()
            .flex_col()
            .size_full()
            .bg(p.color("background"))
            .text_color(p.color("foreground"))
            .text_size(px(14.))
            .line_height(px(20.))
            .child(
                div()
                    .flex()
                    .items_center()
                    .justify_between()
                    .px_6()
                    .py_4()
                    .child(
                        div()
                            .child(title("Ngertiin · Native foundation"))
                            .child(caption(
                                "NMA-066 · Component gallery and renderer proofs",
                                p,
                            )),
                    )
                    .child(
                        button(
                            "toggle-theme",
                            if self.dark { "Light" } else { "Dark" },
                            ButtonKind::Default,
                            p,
                            cx,
                        )
                        .child(icon(if self.dark { "sun" } else { "moon" }, p))
                        .on_click(cx.listener(|this, _, window, cx| {
                            this.dark = !this.dark;
                            theme::apply(this.dark, Some(window), cx);
                            cx.notify();
                        })),
                    ),
            )
            .child(
                TabBar::new("gallery-tabs")
                    .px_6()
                    .selected_index(
                        Scene::ALL
                            .iter()
                            .position(|(scene, _)| *scene == self.scene)
                            .unwrap_or(0),
                    )
                    .children(
                        Scene::ALL
                            .iter()
                            .enumerate()
                            .map(|(index, (scene, label))| {
                                Tab::new()
                                    .label(*label)
                                    .track_focus(
                                        &self.scene_focus[index]
                                            .clone()
                                            .tab_stop(*scene == self.scene),
                                    )
                                    .focus_visible(|style| {
                                        style.border_color(p.color("ring")).border_2()
                                    })
                                    .on_key_down(cx.listener(
                                        move |this, event: &KeyDownEvent, window, cx| {
                                            let Some(next) = crate::ui::tabs::navigation_target(
                                                index,
                                                Scene::ALL.len(),
                                                event.keystroke.key.as_str(),
                                            ) else {
                                                return;
                                            };
                                            window.prevent_default();
                                            cx.stop_propagation();
                                            this.switch(Scene::ALL[next].0, window, cx);
                                            this.scene_focus[next].focus(window, cx);
                                        },
                                    ))
                            }),
                    )
                    .on_click(cx.listener(|this, index: &usize, window, cx| {
                        this.switch(Scene::ALL[*index].0, window, cx)
                    })),
            )
            .child(div().flex_1().min_h_0().p_6().child(content))
            .when(matches!(self.scene, Scene::Content | Scene::Pdf), |view| {
                view.child(
                    button(
                        "measure-content",
                        "Measure content · 120 visible seconds",
                        ButtonKind::Default,
                        p,
                        cx,
                    )
                    .disabled_state(self.measurement.is_some(), p)
                    .on_click(cx.listener(|this, _, window, cx| this.measure_content(window, cx))),
                )
            })
            .child(caption(self.status.clone(), p).px_6().py_3())
    }
}
