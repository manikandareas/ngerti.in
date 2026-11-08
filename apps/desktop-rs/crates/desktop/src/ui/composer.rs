//! Native editing and reference metadata. Submission is a typed event, not a network call.
use crate::{
    models::composer::*,
    ui::{controls::*, theme::Palette},
};
use gpui_kit::prelude::FluentBuilder;
use gpui_kit::{
    component::{
        ActiveTheme, Sizable,
        input::{
            Copy, Cut, Enter, InlineToken, InputContent, InputEvent, Paste, Redo, Textarea,
            TextareaState, Undo,
        },
    },
    *,
};
use std::collections::{BTreeMap, BTreeSet};

#[derive(Clone)]
pub enum ComposerEvent {
    Submit(Draft),
    Files(Vec<ClipboardEntry>),
    Changed(Draft),
}
pub struct Composer {
    pub input: Entity<TextareaState>,
    references: BTreeMap<String, Reference>,
    catalog: BTreeSet<String>,
    history: History,
    subscriptions: Vec<Subscription>,
    selection: usize,
    error: Option<String>,
    dismissed: bool,
    embedded: bool,
    readonly: bool,
}
impl EventEmitter<ComposerEvent> for Composer {}
impl Composer {
    pub fn new(references: Vec<Reference>, window: &mut Window, cx: &mut Context<Self>) -> Self {
        let input = cx.new(|cx| {
            TextareaState::new(window, cx)
                .placeholder("Message…")
                .auto_grow(1, 7)
                .submit_on_enter(true)
        });
        let subscription =
            cx.subscribe(&input, |this, input, event: &InputEvent, cx| match event {
                InputEvent::Change => {
                    let snapshot = this.snapshot(cx);
                    let retained = snapshot
                        .draft
                        .tokens
                        .iter()
                        .map(|token| token.reference.url())
                        .collect::<BTreeSet<_>>();
                    this.references
                        .retain(|url, _| this.catalog.contains(url) || retained.contains(url));
                    this.history.record(snapshot);
                    this.error = None;
                    this.selection = 0;
                    this.dismissed = false;
                    cx.emit(ComposerEvent::Changed(this.snapshot(cx).draft));
                    cx.notify();
                }
                InputEvent::PressEnter { shift: false, .. } if !this.readonly => {
                    cx.emit(ComposerEvent::Submit(this.snapshot(cx).draft))
                }
                _ => {
                    let _ = input;
                }
            });
        Self {
            input,
            catalog: references.iter().map(Reference::url).collect(),
            references: references.into_iter().map(|r| (r.url(), r)).collect(),
            history: History::new(),
            subscriptions: vec![subscription],
            selection: 0,
            error: None,
            dismissed: false,
            embedded: false,
            readonly: false,
        }
    }
    pub fn readonly(&mut self, readonly: bool, cx: &mut Context<Self>) {
        if self.readonly != readonly {
            self.readonly = readonly;
            cx.notify();
        }
    }
    pub fn embedded(&mut self, placeholder: String, window: &mut Window, cx: &mut Context<Self>) {
        self.embedded = true;
        self.input.update(cx, |input, cx| {
            input.set_placeholder(placeholder, window, cx)
        });
        cx.notify();
    }
    pub fn snapshot(&self, cx: &App) -> Snapshot {
        let input = self.input.read(cx);
        let content = input.content();
        let tokens = content
            .tokens()
            .iter()
            .filter_map(|span| {
                self.references
                    .get(span.token().id().as_str())
                    .map(|reference| Token {
                        range: span.range(),
                        reference: {
                            let mut reference = reference.clone();
                            reference.label = span.token().label().to_string();
                            reference
                        },
                    })
            })
            .collect();
        Snapshot {
            draft: Draft {
                text: content.text().to_string(),
                tokens,
            },
            selection: input.selected_range(),
            reversed: input.is_selection_reversed(),
        }
    }
    pub fn set_catalog(&mut self, references: Vec<Reference>, cx: &mut Context<Self>) {
        self.catalog = references.iter().map(Reference::url).collect();
        let retained: BTreeSet<_> = self
            .snapshot(cx)
            .draft
            .tokens
            .iter()
            .map(|t| t.reference.url())
            .collect();
        self.references.retain(|url, _| retained.contains(url));
        for reference in references {
            self.references.insert(reference.url(), reference);
        }
        cx.notify();
    }
    fn composing(&self, window: &mut Window, cx: &mut App) -> bool {
        self.input.update(cx, |input, cx| {
            input.marked_text_range(window, cx).is_some()
        })
    }
    fn install(
        &mut self,
        snapshot: Snapshot,
        window: &mut Window,
        cx: &mut Context<Self>,
    ) -> Result<(), String> {
        snapshot.draft.validate().map_err(str::to_string)?;
        self.error = None;
        let mut content = InputContent::new(snapshot.draft.text.clone());
        for token in &snapshot.draft.tokens {
            self.references
                .insert(token.reference.url(), token.reference.clone());
            content = content
                .with_token(
                    token.range.clone(),
                    InlineToken::new(token.reference.url(), token.reference.wire())
                        .with_label(token.reference.label.clone()),
                )
                .map_err(|e| e.to_string())?;
        }
        self.input.update(cx, |input, cx| {
            input.set_value(content, window, cx);
            input.set_selected_range_with_direction(
                snapshot.selection.clone(),
                snapshot.reversed,
                cx,
            );
            input.focus(window, cx);
        });
        cx.emit(ComposerEvent::Changed(snapshot.draft));
        cx.notify();
        Ok(())
    }
    pub fn restore(&mut self, snapshot: Snapshot, window: &mut Window, cx: &mut Context<Self>) {
        if self.composing(window, cx) {
            self.error = Some("Finish composing text before restoring the draft.".into());
            return;
        }
        if let Err(e) = self.install(snapshot.clone(), window, cx) {
            self.error = Some(e);
        } else {
            self.history.record(snapshot);
        }
    }
    fn replace(
        &mut self,
        range: std::ops::Range<usize>,
        insert: Draft,
        window: &mut Window,
        cx: &mut Context<Self>,
    ) {
        if self.readonly {
            return;
        }
        let current = self.snapshot(cx);
        self.history
            .selection(current.selection.clone(), current.reversed);
        match current.draft.replace(range, &insert) {
            Ok((draft, selection)) => {
                let snapshot = Snapshot {
                    draft,
                    selection,
                    reversed: false,
                };
                self.restore(snapshot, window, cx);
            }
            Err(e) => self.error = Some(e.into()),
        }
    }
    pub fn insert_reference(
        &mut self,
        reference: Reference,
        window: &mut Window,
        cx: &mut Context<Self>,
    ) {
        if self.composing(window, cx) {
            self.error = Some("Finish composing text before inserting a reference.".into());
            cx.notify();
            return;
        }
        match Draft::reference(reference) {
            Ok(insert) => self.replace(self.input.read(cx).selected_range(), insert, window, cx),
            Err(e) => self.error = Some(e.into()),
        }
    }
    fn copy(&mut self, cut: bool, window: &mut Window, cx: &mut Context<Self>) -> bool {
        if cut && self.readonly {
            return true;
        }
        if self.composing(window, cx) {
            return false;
        }
        let snapshot = self.snapshot(cx);
        if snapshot.selection.is_empty() {
            return false;
        }
        let copied = snapshot.draft.slice(snapshot.selection.clone());
        cx.write_to_clipboard(ClipboardItem::new_string_with_json_metadata(
            copied.plain(),
            ClipboardDraft {
                ngertiin_composer: 1,
                draft: copied,
            },
        ));
        if cut {
            self.replace(snapshot.selection, Draft::default(), window, cx);
        }
        true
    }
    fn paste(&mut self, window: &mut Window, cx: &mut Context<Self>) -> bool {
        if self.readonly {
            return true;
        }
        if self.composing(window, cx) {
            return false;
        }
        let Some(item) = cx.read_from_clipboard() else {
            return false;
        };
        let files: Vec<_> = item
            .entries()
            .iter()
            .filter(|e| {
                matches!(
                    e,
                    ClipboardEntry::Image(_) | ClipboardEntry::ExternalPaths(_)
                )
            })
            .cloned()
            .collect();
        if !files.is_empty() {
            cx.emit(ComposerEvent::Files(files));
            return true;
        }
        let draft = item
            .metadata()
            .and_then(|s| ClipboardDraft::decode(s))
            .unwrap_or_else(|| Draft {
                text: item.text().unwrap_or_default(),
                tokens: vec![],
            });
        self.replace(self.input.read(cx).selected_range(), draft, window, cx);
        true
    }
    fn travel(&mut self, redo: bool, window: &mut Window, cx: &mut Context<Self>) -> bool {
        if self.readonly {
            return true;
        }
        if self.composing(window, cx) {
            return false;
        }
        let s = self.snapshot(cx);
        self.history.selection(s.selection, s.reversed);
        if let Some(s) = if redo {
            self.history.redo()
        } else {
            self.history.undo()
        } && let Err(e) = self.install(s, window, cx)
        {
            self.error = Some(e);
        }
        true
    }
    fn suggestions(&self, cx: &App) -> Option<(std::ops::Range<usize>, Vec<Reference>)> {
        if self.dismissed || self.readonly {
            return None;
        }
        let input = self.input.read(cx);
        let range = input.selected_range();
        if !range.is_empty() {
            return None;
        }
        let value = input.value();
        let before = &value[..range.start];
        let start = before.rfind(char::is_whitespace).map_or(0, |i| {
            i + before[i..]
                .chars()
                .next()
                .expect("Whitespace character")
                .len_utf8()
        });
        let query = &before[start..];
        if !query.starts_with(['@', '/']) {
            return None;
        }
        let candidates = self
            .references
            .values()
            .filter(|r| r.label.to_lowercase().starts_with(&query.to_lowercase()))
            .take(8)
            .cloned()
            .collect::<Vec<_>>();
        (!candidates.is_empty()).then_some((start..range.start, candidates))
    }
    fn complete(&mut self, window: &mut Window, cx: &mut Context<Self>) -> bool {
        if self.composing(window, cx) {
            return false;
        }
        let Some((range, items)) = self.suggestions(cx) else {
            return false;
        };
        if let Ok(draft) = Draft::reference(items[self.selection.min(items.len() - 1)].clone()) {
            self.replace(range, draft, window, cx);
        }
        true
    }
}
impl Render for Composer {
    fn render(&mut self, _: &mut Window, cx: &mut Context<Self>) -> impl IntoElement {
        let p = Palette::new(cx.theme().mode.is_dark());
        let suggestions = self.suggestions(cx);
        let _ = &self.subscriptions;
        let mut view = div()
            .id("native-composer")
            .flex()
            .flex_col()
            .gap_2()
            .capture_action(cx.listener(|this, _: &Copy, window, cx| {
                if this.copy(false, window, cx) {
                    cx.stop_propagation();
                }
            }))
            .capture_action(cx.listener(|this, _: &Cut, window, cx| {
                if this.copy(true, window, cx) {
                    cx.stop_propagation();
                }
            }))
            .capture_action(cx.listener(|this, _: &Paste, window, cx| {
                if this.paste(window, cx) {
                    cx.stop_propagation();
                }
            }))
            .capture_action(cx.listener(|this, _: &Undo, window, cx| {
                if this.travel(false, window, cx) {
                    cx.stop_propagation();
                }
            }))
            .capture_action(cx.listener(|this, _: &Redo, window, cx| {
                if this.travel(true, window, cx) {
                    cx.stop_propagation();
                }
            }))
            .capture_action(cx.listener(|this, action: &Enter, window, cx| {
                if !action.shift && !action.secondary && this.complete(window, cx) {
                    cx.stop_propagation();
                }
            }))
            .on_drop(cx.listener(|this, paths: &ExternalPaths, _, cx| {
                if !this.readonly {
                    cx.emit(ComposerEvent::Files(vec![ClipboardEntry::ExternalPaths(
                        paths.clone(),
                    )]))
                }
            }))
            .capture_key_down(cx.listener(|this, event: &KeyDownEvent, window, cx| {
                let s = this.snapshot(cx);
                this.history.selection(s.selection, s.reversed);
                if this.composing(window, cx) {
                    return;
                }
                if let Some((_, items)) = this.suggestions(cx) {
                    match event.keystroke.key.as_str() {
                        "escape" => this.dismissed = true,
                        "down" => this.selection = (this.selection + 1) % items.len(),
                        "up" => this.selection = (this.selection + items.len() - 1) % items.len(),
                        _ => return,
                    }
                    cx.stop_propagation();
                    cx.notify();
                }
            }))
            .child(
                Textarea::new(&self.input)
                    .when(self.embedded, |input| input.small())
                    .readonly(self.readonly)
                    .appearance(!self.embedded)
                    .bordered(!self.embedded)
                    .px(crate::ui::theme::ui(2.))
                    .py(crate::ui::theme::ui(2.))
                    .text_size(crate::ui::theme::ui(14.))
                    .line_height(crate::ui::theme::ui(20.))
                    .aria_label("Message with references"),
            );
        if let Some((_, items)) = suggestions {
            let mut menu = div()
                .id("composer-suggestions")
                .role(Role::ListBox)
                .aria_label("Reference suggestions")
                .flex()
                .flex_col()
                .p_2()
                .bg(p.color("popover"))
                .rounded(px(10.));
            for (i, item) in items.into_iter().enumerate() {
                let text = item.label.clone();
                menu = menu.child(
                    div()
                        .id(("suggestion", i))
                        .role(Role::ListBoxOption)
                        .aria_label(text.clone())
                        .px_3()
                        .py_1()
                        .when(i == self.selection, |v| v.bg(p.color("accent")))
                        .child(text)
                        .on_mouse_down(MouseButton::Left, |_, window, _| window.prevent_default())
                        .on_click(cx.listener(move |this, _, window, cx| {
                            this.selection = i;
                            this.complete(window, cx);
                        })),
                );
            }
            view = view.child(menu);
        }
        if let Some(error) = &self.error {
            view = view.child(caption(error.clone(), p));
        }
        view
    }
}
