use crate::{
    models::composer::*,
    ui::{
        composer::{Composer, ComposerEvent},
        controls::*,
        theme::Palette,
    },
};
use gpui_kit::*;

pub struct ComposerLab {
    pub composer: Entity<Composer>,
    saved: Option<Snapshot>,
    status: String,
    submissions: usize,
    composing: bool,
    _subscriptions: Vec<Subscription>,
}
fn references() -> Vec<Reference> {
    vec![
        Reference {
            kind: ReferenceKind::Agent,
            id: "tobi".into(),
            label: "@Tobi".into(),
            source: None,
            agent_id: None,
            version: None,
        },
        Reference {
            kind: ReferenceKind::User,
            id: "owner".into(),
            label: "@user".into(),
            source: None,
            agent_id: None,
            version: None,
        },
        Reference {
            kind: ReferenceKind::File,
            id: "fixture-source".into(),
            label: "source.ts".into(),
            source: None,
            agent_id: None,
            version: None,
        },
        Reference {
            kind: ReferenceKind::Skill,
            id: "research".into(),
            label: "/research".into(),
            source: Some("application".into()),
            agent_id: Some("tobi".into()),
            version: Some(2),
        },
    ]
}
impl ComposerLab {
    pub fn new(window: &mut Window, cx: &mut Context<Self>) -> Self {
        let composer = cx.new(|cx| Composer::new(references(), window, cx));
        let subscription = cx.subscribe(&composer, |this, _, event: &ComposerEvent, cx| {
            this.status = match event {
                ComposerEvent::Submit(draft) => {
                    this.submissions += 1;
                    format!(
                        "Submit intent: {} bytes / {} references. No network request.",
                        draft.text.len(),
                        draft.tokens.len()
                    )
                }
                ComposerEvent::Files(files) => format!(
                    "{} clipboard/drop file entries retained as an attachment intent.",
                    files.len()
                ),
            };
            cx.notify();
        });
        let input = composer.read(cx).input.clone();
        let observation = cx.observe(&input, |_, _, cx| cx.notify());
        Self {
            composer,
            saved: None,
            status: "Editing is local. Enter emits an intent; Shift+Enter inserts a line.".into(),
            submissions: 0,
            composing: false,
            _subscriptions: vec![subscription, observation],
        }
    }
    pub fn view(&self, p: Palette, cx: &mut Context<Self>) -> AnyElement {
        let view = card(p)
            .size_full()
            .child(title("Composer"))
            .child(caption(
                "Type @ or / for references. Check IME, emoji, selection, clipboard and undo/redo.",
                p,
            ))
            .child(self.composer.clone())
            .child(
                row().children(
                    references()
                        .into_iter()
                        .enumerate()
                        .filter(|(i, _)| *i != 1)
                        .map(|(i, reference)| {
                            button(
                                match i {
                                    0 => "insert-agent",
                                    2 => "insert-file",
                                    _ => "insert-skill",
                                },
                                format!("Insert {}", reference.label),
                                ButtonKind::Default,
                                p,
                                cx,
                            )
                            .on_click(cx.listener(
                                move |this, _, window, cx| {
                                    this.composer.update(cx, |editor, cx| {
                                        editor.insert_reference(reference.clone(), window, cx)
                                    })
                                },
                            ))
                        }),
                ),
            )
            .child(
                row()
                    .child(
                        button("save-composer", "Save draft", ButtonKind::Default, p, cx).on_click(
                            cx.listener(|this, _, _, cx| {
                                this.saved = Some(this.composer.read(cx).snapshot(cx));
                                this.status =
                                    "Draft saved with token metadata and selection.".into();
                                cx.notify();
                            }),
                        ),
                    )
                    .child(
                        button(
                            "restore-composer",
                            "Restore draft",
                            ButtonKind::Default,
                            p,
                            cx,
                        )
                        .on_click(cx.listener(|this, _, window, cx| {
                            if let Some(s) = this.saved.clone() {
                                this.composer
                                    .update(cx, |editor, cx| editor.restore(s, window, cx));
                            }
                        })),
                    )
                    .child(
                        button("inspect-draft", "Inspect draft", ButtonKind::Default, p, cx)
                            .on_click(cx.listener(|this, _, _, cx| {
                                let s = this.composer.read(cx).snapshot(cx);
                                this.status = format!(
                                    "{} bytes · {} reference(s) · selection {:?}",
                                    s.draft.text.len(),
                                    s.draft.tokens.len(),
                                    s.selection
                                );
                                cx.notify();
                            })),
                    ),
            )
            .child(caption(self.status.clone(), p))
            .child(
                caption(
                    format!(
                        "Native IME composition: {} · {} submission intents",
                        if self.composing { "active" } else { "inactive" },
                        self.submissions
                    ),
                    p,
                )
                .id("composer-editing-status")
                .role(Role::Status)
                .aria_label(format!(
                    "Native IME composition {}; {} submission intents",
                    if self.composing { "active" } else { "inactive" },
                    self.submissions
                )),
            );
        #[cfg(all(debug_assertions, target_os = "macos"))]
        let view = view.child(
            button(
                "composer-input-source",
                "Next native input source",
                ButtonKind::Default,
                p,
                cx,
            )
            .on_click(cx.listener(|this, _, window, cx| {
                this.composer.update(cx, |composer, cx| {
                    composer
                        .input
                        .update(cx, |input, cx| input.focus(window, cx));
                });
                this.status =
                    crate::platform::input_source::next_enabled().unwrap_or_else(|error| error);
                cx.notify();
            })),
        );
        view.into_any_element()
    }
}
impl Render for ComposerLab {
    fn render(&mut self, window: &mut Window, cx: &mut Context<Self>) -> impl IntoElement {
        use gpui_kit::component::ActiveTheme;
        let input = self.composer.read(cx).input.clone();
        self.composing = input.update(cx, |input, cx| {
            input.marked_text_range(window, cx).is_some()
        });
        self.view(Palette::new(cx.theme().mode.is_dark()), cx)
    }
}
