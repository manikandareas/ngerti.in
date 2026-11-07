use crate::{
    shell::Gallery,
    ui::{controls::*, theme::Palette},
};
use gpui_kit::component::Disableable;
use gpui_kit::component::button::DropdownButton;
use gpui_kit::{
    component::{
        checkbox::Checkbox, input::Input, radio::RadioGroup, slider::Slider, switch::Switch,
    },
    *,
};

impl Gallery {
    pub(crate) fn controls(&self, p: Palette, cx: &mut Context<Self>) -> AnyElement {
        div()
            .id("gallery-controls")
            .overflow_y_scroll()
            .size_full()
            .flex()
            .flex_col()
            .gap_4()
            .child(
                card(p)
                    .child(title("Buttons · variants and caller overrides"))
                    .child(
                        row()
                            .child(
                                button("button-default", "Default", ButtonKind::Default, p, cx)
                                    .on_click(cx.listener(|this, _, _, cx| {
                                        this.status = "Default activated".into();
                                        cx.notify();
                                    })),
                            )
                            .child(
                                button("button-primary", "Primary", ButtonKind::Primary, p, cx)
                                    .on_click(cx.listener(|this, _, _, cx| {
                                        this.status = "Primary activated".into();
                                        cx.notify();
                                    })),
                            )
                            .child(button("button-ghost", "Ghost", ButtonKind::Ghost, p, cx))
                            .child(button("button-danger", "Delete", ButtonKind::Danger, p, cx))
                            .child(
                                button(
                                    "button-override",
                                    "Rounded override",
                                    ButtonKind::Default,
                                    p,
                                    cx,
                                )
                                .rounded_full()
                                .h(px(36.)),
                            )
                            .child(
                                button("button-disabled", "Disabled", ButtonKind::Primary, p, cx)
                                    .disabled(true),
                            )
                            .child(
                                button("button-loading", "Loading", ButtonKind::Default, p, cx)
                                    .loading(true),
                            ),
                    )
                    .child(caption(
                        "Tab / Shift+Tab · Space / Return · focus ring · disabled skips activation",
                        p,
                    )),
            )
            .child(
                card(p)
                    .child(title("Fields and choices"))
                    .child(Input::new(&self.input).aria_label("Search agents"))
                    .child(
                        row()
                            .child(
                                Checkbox::new("remember-choice")
                                    .label("Remember choice")
                                    .checked(self.checked)
                                    .on_change(cx.listener(|this, checked, _, cx| {
                                        this.checked = *checked;
                                        cx.notify();
                                    })),
                            )
                            .child(
                                Switch::new("enable-preview")
                                    .label("Enable preview")
                                    .checked(self.enabled)
                                    .on_change(cx.listener(|this, checked, _, cx| {
                                        this.enabled = *checked;
                                        cx.notify();
                                    })),
                            )
                            .child(
                                Checkbox::new("disabled-choice")
                                    .label("Unavailable")
                                    .disabled(true),
                            ),
                    )
                    .child(
                        RadioGroup::new("appearance-choice")
                            .children(["System", "Light", "Dark"])
                            .selected_index(self.radio)
                            .on_change(cx.listener(|this, selected, _, cx| {
                                this.radio = Some(*selected);
                                cx.notify();
                            })),
                    )
                    .child(
                        Slider::new(&self.slider)
                            .w(px(260.))
                            .accessibility_label("Preview size"),
                    ),
            )
            .child(
                card(p)
                    .child(title("Native overlays and icons"))
                    .child(
                        row()
                            .child(
                                button("open-dialog", "Open dialog", ButtonKind::Default, p, cx)
                                    .on_click(|_, window, cx| Gallery::overlay(window, cx)),
                            )
                            .child(
                                DropdownButton::new("gallery-menu")
                                    .button(button(
                                        "menu-action",
                                        "Appearance",
                                        ButtonKind::Default,
                                        p,
                                        cx,
                                    ))
                                    .menu_accessibility_label("Appearance menu")
                                    .dropdown_menu(|menu, _, _| {
                                        menu.menu(
                                            "Toggle theme",
                                            Box::new(crate::shell::ToggleTheme),
                                        )
                                        .separator()
                                        .menu_with_disabled(
                                            "Unavailable action",
                                            Box::new(crate::shell::ToggleTheme),
                                            true,
                                        )
                                    }),
                            )
                            .children(
                                [
                                    "folder", "computer", "settings", "file", "search", "plus",
                                    "close", "copy",
                                ]
                                .map(|name| icon(name, p)),
                            ),
                    )
                    .child(caption(
                        "Hugeicons 4.4.0 · Geist 5.3.0 · escape closes dialog",
                        p,
                    )),
            )
            .child(state(
                "loading-state",
                "Loading",
                "Reading the current conversation…",
                p,
            ))
            .child(state(
                "empty-state",
                "No saved files",
                "Files saved in this conversation appear here.",
                p,
            ))
            .child(state(
                "error-state",
                "Could not load files",
                "Check the backend connection, then retry.",
                p,
            ))
            .child(self.compound_controls(p, cx))
            .into_any_element()
    }
}
