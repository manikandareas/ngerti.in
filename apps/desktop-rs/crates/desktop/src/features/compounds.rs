use crate::{
    shell::Gallery,
    ui::{compound::*, controls::*, theme::Palette},
};
use gpui_kit::{
    component::{
        popover::Popover,
        resizable::{h_resizable, resizable_panel},
        spinner::Spinner,
    },
    *,
};

impl Gallery {
    pub(crate) fn compound_controls(&self, p: Palette, cx: &mut Context<Self>) -> AnyElement {
        card(p)
            .child(title("Compound controls"))
            .child(
                row()
                    .children([
                        badge("badge-default", "Default", Tone::Neutral, p),
                        badge("badge-complete", "Complete", Tone::Success, p),
                        badge("badge-waiting", "Waiting", Tone::Warning, p),
                        badge("badge-failed", "Failed", Tone::Danger, p),
                    ])
                    .child(Spinner::new()),
            )
            .child(separator(p))
            .child(
                list_row(
                    RowProps {
                        id: "example-row",
                        label: "Conversation details".into(),
                        hint: "Profile and preferences".into(),
                        selected: self.enabled,
                        disabled: false,
                    },
                    p,
                    cx,
                )
                .on_click(cx.listener(|this, _, _, cx| {
                    this.enabled = !this.enabled;
                    cx.notify();
                })),
            )
            .child(list_row(
                RowProps {
                    id: "unavailable-row",
                    label: "Unavailable details".into(),
                    hint: "Disabled item".into(),
                    selected: false,
                    disabled: true,
                },
                p,
                cx,
            ))
            .child(skeleton("skeleton-row", p))
            .child(bubble(
                "bubble-default",
                "A reusable message surface with caller-owned content.",
                false,
                p,
            ))
            .child(bubble(
                "bubble-emphasized",
                "A second presentation variant.",
                true,
                p,
            ))
            .child(
                Popover::new("example-popover")
                    .trigger(
                        button(
                            "popover-trigger",
                            "Open popover",
                            ButtonKind::Default,
                            p,
                            cx,
                        )
                        .tooltip("Show contextual information"),
                    )
                    .content(move |_, _, _| {
                        card(p)
                            .child(accessible_text(
                                "popover-title",
                                "Contextual information",
                                Role::Heading,
                            ))
                            .child(
                                accessible_text(
                                    "popover-description",
                                    "Escape returns to the trigger.",
                                    Role::Paragraph,
                                )
                                .text_color(p.color("muted-foreground")),
                            )
                    }),
            )
            .child(
                div().h(px(150.)).child(
                    h_resizable("gallery-resize")
                        .child(
                            resizable_panel()
                                .size(px(220.))
                                .child(card(p).child("Resize this panel")),
                        )
                        .child(resizable_panel().child(card(p).child("Adjacent content"))),
                ),
            )
            .child(
                row().children(self.assets.format_icons.iter().map(|(name, path)| {
                    div()
                        .flex()
                        .flex_col()
                        .items_center()
                        .gap_2()
                        .p_2()
                        .child(img(path.clone()).size(px(32.)))
                        .child(caption(name.clone(), p))
                })),
            )
            .child(caption(
                "Original Material Icon Theme 5.40.0 assets; neutral filename associations.",
                p,
            ))
            .into_any_element()
    }
}
