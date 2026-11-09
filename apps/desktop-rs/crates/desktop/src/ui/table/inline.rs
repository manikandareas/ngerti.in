//! Native Markdown table layout adapted from Zed's grid-based renderer.
//! Source: zed-industries/zed b5cd310b3b54dfc659fcc06453e6358843dfe216,
//! crates/markdown/src/markdown.rs (Table/TableCell and TableState).
//! Product sorting, filtering and bounded row/column windows share Focus state.
use super::*;
use crate::ui::{theme::ui, workspace::glyph};
use gpui_kit::base::TestSupportExt;
use gpui_kit::base::text::{MarkdownExtensions, TableData, TextView, TextViewStyle};
use std::rc::Rc;

type Actions = Rc<dyn Fn(TableData, &mut App) -> AnyElement>;
type Changed = Rc<dyn Fn(&mut App)>;

pub(crate) struct InlineTable {
    cells: Vec<Vec<String>>,
    alignments: Vec<TextAlign>,
    pub(super) font_unit: f32,
    extensions: MarkdownExtensions,
    actions: Actions,
    pub(super) changed: Changed,
}
impl InlineTable {
    pub(crate) fn new(
        cells: Vec<Vec<String>>,
        alignments: Vec<TextAlign>,
        extensions: MarkdownExtensions,
        actions: impl Fn(TableData, &mut App) -> AnyElement + 'static,
        changed: impl Fn(&mut App) + 'static,
    ) -> Self {
        Self {
            cells,
            alignments,
            font_unit: 0.,
            extensions,
            actions: Rc::new(actions),
            changed: Rc::new(changed),
        }
    }
}
impl RichTable {
    pub(crate) fn inline(mut self, options: InlineTable) -> Self {
        self.inline = Some(options);
        self
    }
    pub(crate) fn update_inline(
        &mut self,
        document: Arc<TableDocument>,
        options: InlineTable,
        cx: &mut Context<Self>,
    ) {
        let changed =
            self.document.headers != document.headers || self.document.rows != document.rows;
        self.inline = Some(options);
        let columns = changed.then(|| document.columns());
        self.document = document;
        if let Some(columns) = columns {
            self.columns = columns;
            self.row_heights.clear();
            self.height_widths.clear();
            self.reorder(cx);
        }
    }
    fn measure_inline_columns(&mut self, window: &Window) {
        let unit = f32::from(window.rem_size()) / 16.;
        if self.inline.as_ref().unwrap().font_unit == unit {
            return;
        }
        let style = window.text_style();
        let measure = |text: &str| {
            text.lines()
                .map(|line| {
                    f32::from(
                        window
                            .text_system()
                            .shape_line(
                                line.to_owned().into(),
                                px(14. * unit),
                                &[style.to_run(line.len())],
                                None,
                            )
                            .width(),
                    )
                })
                .fold(0_f32, f32::max)
        };
        for (column, layout) in self.columns.iter_mut().enumerate() {
            let values = std::iter::once(self.document.headers[column].as_str()).chain(
                self.document
                    .rows
                    .iter()
                    .take(100)
                    .map(|row| row.get(column).map_or("", String::as_str)),
            );
            let mut natural = 0_f32;
            let mut minimum = 0_f32;
            for value in values {
                natural = natural.max(measure(value));
                for word in value.split_whitespace() {
                    minimum = minimum.max(measure(word));
                }
            }
            layout.width = (natural + 28. * unit).clamp(72. * unit, 360. * unit);
            layout.minimum = (minimum + 24. * unit)
                .clamp(56. * unit, 144. * unit)
                .min(layout.width);
        }
        self.inline.as_mut().unwrap().font_unit = unit;
        self.height_widths.clear();
        self.row_heights.clear();
    }
    pub(super) fn render_inline(
        &mut self,
        window: &mut Window,
        cx: &mut Context<Self>,
    ) -> AnyElement {
        let p = Palette::new(cx.theme().mode.is_dark());
        let unit = f32::from(window.rem_size()) / 16.;
        self.measure_inline_columns(window);
        let columns = self.document.headers.len();
        let row_count = self.order.len();
        let widths = (0..columns)
            .map(|column| self.column_width(column))
            .collect::<Vec<_>>();
        if widths != self.height_widths {
            self.height_widths = widths;
            self.row_heights.clear();
        }
        let visible = visible_columns(
            &self.height_widths,
            -f32::from(self.horizontal.offset().x),
            self.available,
        );
        let before: f32 = self.height_widths[..visible.start].iter().sum();
        let after: f32 = self.height_widths[visible.end..].iter().sum();
        let mut headers = div()
            .grid()
            .grid_cols_max_content((visible.len() + 2) as u16)
            .flex_shrink_0()
            .h(ui(36.))
            .bg(p.color("muted"))
            .border_b_1()
            .border_color(p.color("border").opacity(0.4))
            .child(div().w(px(before)).flex_shrink_0());
        for column in visible {
            let label = &self.document.headers[column];
            let sort = self.sort.filter(|sort| sort.column == column);
            headers = headers.child(
                button(("sort-column", column), "", ButtonKind::Ghost, p, cx)
                    .accessibility_label(format!("Sort by {label}"))
                    .w(px(self.column_width(column)))
                    .h_full()
                    .rounded_none()
                    .px(ui(12.))
                    .when(column > 0, |button| {
                        button.border_l_1().border_color(p.color("border"))
                    })
                    .child(
                        div()
                            .w_full()
                            .text_center()
                            .text_size(ui(14.))
                            .font_weight(FontWeight::SEMIBOLD)
                            .truncate()
                            .child(label.clone()),
                    )
                    .when_some(sort, |button, sort| {
                        button.child(glyph(
                            if sort.descending {
                                "ArrowDown01Icon"
                            } else {
                                "ArrowUp01Icon"
                            },
                            12.,
                            p,
                        ))
                    })
                    .on_click(cx.listener(move |this, _, _, cx| {
                        this.sort = match this.sort {
                            Some(sort) if sort.column == column && !sort.descending => Some(Sort {
                                column,
                                descending: true,
                            }),
                            Some(sort) if sort.column == column => None,
                            _ => Some(Sort {
                                column,
                                descending: false,
                            }),
                        };
                        this.reorder(cx);
                    })),
            );
        }
        headers = headers.child(div().w(px(after)).flex_shrink_0());
        let body_height = if row_count == 0 {
            40. * unit
        } else {
            (0..row_count.min(8))
                .map(|row| self.row_height(row, window))
                .sum::<f32>()
                .min(320. * unit)
        };
        let owner = cx.entity().downgrade();
        let content = list(self.list.clone(), move |row, window, cx| {
            owner
                .update(cx, |this, cx| this.inline_row(row, window, cx))
                .unwrap_or_else(|_| div().into_any_element())
        })
        .w_full()
        .h_full();
        let width = (0..columns)
            .map(|column| self.column_width(column))
            .sum::<f32>()
            .max(180.);
        let data = TableData {
            headers: self.document.headers.clone(),
            rows: self
                .order
                .iter()
                .map(|&index| self.document.rows[index].clone())
                .collect(),
            markdown: self.document.original.clone(),
            span: None,
        };
        let actions = (self.inline.as_ref().unwrap().actions)(data, cx);
        let owner = cx.entity().downgrade();
        let measured_width = self.available;
        let mut root = div()
            .id("inline-rich-table")
            .role(Role::Table)
            .aria_label("Data table")
            .test_support()
            .track_focus(&self.focus)
            .relative()
            .w_full()
            .max_w_full()
            .min_w_0()
            .flex()
            .flex_col()
            .rounded(ui(6.))
            .overflow_hidden()
            .border_1()
            .border_color(p.color("border").opacity(0.4))
            .bg(p.color("popover"))
            .text_color(p.color("foreground"))
            .on_mouse_down(MouseButton::Left, |_, _, cx| cx.stop_propagation())
            .on_action(cx.listener(
                |this, _: &gpui_kit::component::input::SelectAll, window, cx| {
                    if this.focus.is_focused(window)
                        && !this.order.is_empty()
                        && !this.document.headers.is_empty()
                    {
                        this.selection = Some((
                            (0, 0),
                            (this.order.len() - 1, this.document.headers.len() - 1),
                        ));
                        cx.notify();
                    } else {
                        cx.propagate();
                    }
                },
            ))
            .on_action(
                cx.listener(|this, _: &gpui_kit::component::input::Copy, window, cx| {
                    if this.focus.is_focused(window) {
                        this.copy(cx);
                    } else {
                        cx.propagate();
                    }
                }),
            )
            .capture_key_down(cx.listener(|this, event: &KeyDownEvent, window, cx| {
                this.handle_key(event, window, cx);
            }));
        if self.document.rows.len() > 8 {
            root = root.child(
                div()
                    .flex()
                    .items_center()
                    .gap(ui(8.))
                    .px(ui(12.))
                    .pt(ui(8.))
                    .pb(ui(4.))
                    .child(
                        div()
                            .id("inline-table-filter")
                            .min_w_0()
                            .flex_1()
                            .child(Input::new(&self.query).aria_label("Filter table rows"))
                            .test_support(),
                    )
                    .child(caption(
                        format!("{row_count} / {}", self.document.rows.len()),
                        p,
                    )),
            );
        }
        let card = root
            .child(
                div()
                    .id("inline-table-horizontal")
                    .w_full()
                    .min_w_0()
                    .overflow_x_scroll()
                    .restrict_scroll_to_axis()
                    .track_scroll(&self.horizontal)
                    .on_scroll(cx.listener(|_, _, _, cx| cx.notify()))
                    .child(
                        div().w(px(width)).flex().flex_col().child(headers).child(
                            div()
                                .h(px(body_height))
                                .when(row_count == 0, |view| {
                                    view.child(caption("No matching rows", p))
                                })
                                .when(row_count > 0, |view| view.child(content)),
                        ),
                    ),
            )
            .child(
                div()
                    .flex()
                    .items_center()
                    .justify_between()
                    .gap(ui(8.))
                    .px(ui(8.))
                    .py(ui(3.))
                    .border_t_1()
                    .border_color(p.color("border"))
                    .child(caption(format!("{row_count} rows · {columns} columns"), p))
                    .child(actions),
            )
            .into_any_element();
        div()
            .w_full()
            .min_w_0()
            .relative()
            .child(card)
            .child(
                canvas(
                    move |bounds, _, cx| {
                        let width = f32::from(bounds.size.width);
                        if (measured_width - width).abs() <= 1. {
                            return;
                        }
                        let owner = owner.clone();
                        cx.defer(move |cx| {
                            let _ = owner.update(cx, |this, cx| {
                                if (this.available - width).abs() > 1. {
                                    this.available = width;
                                    this.height_widths.clear();
                                    this.row_heights.clear();
                                    this.list.reset(this.order.len());
                                    (this.inline.as_ref().unwrap().changed)(cx);
                                    cx.notify();
                                }
                            });
                        });
                    },
                    |_, _, _, _| {},
                )
                .absolute()
                .inset_0(),
            )
            .into_any_element()
    }
    fn inline_row(
        &mut self,
        row: usize,
        window: &mut Window,
        cx: &mut Context<Self>,
    ) -> AnyElement {
        let p = Palette::new(cx.theme().mode.is_dark());
        let source = self.order[row];
        let height = self.row_height(row, window);
        let mut view = div()
            .id(("inline-row", source))
            .role(Role::Row)
            .grid()
            .h(px(height))
            .when(row.is_multiple_of(2), |view| {
                view.bg(p.color("muted").opacity(0.35))
            })
            .when(row + 1 < self.order.len(), |view| {
                view.border_b_1()
                    .border_color(p.color("border").opacity(0.4))
            });
        let visible = visible_columns(
            &self.height_widths,
            -f32::from(self.horizontal.offset().x),
            self.available,
        );
        let before: f32 = self.height_widths[..visible.start].iter().sum();
        let after: f32 = self.height_widths[visible.end..].iter().sum();
        view = view
            .grid_cols_max_content((visible.len() + 2) as u16)
            .child(div().w(px(before)).flex_shrink_0());
        for column in visible {
            let inline = self.inline.as_ref().unwrap();
            let text = inline
                .cells
                .get(source + 1)
                .and_then(|cells| cells.get(column))
                .cloned()
                .unwrap_or_else(|| {
                    self.document.rows[source]
                        .get(column)
                        .cloned()
                        .unwrap_or_default()
                });
            let value = self.document.rows[source]
                .get(column)
                .cloned()
                .unwrap_or_default();
            let selected = self.selection.is_some_and(|(a, b)| {
                row >= a.0.min(b.0)
                    && row <= a.0.max(b.0)
                    && column >= a.1.min(b.1)
                    && column <= a.1.max(b.1)
            });
            view = view.child(
                div()
                    .id(("inline-cell", source * self.document.headers.len() + column))
                    .role(Role::Cell)
                    .aria_label(value)
                    .test_support()
                    .w(px(self.column_width(column)))
                    .h_full()
                    .px(ui(12.))
                    .py(ui(8.))
                    .min_w_0()
                    .when(column > 0, |view| {
                        view.border_l_1().border_color(p.color("border"))
                    })
                    .when(selected, |view| view.bg(p.color("accent")))
                    .text_align(
                        inline
                            .alignments
                            .get(column)
                            .copied()
                            .unwrap_or(TextAlign::Left),
                    )
                    .child(
                        TextView::markdown(
                            ("cell-text", source * self.document.headers.len() + column),
                            text,
                        )
                        .markdown_extensions(inline.extensions.clone())
                        .text_size(ui(14.))
                        .line_height(ui(20.))
                        .style(
                            TextViewStyle::from_theme(&gpui_kit::base::Theme::global(cx))
                                .with_paragraph_gap(ui(0.)),
                        )
                        .on_link_click(|url, _, _, cx| {
                            if crate::host::is_external_url(url.as_ref()) {
                                cx.open_url(url);
                            }
                        }),
                    )
                    .on_mouse_down(
                        MouseButton::Left,
                        cx.listener(move |this, event: &MouseDownEvent, window, cx| {
                            this.focus.focus(window, cx);
                            let cell = (row, column);
                            this.selection = Some(if event.modifiers.shift {
                                (this.selection.map_or(cell, |v| v.0), cell)
                            } else {
                                (cell, cell)
                            });
                            cx.notify();
                        }),
                    )
                    .on_mouse_move(cx.listener(move |this, event: &MouseMoveEvent, _, cx| {
                        if event.pressed_button == Some(MouseButton::Left)
                            && let Some((anchor, _)) = this.selection
                        {
                            this.selection = Some((anchor, (row, column)));
                            cx.notify();
                        }
                    })),
            );
        }
        view.child(div().w(px(after)).flex_shrink_0())
            .into_any_element()
    }
}
