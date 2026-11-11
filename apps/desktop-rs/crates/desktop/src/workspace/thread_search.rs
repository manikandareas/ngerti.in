//! Find in loaded, public message text. Inspired by Zed's ThreadSearchBar.
//! Rendered-text snapshots keep UTF-8 ranges and async Markdown parsing aligned.
use super::*;
use crate::ui::{
    theme::{Palette, ui},
    workspace::action,
};
use gpui_kit::base::TestSupportExt;
use gpui_kit::component::{
    ActiveTheme, Disableable, Side,
    input::{Input, InputEvent, InputState},
    menu::{DropdownMenu, PopupMenuItem},
    text::{RangeHighlight, RenderedText, TextViewState},
};
use gpui_kit::prelude::FluentBuilder as _;
use std::ops::Range;

const MATCH_LIMIT: usize = 2000;
pub(super) const HEIGHT: f32 = 56.;

#[derive(Clone)]
pub(super) struct Target {
    pub row: String,
    pub body: Entity<TextViewState>,
}
#[derive(Clone, Debug, PartialEq, Eq)]
struct Match {
    row: String,
    range: Range<usize>,
}
#[derive(Clone)]
pub(super) struct Reveal {
    pub row: String,
    pub body: Entity<TextViewState>,
    pub range: Range<usize>,
}
#[derive(Default, Clone, Copy, PartialEq, Eq)]
struct Options {
    case: bool,
    word: bool,
    regex: bool,
}

