use crate::{
    shell::Gallery,
    ui::{controls::*, theme::Palette},
};
use gpui_kit::component::Disableable;
use gpui_kit::component::button::DropdownButton;
use gpui_kit::{
    component::{
        WindowExt, checkbox::Checkbox, input::Input, radio::RadioGroup, slider::Slider,
        switch::Switch,
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
                            .child(button("button-outline", "Outline", ButtonKind::Outline, p, cx))
                            .child(button("button-secondary", "Secondary", ButtonKind::Secondary, p, cx))
                            .child(button("button-link", "Text action", ButtonKind::Link, p, cx))
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
                                    .disabled_state(true, p),
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
                    .child(crate::ui::compound::field(
                        "search-field",
                        "Search agents",
                        "Find an agent by name.",
                        crate::ui::compound::input_group(
                            "search-input-group", "Agent search",
                            Input::new(&self.input).aria_label("Search agents"),
                            Some(icon("search", p).into_any_element()),
                            Some(caption("Name", p).into_any_element()), p,
                        ),
                        p,
                    ))
                    .child(crate::ui::field::disabled_field(
                        "unavailable-field", "Unavailable field",
                        self.disabled_input.read(cx).value().to_string(), Role::TextInput,
                        Input::new(&self.disabled_input).disabled(true)
                            .role(gpui_kit::component::RoleOverride::Presentational),
                    ))
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
                            )
                            .child(Switch::new("disabled-preview").label("Unavailable preview").disabled(true)),
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
                                button("open-sheet", "Open sheet", ButtonKind::Default, p, cx)
                                    .on_click(|_, window, cx| {
                                        window.open_sheet(cx, |sheet, _, _| {
                                            sheet.title(accessible_text("native-sheet-title", "Conversation details", Role::Heading)).size(px(400.))
                                                .child(accessible_text("native-sheet-description", "Native side sheet with keyboard dismissal and focus return.", Role::Paragraph))
                                        });
                                    }),
                            )
                            .child(
                                button("open-drawer", "Open drawer", ButtonKind::Default, p, cx)
                                    .on_click(|_, window, cx| {
                                        window.open_sheet_at(gpui_kit::component::Placement::Bottom, cx, |sheet, _, _| {
                                            sheet.title(accessible_text("native-drawer-title", "Compact details", Role::Heading)).size(px(300.))
                                                .child(accessible_text("native-drawer-description", "Native bottom drawer for compact windows.", Role::Paragraph))
                                        });
                                    }),
                            )
                            .child(
                                button("open-alert", "Open confirmation", ButtonKind::Default, p, cx)
                                    .on_click(|_, window, cx| {
                                        window.open_alert_dialog(cx, |alert, _, _| {
                                            alert.title(accessible_text("native-confirmation-title", "Local confirmation", Role::Heading))
                                                .description(accessible_text("native-confirmation-description", "This gallery confirmation changes no application data.", Role::Paragraph))
                                                .show_cancel(true)
                                        });
                                    }),
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
            ).role(Role::Alert))
            .child(self.compound_controls(p, cx))
            .into_any_element()
    }
}
