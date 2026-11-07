use crate::{
    features::ProbeAssets,
    platform::{embedded, pdf::NativePdf},
    ui::{
        controls::*,
        theme::{self, Palette},
    },
};
use gpui_kit::component::tab::{Tab, TabBar};
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
    Avatar,
    Source,
    Pdf,
    Html,
    Snapshot,
}
impl Scene {
    pub const ALL: [(Scene, &'static str); 7] = [
        (Self::Controls, "Controls"),
        (Self::Composer, "Composer"),
        (Self::Avatar, "Avatar"),
        (Self::Source, "Source and table"),
        (Self::Pdf, "Native PDF"),
        (Self::Html, "Static HTML"),
        (Self::Snapshot, "Read-only snapshot"),
    ];
}

pub struct Gallery {
    pub(crate) dark: bool,
    pub(crate) scene: Scene,
    pub(crate) assets: ProbeAssets,
    pub(crate) checked: bool,
    pub(crate) enabled: bool,
    pub(crate) radio: Option<usize>,
    pub(crate) input: Entity<InputState>,
    pub(crate) composer: Entity<TextareaState>,
    pub(crate) editor: Entity<EditorState>,
    pub(crate) slider: Entity<SliderState>,
    pub(crate) saved: Option<gpui_kit::component::input::InputContent>,
    pub(crate) html: Option<Entity<WebView>>,
    pub(crate) pdf: Option<Entity<NativePdf>>,
    pub(crate) rotated: bool,
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
        let mut this = Self {
            dark: false,
            scene: Scene::Controls,
            assets,
            checked: true,
            enabled: false,
            radio: Some(0),
            input,
            composer,
            editor,
            slider,
            saved: None,
            html: None,
            pdf: None,
            rotated: false,
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
        if let Some(html) = self.html.take() {
            html.update(cx, |view, _| view.hide());
        }
        if let Some(pdf) = self.pdf.take() {
            pdf.read(cx).hide();
        }
        self.scene = scene;
        match scene {
            Scene::Html => match embedded::html_probe(window, cx) {
                Ok(view) => self.html = Some(cx.new(|_| view)),
                Err(_) => {
                    self.status =
                        "Static HTML renderer unavailable. Select another scene and retry.".into()
                }
            },
            Scene::Pdf => {
                let path = self.assets.pdf.clone();
                match NativePdf::new(&path, window, cx) {
                    Ok(value) => self.pdf = Some(cx.new(|_| value)),
                    Err(error) => self.status = error.to_string(),
                }
            }
            _ => {}
        }
        cx.notify();
    }
    pub(crate) fn overlay(window: &mut Window, cx: &mut App) {
        window.open_dialog(cx, |dialog, _, _| {
            dialog
                .title("Native focus proof")
                .child("This dialog must cover the child content and return focus after Escape.")
        });
    }
}
impl Render for Gallery {
    fn render(&mut self, window: &mut Window, cx: &mut Context<Self>) -> impl IntoElement {
        let p = Palette::new(self.dark);
        let content = match self.scene {
            Scene::Controls => self.controls(p, cx),
            Scene::Composer => self.composer_probe(p, cx),
            Scene::Avatar => self.avatar_probe(p, cx),
            Scene::Source => self.source_probe(p, cx),
            Scene::Pdf => self.pdf_probe(p, cx),
            Scene::Html => self.html_probe(p, cx),
            Scene::Snapshot => self.snapshot_view(p, cx),
        };
        let _ = window;
        div()
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
                    .children(Scene::ALL.map(|(_, label)| Tab::new().label(label)))
                    .on_click(cx.listener(|this, index: &usize, window, cx| {
                        this.switch(Scene::ALL[*index].0, window, cx)
                    })),
            )
            .child(div().flex_1().min_h_0().p_6().child(content))
            .child(caption(self.status.clone(), p).px_6().py_3())
    }
}
