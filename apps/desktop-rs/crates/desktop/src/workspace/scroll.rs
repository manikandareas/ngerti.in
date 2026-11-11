//! Feature-owned scroll checkpoint seam over GPUI's retained native list.
//! Kit 0.9.0's MessageScroller cannot restore an offset within a row. Keep its
//! row-owned insets and native scrollbar/bounce behavior while exposing that seam.
use super::*;
use gpui_kit::component::{
    ActiveTheme,
    button::{Button, ButtonVariants},
    scroll::ScrollableElement,
};
use gpui_kit::prelude::FluentBuilder as _;
use std::ops::Range;

pub(super) struct ScrollChanged;
pub(super) struct TranscriptScroll {
    list: ListState,
}
impl EventEmitter<ScrollChanged> for TranscriptScroll {}
impl TranscriptScroll {
    pub(super) fn set_readiness(&self, ready: impl Fn(usize, &App) -> bool + 'static) {
        self.list.set_item_measurement_readiness(ready);
    }
    pub fn new(window: &Window, cx: &mut Context<Self>) -> Self {
        let list = ListState::new(0, ListAlignment::Top, window.rem_size() * 25.);
        list.set_follow_mode(FollowMode::Tail);
        let weak = cx.weak_entity();
        list.set_scroll_handler(move |_, _, cx| {
            let weak = weak.clone();
            // The list's RefCell is still borrowed inside its scroll callback.
            cx.defer(move |cx| {
                let _ = weak.update(cx, |_, cx| {
                    cx.emit(ScrollChanged);
                    cx.notify();
                });
            });
        });
        Self { list }
    }
    pub fn item_count(&self) -> usize {
        self.list.item_count()
    }
    pub fn logical_scroll_top(&self) -> ListOffset {
        self.list.logical_scroll_top()
    }
    pub fn is_following_tail(&self) -> bool {
        self.list.is_following_tail()
    }
    pub fn reset(&mut self, count: usize, cx: &mut Context<Self>) {
        self.list.reset(count);
        self.list.set_follow_mode(FollowMode::Tail);
        cx.notify();
    }
    pub fn splice(&mut self, range: Range<usize>, count: usize, cx: &mut Context<Self>) {
        let start = range.start;
        let neighbor = range.start.saturating_sub(1);
        self.list.splice(range, count);
        let len = self.item_count();
        for ix in [
            0,
            neighbor,
            start.saturating_add(count),
            len.saturating_sub(1),
        ] {
            if ix < len {
                self.list.remeasure_items(ix..ix + 1);
            }
        }
        cx.notify();
    }
    pub fn remeasure(&mut self, cx: &mut Context<Self>) {
        self.list.remeasure();
        cx.notify();
    }
    pub fn remeasure_items(&mut self, range: Range<usize>, cx: &mut Context<Self>) {
        self.list.remeasure_items(range);
        cx.notify();
    }
    pub fn scroll_to(&mut self, position: ListOffset, cx: &mut Context<Self>) {
        self.list.pause_following_tail();
        self.list.scroll_to(position);
        cx.notify();
    }
    pub fn scroll_to_end(&mut self, cx: &mut Context<Self>) {
        self.list.set_follow_mode(FollowMode::Tail);
        self.list.scroll_to_end();
        cx.notify();
    }
}

impl Workspace {
    pub(super) fn transcript_view(
        &self,
        window: &mut Window,
        cx: &mut Context<Self>,
    ) -> AnyElement {
        let scroll = self.conversation.scroller.clone();
        let state = scroll.read(cx);
        let list_state = state.list.clone();
        let count = state.item_count();
        let scrolled_up = !state.is_following_tail()
            && !list_state.is_scrolled_to_end().unwrap_or(false)
            && list_state.max_offset_for_scrollbar().y > px(0.);
        let bottom = self.conversation.composer_height + window.rem_size() * 1.75;
        let weak = cx.entity().downgrade();
        let scroll_id = scroll.entity_id();
        let top = if self.conversation.find.read(cx).open {
            83. + super::thread_search::HEIGHT
        } else {
            83.
        };
        let list = list(list_state.clone(), move |ix, window, cx| {
            weak.update(cx, |this, cx| {
                if this.conversation.scroller.entity_id() != scroll_id {
                    return div().into_any_element();
                }
                div()
                    .w_full()
                    .when(ix == 0, |view| view.pt(crate::ui::theme::ui(top)))
                    .when(ix + 1 == count, |view| view.pb(bottom))
                    .child(
                        div()
                            .w_full()
                            .min_w_0()
                            .pb(crate::ui::theme::ui(16.))
                            .child(this.transcript_row(ix, window, cx)),
                    )
                    .into_any_element()
            })
            .unwrap_or_else(|_| div().into_any_element())
        })
        .size_full()
        .min_h_0();
        let bounce_scroll = scroll.clone();
        let viewport = div()
            .id("conversation-transcript-viewport")
            .role(Role::Log)
            .size_full()
            .min_h_0()
            .min_w_0()
            .child(
                gpui_kit::base::ScrollBounce::new(
                    "conversation-transcript-bounce",
                    &list_state,
                    list,
                )
                .on_scroll(move |_, cx| {
                    bounce_scroll.update(cx, |_, cx| {
                        cx.emit(ScrollChanged);
                        cx.notify();
                    });
                }),
            )
            .vertical_scrollbar(&list_state);
        let tokens = cx.theme().semantic_tokens();
        div()
            .id("conversation-transcript")
            .absolute()
            .inset_0()
            .overflow_hidden()
            .child(viewport)
            .when(scrolled_up, |view| {
                view.child(
                    div()
                        .absolute()
                        .left_0()
                        .right_0()
                        .bottom_4()
                        .flex()
                        .justify_center()
                        .child(
                            Button::new("transcript-jump-to-latest")
                                .secondary()
                                .icon(gpui_kit::component::IconName::ArrowDown)
                                .tooltip("Ke pesan terbaru")
                                .rounded(cx.theme().radius_full())
                                .border_1()
                                .border_color(tokens.colors.border)
                                .bg(tokens.colors.background)
                                .text_color(tokens.colors.foreground)
                                .on_click(move |_, _, cx| {
                                    scroll.update(cx, |state, cx| {
                                        state.scroll_to_end(cx);
                                        cx.emit(ScrollChanged);
                                    })
                                }),
                        ),
                )
            })
            .into_any_element()
    }
}