pub(super) struct ThreadSearch {
    query: Entity<InputState>,
    pub open: bool,
    options: Options,
    targets: Vec<Target>,
    snapshots: Vec<RenderedText>,
    matches: Vec<Match>,
    active: Option<usize>,
    error: Option<String>,
    limited: bool,
    previous_focus: Option<FocusHandle>,
    observations: Vec<Subscription>,
    _subscription: Subscription,
}
impl EventEmitter<Reveal> for ThreadSearch {}
impl ThreadSearch {
    pub(super) fn new(window: &mut Window, cx: &mut Context<Self>) -> Self {
        let query = cx.new(|cx| InputState::new(window, cx).placeholder("Search"));
        let subscription =
            cx.subscribe_in(&query, window, |this, _, event: &InputEvent, window, cx| {
                match event {
                    InputEvent::Change => this.refresh(true, cx),
                    InputEvent::PressEnter { shift, .. } => this.navigate(*shift, cx),
                    InputEvent::Focus | InputEvent::Blur => cx.notify(),
                }
                let _ = window;
            });
        Self {
            query,
            open: false,
            options: Options::default(),
            targets: vec![],
            snapshots: vec![],
            matches: vec![],
            active: None,
            error: None,
            limited: false,
            previous_focus: None,
            observations: vec![],
            _subscription: subscription,
        }
    }
    pub(super) fn show(&mut self, window: &mut Window, cx: &mut Context<Self>) {
        if !self.open {
            self.previous_focus = window.focused(cx);
        }
        self.open = true;
        self.snapshots.clear();
        self.refresh(true, cx);
        self.query.update(cx, |query, cx| query.focus(window, cx));
        cx.notify();
    }
    pub(super) fn close(&mut self, window: &mut Window, cx: &mut Context<Self>) {
        self.open = false;
        for target in &self.targets {
            target
                .body
                .update(cx, |body, cx| body.clear_range_highlights(cx));
        }
        if let Some(focus) = self.previous_focus.take() {
            focus.focus(window, cx);
        }
        cx.notify();
    }
    pub(super) fn sync(&mut self, targets: Vec<Target>, cx: &mut Context<Self>) {
        if self
            .targets
            .iter()
            .map(|t| (&t.row, t.body.entity_id()))
            .eq(targets.iter().map(|t| (&t.row, t.body.entity_id())))
        {
            return;
        }
        for target in &self.targets {
            target
                .body
                .update(cx, |body, cx| body.clear_range_highlights(cx));
        }
        self.observations = targets
            .iter()
            .map(|target| cx.observe(&target.body, |this, _, cx| this.refresh(false, cx)))
            .collect();
        self.targets = targets;
        self.snapshots.clear();
        self.refresh(false, cx);
    }
    fn refresh(&mut self, changed: bool, cx: &mut Context<Self>) {
        if !self.open {
            return;
        }
        let snapshots: Vec<_> = self
            .targets
            .iter()
            .map(|t| t.body.read(cx).rendered_text())
            .collect();
        if !changed && snapshots == self.snapshots {
            return;
        }
        let previous = self.active.and_then(|ix| self.matches.get(ix)).cloned();
        self.snapshots = snapshots;
        self.matches.clear();
        self.error = None;
        self.limited = false;
        let query = self.query.read(cx).value();
        if !query.is_empty() {
            match expression(&query, self.options) {
                Ok(regex) => {
                    'targets: for (target, snapshot) in self.targets.iter().zip(&self.snapshots) {
                        for found in regex.find_iter(snapshot.as_str()).filter(|m| !m.is_empty()) {
                            if self.matches.len() == MATCH_LIMIT {
                                self.limited = true;
                                break 'targets;
                            }
                            self.matches.push(Match {
                                row: target.row.clone(),
                                range: found.range(),
                            });
                        }
                    }
                }
                Err(_) => self.error = Some("Invalid or overly complex expression".into()),
            }
        }
        self.active = previous
            .and_then(|previous| self.matches.iter().position(|m| *m == previous))
            .or((!self.matches.is_empty()).then_some(0));
        self.highlight(cx);
        // Streaming updates preserve the current match without moving the reader.
        if changed {
            self.reveal(cx);
        }
        cx.notify();
    }
    fn highlight(&self, cx: &mut Context<Self>) {
        let p = Palette::new(cx.theme().mode.is_dark());
        for target in &self.targets {
            let highlights = self
                .matches
                .iter()
                .enumerate()
                .filter(|(_, m)| m.row == target.row)
                .map(|(ix, m)| {
                    RangeHighlight::new(
                        m.range.clone(),
                        if self.active == Some(ix) {
                            p.color("primary").opacity(0.28)
                        } else {
                            p.color("accent")
                        },
                    )
                })
                .collect::<Vec<_>>();
            target.body.update(cx, |body, cx| {
                let _ = body.set_range_highlights(highlights, cx);
            });
        }
    }
    fn reveal(&self, cx: &mut Context<Self>) {
        if let Some(found) = self.active.and_then(|ix| self.matches.get(ix))
            && let Some(target) = self.targets.iter().find(|t| t.row == found.row)
        {
            cx.emit(Reveal {
                row: found.row.clone(),
                body: target.body.clone(),
                range: found.range.clone(),
            });
        }
    }
    pub(super) fn is_active(&self, reveal: &Reveal) -> bool {
        self.open
            && self
                .active
                .and_then(|ix| self.matches.get(ix))
                .is_some_and(|found| found.row == reveal.row && found.range == reveal.range)
    }
    fn navigate(&mut self, previous: bool, cx: &mut Context<Self>) {
        if self.matches.is_empty() {
            return;
        }
        let current = self.active.unwrap_or(0);
        self.active = Some(if previous {
            (current + self.matches.len() - 1) % self.matches.len()
        } else {
            (current + 1) % self.matches.len()
        });
        self.highlight(cx);
        self.reveal(cx);
        cx.notify();
    }
}
fn expression(query: &str, options: Options) -> Result<regex::Regex, regex::Error> {
    let pattern = if options.regex {
        query.to_owned()
    } else {
        regex::escape(query)
    };
    let pattern = if options.word {
        format!(r"\b(?:{pattern})\b")
    } else {
        pattern
    };
    regex::RegexBuilder::new(&pattern)
        .case_insensitive(!options.case)
        .size_limit(1 << 20)
        .build()
}
impl Render for ThreadSearch {
    fn render(&mut self, window: &mut Window, cx: &mut Context<Self>) -> impl IntoElement {
        let p = Palette::new(cx.theme().mode.is_dark());
        let has_query = !self.query.read(cx).value().is_empty();
        let focused = self.query.read(cx).focus_handle(cx).is_focused(window);
        let count = self.error.clone().unwrap_or_else(|| {
            format!(
                "{} / {}{}",
                self.active.map_or(0, |ix| ix + 1),
                self.matches.len(),
                if self.limited { "+" } else { "" }
            )
        });
        let options = self.options;
        let owner = cx.entity().downgrade();
        let options_menu = action(
            "thread-find-options",
            "Search options",
            "Search01Icon",
            p,
            cx,
        )
        .tooltip("Search options · loaded messages only")
        .size(ui(28.))
        .rounded_full()
        .dropdown_menu(move |mut menu, _, _| {
            menu = menu
                .check_side(Side::Right)
                .label("Search loaded messages")
                .label("Up to 2,000 matches · Enter / Shift+Enter")
                .separator();
            for (ix, label, checked) in [
                (0, "Match case", options.case),
                (1, "Whole word", options.word),
                (2, "Regular expression", options.regex),
            ] {
                let owner = owner.clone();
                menu = menu.item(PopupMenuItem::new(label).checked(checked).on_click(
                    move |_, window, cx| {
                        let _ = owner.update(cx, |this, cx| {
                            match ix {
                                0 => this.options.case = !this.options.case,
                                1 => this.options.word = !this.options.word,
                                _ => this.options.regex = !this.options.regex,
                            }
                            this.refresh(true, cx);
                            this.query.update(cx, |query, cx| query.focus(window, cx));
                        });
                    },
                ));
            }
            menu
        });
        div()
            .id("thread-find")
            .test_support()
            .key_context("ThreadFind")
            .role(Role::Search)
            .w_full()
            .min_w_0()
            .block_mouse_except_scroll()
            .h(ui(HEIGHT))
            .px_4()
            .py_2()
            .flex()
            .items_center()
            .gap_2()
            .capture_key_down(cx.listener(|this, event: &KeyDownEvent, window, cx| {
                if event.keystroke.key == "escape" {
                    this.close(window, cx);
                    cx.stop_propagation();
                }
            }))
            .capture_action(cx.listener(
                |this, _: &gpui_kit::component::input::Escape, window, cx| {
                    this.close(window, cx);
                    cx.stop_propagation();
                },
            ))
            .child(
                div()
                    .id("thread-find-field")
                    .test_support()
                    .flex_1()
                    .min_w_0()
                    .h(ui(40.))
                    .pl(ui(4.))
                    .pr(ui(8.))
                    .rounded_full()
                    .border_2()
                    .border_color(if self.error.is_some() {
                        p.color("destructive")
                    } else if focused {
                        p.color("muted-foreground")
                    } else {
                        p.color("search-border")
                    })
                    .bg(p.color("search-surface"))
                    .flex()
                    .items_center()
                    .gap_1()
                    .child(options_menu)
                    .child(
                        div().flex_1().min_w_0().child(
                            Input::new(&self.query)
                                .id("thread-find-query")
                                .aria_label("Find in conversation")
                                .appearance(false)
                                .h(ui(36.))
                                .p_0()
                                .w_full(),
                        ),
                    )
                    .when(has_query, |view| {
                        view.child(
                            div()
                                .flex_shrink_0()
                                .flex()
                                .items_center()
                                .gap_1()
                                .child(
                                    div()
                                        .id("thread-find-count")
                                        .test_support()
                                        .role(Role::Status)
                                        .aria_label(count.clone())
                                        .text_size(ui(12.))
                                        .max_w(ui(96.))
                                        .truncate()
                                        .text_color(if self.error.is_some() {
                                            p.color("destructive")
                                        } else {
                                            p.color("muted-foreground")
                                        })
                                        .whitespace_nowrap()
                                        .child(if self.error.is_some() {
                                            "Invalid expression".into()
                                        } else {
                                            count
                                        }),
                                )
                                .child(
                                    action(
                                        "thread-find-previous",
                                        "Previous match",
                                        "ArrowUp01Icon",
                                        p,
                                        cx,
                                    )
                                    .tooltip("Previous match · Shift+Enter")
                                    .size(ui(26.))
                                    .rounded_full()
                                    .disabled(self.matches.is_empty())
                                    .on_click(
                                        cx.listener(|this, _, _, cx| this.navigate(true, cx)),
                                    ),
                                )
                                .child(
                                    action(
                                        "thread-find-next",
                                        "Next match",
                                        "ArrowDown01Icon",
                                        p,
                                        cx,
                                    )
                                    .tooltip("Next match · Enter")
                                    .size(ui(26.))
                                    .rounded_full()
                                    .disabled(self.matches.is_empty())
                                    .on_click(
                                        cx.listener(|this, _, _, cx| this.navigate(false, cx)),
                                    ),
                                ),
                        )
                    }),
            )
            .child(
                action("thread-find-close", "Close find", "Cancel01Icon", p, cx)
                    .size(ui(40.))
                    .flex_shrink_0()
                    .rounded_full()
                    .bg(p.color("search-surface"))
                    .border_1()
                    .border_color(p.color("search-border"))
                    .on_click(cx.listener(|this, _, window, cx| this.close(window, cx))),
            )
    }
}

