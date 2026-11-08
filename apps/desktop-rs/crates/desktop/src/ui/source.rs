use crate::{
    models::content::SourceDocument,
    ui::{controls::*, theme::Palette},
};
use gpui_kit::prelude::FluentBuilder;
use gpui_kit::{
    component::{
        ActiveTheme,
        input::{
            Editor, EditorState, FoldRange, HighlightStyleResolver, Input, InputEdit, InputEvent,
            InputHighlighter, InputState, Rope,
        },
    },
    *,
};
use std::{ops::Range, rc::Rc, sync::Arc};

struct PreparedHighlighter {
    language: SharedString,
    highlights: Arc<crate::models::syntax::Highlights>,
}
impl InputHighlighter for PreparedHighlighter {
    fn language(&self) -> SharedString {
        self.language.clone()
    }
    fn update(
        &mut self,
        _: Option<InputEdit>,
        _: &Rope,
        _: bool,
        _: &mut Window,
        _: &mut Context<EditorState>,
    ) {
    }
    fn fold_ranges(&self, _: &Rope) -> Vec<FoldRange> {
        vec![]
    }
    fn styles(
        &self,
        range: &Range<usize>,
        resolver: &dyn HighlightStyleResolver,
    ) -> Vec<(Range<usize>, HighlightStyle)> {
        let mut cursor = range.start;
        let mut result = vec![];
        for (span, name) in self.highlights.iter().skip(
            self.highlights
                .partition_point(|(r, _)| r.end <= range.start),
        ) {
            if span.start >= range.end {
                break;
            }
            let start = span.start.max(range.start);
            let end = span.end.min(range.end);
            if cursor < start {
                result.push((cursor..start, HighlightStyle::default()));
            }
            result.push((start..end, resolver.style(name).unwrap_or_default()));
            cursor = end;
        }
        if cursor < range.end {
            result.push((cursor..range.end, HighlightStyle::default()));
        }
        result
    }
}
pub struct SourceView {
    pub document: Arc<SourceDocument>,
    editor: Entity<EditorState>,
    find: Entity<InputState>,
    matches: Vec<std::ops::Range<usize>>,
    current: Option<usize>,
    wrap: bool,
    line_numbers: bool,
    _subscription: Subscription,
}
impl SourceView {
    pub fn new(document: Arc<SourceDocument>, window: &mut Window, cx: &mut Context<Self>) -> Self {
        let highlights = document.highlights.clone();
        let language = SharedString::from(document.language);
        let editor = cx.new(|cx| {
            let mut editor = EditorState::new(window, cx)
                .language(document.language)
                .soft_wrap(false)
                .line_number(true);
            editor.set_highlighter_factory(
                Rc::new(move |_| {
                    Some(Box::new(PreparedHighlighter {
                        language: language.clone(),
                        highlights: highlights.clone(),
                    }))
                }),
                cx,
            );
            editor.set_value(document.display.clone(), window, cx);
            editor
        });
        let find = cx.new(|cx| InputState::new(window, cx).placeholder("Find literal text…"));
        let subscription = cx.subscribe(&find, |this, input, event: &InputEvent, cx| {
            if matches!(event, InputEvent::Change) {
                this.matches = this.document.find(input.read(cx).value().as_str());
                this.current = None;
                cx.notify();
            }
        });
        Self {
            document,
            editor,
            find,
            matches: vec![],
            current: None,
            wrap: false,
            line_numbers: true,
            _subscription: subscription,
        }
    }
    fn reveal(&mut self, next: bool, window: &mut Window, cx: &mut Context<Self>) {
        if self.matches.is_empty() {
            return;
        }
        let current = match (self.current, next) {
            (None, true) => 0,
            (None, false) => self.matches.len() - 1,
            (Some(i), true) => (i + 1) % self.matches.len(),
            (Some(i), false) => (i + self.matches.len() - 1) % self.matches.len(),
        };
        self.current = Some(current);
        let range = self.matches[current].clone();
        self.editor.update(cx, |editor, cx| {
            editor.set_selected_range(range, cx);
            editor.focus(window, cx);
        });
        cx.notify();
    }
}
impl Render for SourceView {
    fn render(&mut self, _: &mut Window, cx: &mut Context<Self>) -> impl IntoElement {
        let p = Palette::new(cx.theme().mode.is_dark());
        div()
            .flex()
            .flex_col()
            .size_full()
            .gap_2()
            .child(
                row()
                    .child(
                        div()
                            .w(px(240.))
                            .child(Input::new(&self.find).aria_label("Find in source")),
                    )
                    .child(caption(format!("{} matches", self.matches.len()), p))
                    .child(
                        button("source-previous", "Previous", ButtonKind::Default, p, cx).on_click(
                            cx.listener(|this, _, window, cx| this.reveal(false, window, cx)),
                        ),
                    )
                    .child(
                        button("source-next", "Next", ButtonKind::Default, p, cx).on_click(
                            cx.listener(|this, _, window, cx| this.reveal(true, window, cx)),
                        ),
                    )
                    .child(
                        button("source-wrap", "Wrap", ButtonKind::Default, p, cx).on_click(
                            cx.listener(|this, _, window, cx| {
                                this.wrap = !this.wrap;
                                this.editor.update(cx, |editor, cx| {
                                    editor.set_soft_wrap(this.wrap, window, cx)
                                });
                            }),
                        ),
                    )
                    .child(
                        button("source-lines", "Line numbers", ButtonKind::Default, p, cx)
                            .on_click(cx.listener(|this, _, window, cx| {
                                this.line_numbers = !this.line_numbers;
                                this.editor.update(cx, |editor, cx| {
                                    editor.set_line_number(this.line_numbers, window, cx)
                                });
                            })),
                    )
                    .child(
                        button(
                            "source-copy",
                            if self.document.truncated {
                                "Copy preview"
                            } else {
                                "Copy original"
                            },
                            ButtonKind::Default,
                            p,
                            cx,
                        )
                        .on_click(cx.listener(|this, _, _, cx| {
                            cx.write_to_clipboard(ClipboardItem::new_string(
                                this.document.original.clone(),
                            ))
                        })),
                    ),
            )
            .child(caption(
                format!(
                    "{} lines · {} · {}",
                    self.document.lines,
                    self.document.language,
                    if self.document.highlighted {
                        "Syntax colors"
                    } else {
                        "Plain source: highlighting limit reached"
                    }
                ),
                p,
            ))
            .when(self.document.truncated, |view| {
                view.child(caption(
                    "Preview limited to 128 KB. Download the original file to read all content.",
                    p,
                ))
            })
            .child(
                div().flex_1().min_h_0().child(
                    Editor::new(&self.editor)
                        .readonly(true)
                        .aria_label("Read-only source document")
                        .size_full(),
                ),
            )
    }
}
