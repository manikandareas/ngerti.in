use crate::{
    shell::Gallery,
    ui::{controls::*, theme::Palette},
};
use gpui_kit::{
    component::{
        input::{Editor, InlineToken, Textarea},
        text::TextView,
    },
    *,
};

impl Gallery {
    pub(crate) fn composer_probe(&self, p: Palette, cx: &mut Context<Self>) -> AnyElement {
        card(p).size_full().child(title("Composer · native editing"))
            .child(caption("Try IME composition, emoji, multi-line paste, token selection, undo/redo and copy.", p))
            .child(Textarea::new(&self.composer).aria_label("Message Tobi"))
            .child(row()
                .child(button("insert-reference", "Insert @Tobi", ButtonKind::Default, p, cx)
                    .on_click(cx.listener(|this, _, window, cx| {
                        let result = this.composer.update(cx, |input, cx| {
                            let result = input.replace_with_token(InlineToken::new("agent:tobi", "@Tobi").with_label("Tobi"), window, cx);
                            input.focus(window, cx); result
                        });
                        this.status = if result.is_ok() { "Native reference inserted" } else { "Token insertion failed" }.into(); cx.notify();
                    })))
                .child(button("save-draft", "Save draft", ButtonKind::Default, p, cx)
                    .on_click(cx.listener(|this, _, _, cx| { this.saved = Some(this.composer.read(cx).content()); this.status = "Draft saved in gallery memory".into(); cx.notify(); })))
                .child(button("restore-draft", "Restore draft", ButtonKind::Default, p, cx)
                    .on_click(cx.listener(|this, _, window, cx| {
                        if let Some(content) = this.saved.clone() { this.composer.update(cx, |input, cx| input.set_value(content, window, cx)); }
                        this.status = "Draft restored in gallery memory".into(); cx.notify();
                    })))
                .child(button("inspect-composer", "Inspect content", ButtonKind::Primary, p, cx)
                    .on_click(cx.listener(|this, _, _, cx| {
                        let content = this.composer.read(cx).content();
                        this.status = format!("{} · {} token(s)", content.text(), content.tokens().len()); cx.notify();
                    }))))
            .child(caption("This editor has no send action. The production composer and durable drafts belong to NMA-067/068.", p))
            .into_any_element()
    }
    pub(crate) fn avatar_probe(&self, p: Palette, cx: &mut Context<Self>) -> AnyElement {
        let portrait = |edge: f32| {
            div()
                .relative()
                .size(px(edge))
                .child(img(self.assets.avatar[usize::from(self.rotated)].clone()).size_full())
                .child(
                    div()
                        .absolute()
                        .top(px(edge * 0.43))
                        .left(px(edge * 0.33))
                        .flex()
                        .gap(px(edge * 0.12))
                        .children((0..2).map(|_| {
                            div()
                                .w(px(edge * 0.08))
                                .h(px(edge * 0.12))
                                .rounded_full()
                                .bg(rgb(0x261e36))
                        })),
                )
        };
        card(p).size_full().child(title("Rust material · independent eye layer"))
            .child(row().items_end().children([32., 64., 128., 256.].map(portrait)))
            .child(button("rotate-texture", "Rotate fur 22.5°", ButtonKind::Default, p, cx)
                .on_click(cx.listener(|this, _, _, cx| { this.rotated = !this.rotated; cx.notify(); })))
            .child(caption("Deterministic Rust-generated 768px material; GPUI images at 32/64/128/256px. Eyes stay fixed while the texture rotates. Full recipe parity remains NMA-067.", p))
            .into_any_element()
    }
    pub(crate) fn source_probe(&self, p: Palette, _: &mut Context<Self>) -> AnyElement {
        div().flex().flex_col().size_full().gap_4()
            .child(caption("Read-only Rust source: select, find with Cmd+F, copy. Table: 10,000 virtual rows with native text selection.", p))
            .child(div().h(px(280.)).child(Editor::new(&self.editor).readonly(true).aria_label("Read-only source").size_full()))
            .child(uniform_list("virtual-table", 10_000, move |range, _, _| range.map(|i| {
                div().id(("table-row", i)).h(px(32.)).flex().items_center().px_3().gap_4()
                    .bg(p.color(if i % 2 == 0 { "panel" } else { "background" }))
                    .child(div().w(px(80.)).child(format!("{:05}", i + 1)))
                    .child(TextView::markdown(("table-cell", i), format!("Source row {} · selectable text", i + 1)))
                    .into_any_element()
            }).collect()).flex_1())
            .into_any_element()
    }
    pub(crate) fn pdf_probe(&self, p: Palette, cx: &mut Context<Self>) -> AnyElement {
        let mut content = div().flex().flex_col().size_full().gap_3().child(
            row()
                .child(
                    button("pdf-zoom-out", "−", ButtonKind::Default, p, cx).on_click(cx.listener(
                        |this, _, window, cx| {
                            if let Some(pdf) = &this.pdf {
                                pdf.update(cx, |pdf, cx| pdf.zoom(1. / 1.25, window, cx));
                            }
                        },
                    )),
                )
                .child(
                    button("pdf-zoom-in", "+", ButtonKind::Default, p, cx).on_click(cx.listener(
                        |this, _, window, cx| {
                            if let Some(pdf) = &this.pdf {
                                pdf.update(cx, |pdf, cx| pdf.zoom(1.25, window, cx));
                            }
                        },
                    )),
                )
                .child(
                    button("pdf-fit", "Fit width", ButtonKind::Default, p, cx).on_click(
                        cx.listener(|this, _, window, cx| {
                            if let Some(pdf) = &this.pdf {
                                pdf.update(cx, |pdf, cx| pdf.fit(window, cx));
                            }
                        }),
                    ),
                )
                .child(
                    button(
                        "pdf-inspect-selection",
                        "Inspect selection",
                        ButtonKind::Default,
                        p,
                        cx,
                    )
                    .on_click(cx.listener(|this, _, _, cx| {
                        if let Some(pdf) = &this.pdf {
                            this.status =
                                format!("PDF selection: {}", pdf.read(cx).selected_text());
                            cx.notify();
                        }
                    })),
                )
                .child(
                    button("pdf-overlay", "Native overlay", ButtonKind::Default, p, cx)
                        .on_click(|_, window, cx| Self::overlay(window, cx)),
                )
                .child(
                    button("pdf-previous", "Previous page", ButtonKind::Default, p, cx).on_click(
                        cx.listener(|this, _, _, cx| {
                            if let Some(pdf) = &this.pdf {
                                pdf.update(cx, |pdf, cx| pdf.page(false, cx));
                            }
                        }),
                    ),
                )
                .child(
                    button("pdf-next", "Next page", ButtonKind::Default, p, cx).on_click(
                        cx.listener(|this, _, _, cx| {
                            if let Some(pdf) = &this.pdf {
                                pdf.update(cx, |pdf, cx| pdf.page(true, cx));
                            }
                        }),
                    ),
                )
                .child(
                    button(
                        "pdf-position",
                        "Inspect position",
                        ButtonKind::Default,
                        p,
                        cx,
                    )
                    .on_click(cx.listener(|this, _, _, cx| {
                        this.status = format!(
                            "PDF reading position (page, fraction): {:?}",
                            this.pdf
                                .as_ref()
                                .and_then(|pdf| pdf.read(cx).reading_position())
                        );
                        cx.notify();
                    })),
                )
                .child(caption(
                    "Native continuous pages, bounded nearby rasters and PDFKit text selection.",
                    p,
                )),
        );
        content = content.child(
            row().children(
                [0.5, 1., 1.5, 2.]
                    .into_iter()
                    .enumerate()
                    .map(|(ix, factor)| {
                        button(
                            ("pdf-exact-zoom", ix),
                            format!("{:.0}%", factor * 100.),
                            ButtonKind::Default,
                            p,
                            cx,
                        )
                        .on_click(cx.listener(
                            move |this, _, window, cx| {
                                if let Some(pdf) = &this.pdf {
                                    pdf.update(cx, |pdf, cx| pdf.set_zoom(factor, window, cx));
                                }
                            },
                        ))
                    }),
            ),
        );
        content = content.child(row().children(self.assets.pdf_cases.iter().enumerate().map(
            |(i, (name, path))| {
                let path = path.clone();
                button(("pdf-fixture", i), name.clone(), ButtonKind::Default, p, cx).on_click(
                    cx.listener(move |this, _, window, cx| {
                        if this.measurement.is_some() {
                            return;
                        }
                        if let Some(old) = this.pdf.take() {
                            old.update(cx, |pdf, cx| pdf.hide(window, cx));
                        }
                        this.pdf = Some(
                            cx.new(|cx| crate::platform::pdf::NativePdf::new(&path, window, cx)),
                        );
                        cx.notify();
                    }),
                )
            },
        )));
        if let Some(pdf) = &self.pdf {
            content = content.child(div().flex_1().min_h_0().child(pdf.clone()));
        } else {
            content = content.child(state(
                "pdf-unavailable",
                "Native PDF unavailable",
                &self.status,
                p,
            ));
        }
        content.into_any_element()
    }
    pub(crate) fn html_probe(&self, p: Palette, cx: &mut Context<Self>) -> AnyElement {
        let mut content = div().size_full().flex().flex_col().gap_3().child(
            row()
                .child(
                    button("html-overlay", "Native overlay", ButtonKind::Default, p, cx)
                        .on_click(|_, window, cx| Self::overlay(window, cx)),
                )
                .child(
                    button(
                        "html-download",
                        "Download original HTML",
                        ButtonKind::Default,
                        p,
                        cx,
                    )
                    .on_click(cx.listener(|this, _, window, cx| {
                        this.status = "Saving original HTML…".into();
                        cx.spawn_in(window, async move |view, cx| {
                            let result = cx
                                .background_executor()
                                .spawn(async move {
                                    crate::platform::files::save_original(
                                        "document.html",
                                        crate::platform::files::Original::Bytes(
                                            include_bytes!(
                                                "../../../../assets/static-document.html"
                                            )
                                            .to_vec(),
                                        ),
                                    )
                                })
                                .await;
                            let _ = view.update(cx, |this, cx| {
                                this.status = match result {
                                    Ok(path) => format!("Original saved to {}", path.display()),
                                    Err(e) => e.to_string(),
                                };
                                cx.notify();
                            });
                        })
                        .detach();
                    })),
                ),
        );
        if let Some(html) = &self.html {
            content = content.child(div().flex_1().min_h_0().child(html.clone()));
        } else {
            content = content.child(state(
                "html-unavailable",
                "HTML preview unavailable",
                &self.status,
                p,
            ));
        }
        content.into_any_element()
    }
}