impl Workspace {
    pub(super) fn toggle_thread_find(&mut self, window: &mut Window, cx: &mut Context<Self>) {
        if self.conversation.find.read(cx).open {
            self.conversation
                .find
                .update(cx, |find, cx| find.close(window, cx));
        } else {
            self.open_thread_find(window, cx);
        }
    }
    pub(super) fn open_thread_find(&mut self, window: &mut Window, cx: &mut Context<Self>) {
        if self.is_viewing() || self.panel == Some(Panel::Settings) {
            return;
        }
        self.conversation
            .find
            .update(cx, |find, cx| find.show(window, cx));
        self.conversation
            .scroller
            .update(cx, |scroll, cx| scroll.remeasure_items(0..1, cx));
        cx.notify();
    }
    pub(super) fn sync_thread_find(&mut self, cx: &mut Context<Self>) {
        let targets = self
            .conversation
            .transcript
            .iter()
            .filter_map(|row| match &row.kind {
                transcript::RowKind::Message { body, .. } => Some(Target {
                    row: row.id.clone(),
                    body: body.clone(),
                }),
                _ => None,
            })
            .collect();
        self.conversation
            .find
            .update(cx, |find, cx| find.sync(targets, cx));
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    #[::core::prelude::v1::test]
    fn unicode_offsets_literal_regex_and_word_boundaries() {
        let text = "😀 Café café cafeteria [x]";
        let literal = expression("café", Options::default()).unwrap();
        assert_eq!(
            literal
                .find_iter(text)
                .map(|m| &text[m.range()])
                .collect::<Vec<_>>(),
            ["Café", "café"]
        );
        assert_eq!(
            expression("[x]", Options::default())
                .unwrap()
                .find(text)
                .unwrap()
                .as_str(),
            "[x]"
        );
        assert_eq!(
            expression(
                "café",
                Options {
                    case: true,
                    word: true,
                    regex: false
                }
            )
            .unwrap()
            .find_iter(text)
            .count(),
            1
        );
        assert!(
            expression(
                "[",
                Options {
                    regex: true,
                    ..Options::default()
                }
            )
            .is_err()
        );
    }
}
