//! Geometry-matched placeholders for an uncached native conversation.
use super::*;
use crate::ui::theme::{Palette, ui};
use gpui_kit::base::TestSupportExt;
use gpui_kit::component::{ActiveTheme, skeleton::Skeleton};
use ngertiin_client::text;

fn placeholder(width: f32, height: f32, radius: f32, cx: &App) -> AnyElement {
    let view = div().w(relative(width)).h(ui(height)).rounded(ui(radius));
    if cx.reduce_motion() {
        view.bg(cx.theme().skeleton).into_any_element()
    } else {
        view.child(Skeleton::new().size_full().rounded(ui(radius)))
            .into_any_element()
    }
}

pub(super) fn avatar_placeholder(cx: &App) -> AnyElement {
    placeholder(1., 32., 16., cx)
}

impl Workspace {
    pub(super) fn conversation_loading(&self, window: &Window, cx: &App) -> AnyElement {
        let p = Palette::new(self.store.dark());
        let group = self.selected.is_some_and(|id| {
            self.threads
                .iter()
                .any(|thread| text(thread, "id") == id.to_string() && thread["type"] == "group")
        });
        let mut conversation = div()
            .id("conversation-loading")
            .role(Role::Status)
            .aria_label("Loading conversation")
            .test_support()
            .absolute()
            .inset_0()
            .px(ui(20.))
            .pt(ui(83.))
            .pb(self.conversation.composer_height + window.rem_size() * 1.75)
            .flex()
            .flex_col()
            .justify_end()
            .gap(ui(16.))
            .overflow_hidden();
        for (id, user, width, lines) in [
            ("agent-short", false, 0.50, 2),
            ("user-short", true, 0.28, 1),
            ("agent-long", false, 0.72, 3),
            ("user-medium", true, 0.40, 2),
        ] {
            let mut bubble = div()
                .id(SharedString::from(format!("loading-bubble:{id}")))
                .test_support()
                .w(relative(width))
                .max_w(relative(0.8))
                .min_w_0()
                .flex()
                .flex_col()
                .gap(ui(8.))
                .px(ui(12.))
                .py(ui(12.))
                .rounded(ui(20.))
                .bg(p.color(if user { "muted" } else { "card" }));
            for width in [0.88, 0.64, 0.76].into_iter().take(lines) {
                bubble = bubble.child(placeholder(width, 12., 3., cx));
            }
            let mut row = div().w_full().flex().items_start().gap(ui(8.));
            if user {
                row = row.justify_end();
            } else if group {
                row = row.child(
                    div()
                        .size(ui(32.))
                        .flex_shrink_0()
                        .child(avatar_placeholder(cx)),
                );
            }
            conversation = conversation.child(row.child(bubble));
        }
        // Only the status label enters accessibility; these shapes contain no
        // fabricated transcript text or interactive message controls.
        conversation.into_any_element()
    }
}
