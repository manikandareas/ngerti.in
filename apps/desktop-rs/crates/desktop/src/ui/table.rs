use crate::{
    models::content::{ColumnLayout, Sort, TableDocument},
    ui::{controls::*, theme::Palette},
};
use gpui_kit::{
    component::{
        ActiveTheme, WindowExt,
        input::{Input, InputEvent, InputState},
    },
    prelude::FluentBuilder,
    *,
};
use std::{collections::HashMap, ops::Range, sync::Arc, time::Duration};
mod inline;
pub(crate) use inline::InlineTable;

/// Include one neighboring column so a wheel gesture never exposes a blank edge.
fn visible_columns(widths: &[f32], offset: f32, viewport: f32) -> Range<usize> {
    if widths.is_empty() {
        return 0..0;
    }
    let total: f32 = widths.iter().sum();
    let left = offset.clamp(0., (total - viewport).max(0.));
    let right = left + viewport.max(0.);
    let mut x = 0.;
    let mut first = None;
    let mut end = 0;
    for (i, width) in widths.iter().enumerate() {
        if x + width > left && first.is_none() {
            first = Some(i);
        }
        if x < right {
            end = i + 1;
        }
        x += width;
    }
    first.unwrap_or(widths.len() - 1).saturating_sub(1)..(end + 1).min(widths.len())
}

pub struct RichTable {
    pub document: Arc<TableDocument>,
    query: Entity<InputState>,
    columns: Vec<ColumnLayout>,
    available: f32,
    horizontal: ScrollHandle,
    height_widths: Vec<f32>,
    row_heights: HashMap<usize, f32>,
    order: Arc<Vec<usize>>,
    sort: Option<Sort>,
    wrap: bool,
    expanded: bool,
    selection: Option<((usize, usize), (usize, usize))>,
    focus: FocusHandle,
    list: ListState,
    task: Option<Task<()>>,
    _subscription: Subscription,
    inline: Option<InlineTable>,
}
impl RichTable {
    /// Current filtered/sorted rows for an explicit submit-time table snapshot.
    pub fn csv_snapshot(&self) -> String {
        self.document.csv(&self.order)
    }
    pub fn new(document: Arc<TableDocument>, window: &mut Window, cx: &mut Context<Self>) -> Self {
        let query = cx.new(|cx| InputState::new(window, cx).placeholder("Filter rows…"));
        let count = document.rows.len();
        let order = Arc::new((0..count).collect());
        let subscription = cx.subscribe(&query, |this, _, event: &InputEvent, cx| {
            if matches!(event, InputEvent::Change) {
                this.reorder(cx);
            }
        });
        let columns = document.columns();
        Self {
            columns,
            available: 800.,
            horizontal: ScrollHandle::new(),
            height_widths: Vec::new(),
            row_heights: HashMap::new(),
            document,
            query,
            order,
            sort: None,
            wrap: true,
            expanded: false,
            selection: None,
            focus: cx.focus_handle().tab_stop(true),
            list: ListState::new(count, ListAlignment::Top, px(320.)),
            task: None,
            _subscription: subscription,
            inline: None,
        }
    }
    fn column_width(&self, index: usize) -> f32 {
        if self.inline.is_some() {
            let available = (self.available - 2.).max(1.);
            let natural: f32 = self.columns.iter().map(|column| column.width).sum();
            let floor: f32 = self.columns.iter().map(|column| column.minimum).sum();
            return if natural <= available {
                self.columns[index].width + (available - natural) / self.columns.len().max(1) as f32
            } else if floor < available {
                self.columns[index].minimum
                    + (self.columns[index].width - self.columns[index].minimum)
                        * (available - floor)
                        / (natural - floor).max(1.)
            } else {
                self.columns[index].minimum
            };
        }
        let total: f32 = self.columns.iter().map(|c| c.minimum + 24.).sum();
        if self.wrap && self.order.len() <= 80 && total <= self.available {
            self.columns[index].minimum
                + 24.
                + (self.available - total) / self.columns.len().max(1) as f32
        } else {
            self.columns[index].width
        }
    }
    fn expand(&mut self, window: &mut Window, cx: &mut Context<Self>) {
        if self.expanded {
            return;
        }
        let expanded = cx.new(|cx| Self::new(self.document.clone(), window, cx));
        let query = self.query.read(cx).value().to_string();
        expanded.update(cx, |table, cx| {
            table
                .query
                .update(cx, |input, cx| input.set_value(query, window, cx));
            table.order = self.order.clone();
            table.sort = self.sort;
            table.wrap = self.wrap;
            table.selection = self.selection;
            table.list.reset(table.order.len());
            table.expanded = true;
        });
        let parent = cx.entity().downgrade();
        let width = window.viewport_size().width - px(64.);
        let height = window.viewport_size().height - px(180.);
        window.open_dialog(cx, move |dialog, _, _| {
            let copy = expanded.clone();
            let parent = parent.clone();
            dialog
                .title("Table")
                .width(width)
                .margin_top(px(32.))
                .child(div().h(height).child(expanded.clone()))
                .on_close(move |_, window, cx| {
                    let state = copy.read(cx);
                    let query = state.query.read(cx).value().to_string();
                    let order = state.order.clone();
                    let sort = state.sort;
                    let wrap = state.wrap;
                    let selection = state.selection;
                    let _ = parent.update(cx, |table, cx| {
                        table
                            .query
                            .update(cx, |input, cx| input.set_value(query, window, cx));
                        table.order = order;
                        table.sort = sort;
                        table.wrap = wrap;
                        table.selection = selection;
                        table.list.reset(table.order.len());
                        table.focus.focus(window, cx);
                        cx.notify();
                    });
                })
        });
    }
    fn reorder(&mut self, cx: &mut Context<Self>) {
        let query = self.query.read(cx).value().to_string();
        let document = self.document.clone();
        let sort = self.sort;
        if document.rows.len() <= 200 {
            self.install_order(document.order(&query, sort), cx);
            return;
        }
        self.task = Some(cx.spawn(async move |view, cx| {
            cx.background_executor()
                .timer(Duration::from_millis(80))
                .await;
            let order = cx
                .background_executor()
                .spawn(async move { document.order(&query, sort) })
                .await;
            let _ = view.update(cx, |this, cx| {
                this.install_order(order, cx);
            });
        }));
    }
    fn install_order(&mut self, order: Vec<usize>, cx: &mut Context<Self>) {
        self.order = Arc::new(order);
        self.selection = None;
        self.list.reset(self.order.len());
        if let Some(inline) = &self.inline {
            (inline.changed)(cx);
        }
        cx.notify();
    }
    fn handle_key(&mut self, event: &KeyDownEvent, window: &mut Window, cx: &mut Context<Self>) {
        if !self.focus.is_focused(window) {
            return;
        }
        if event.keystroke.modifiers.platform && event.keystroke.key == "c" {
            self.copy(cx);
            cx.stop_propagation();
        } else if event.keystroke.modifiers.platform
            && event.keystroke.key == "a"
            && !self.order.is_empty()
            && !self.document.headers.is_empty()
        {
            self.selection = Some((
                (0, 0),
                (self.order.len() - 1, self.document.headers.len() - 1),
            ));
            cx.stop_propagation();
            cx.notify();
        } else {
            let key = event.keystroke.key.as_str();
            if matches!(key, "left" | "right") {
                let mut offset = self.horizontal.offset();
                offset.x += px(if key == "left" { 80. } else { -80. });
                self.horizontal.set_offset(offset);
                cx.stop_propagation();
                cx.notify();
            } else if matches!(key, "up" | "down" | "pageup" | "pagedown" | "home" | "end")
                && !self.order.is_empty()
            {
                let index = self
                    .selection
                    .map_or(self.list.logical_scroll_top().item_ix, |s| s.1.0);
                let step = if matches!(key, "pageup" | "pagedown") {
                    10
                } else {
                    1
                };
                let target = match key {
                    "home" => 0,
                    "end" => self.order.len() - 1,
                    "up" | "pageup" => index.saturating_sub(step),
                    _ => (index + step).min(self.order.len() - 1),
                };
                let column = self.selection.map_or(0, |s| s.1.1);
                let anchor = if event.keystroke.modifiers.shift {
                    self.selection.map_or((index, column), |s| s.0)
                } else {
                    (target, column)
                };
                self.selection = Some((anchor, (target, column)));
                self.list.scroll_to_reveal_item(target);
                cx.stop_propagation();
                cx.notify();
            }
        }
    }
    fn copy(&self, cx: &mut App) {
        let text = if let Some((a, b)) = self.selection {
            self.document.selection(&self.order, a, b)
        } else {
            self.document.csv(&self.order)
        };
        cx.write_to_clipboard(ClipboardItem::new_string(text));
    }
    fn row_height(&mut self, row: usize, window: &Window) -> f32 {
        if !self.wrap {
            return 42.;
        }
        let source = self.order[row];
        if let Some(height) = self.row_heights.get(&source) {
            return *height;
        }
        let style = window.text_style();
        let mut height = 42f32;
        for (column, width) in self.height_widths.iter().enumerate() {
            let text = self.document.rows[source]
                .get(column)
                .map_or("", String::as_str);
            if let Ok(lines) = window.text_system().shape_text(
                text.to_owned().into(),
                px(14.),
                &[style.to_run(text.len())],
                Some(px((width - 24.).max(1.))),
                None,
            ) {
                let text_height: f32 = lines
                    .iter()
                    .map(|line| f32::from(line.size(px(20.)).height))
                    .sum();
                height = height.max(text_height + 17.);
            }
        }
        // Heights depend on all columns, including clipped wrapped cells. Keep
        // horizontal movement stable without retaining all 10,000 row layouts.
        if self.row_heights.len() >= 256 {
            self.row_heights.clear();
        }
        self.row_heights.insert(source, height);
        height
    }
    fn cell(
        &self,
        row: usize,
        column: usize,
        height: f32,
        p: Palette,
        cx: &mut Context<Self>,
    ) -> AnyElement {
        let value = self.document.rows[self.order[row]]
            .get(column)
            .cloned()
            .unwrap_or_default();
        let selected = self.selection.is_some_and(|(a, b)| {
            row >= a.0.min(b.0)
                && row <= a.0.max(b.0)
                && column >= a.1.min(b.1)
                && column <= a.1.max(b.1)
        });
        div()
            .id(("cell", row * self.document.headers.len() + column))
            .role(Role::Cell)
            .aria_label(value.clone())
            .w(px(self.column_width(column)))
            .min_h(px(42.))
            .h(px(height))
            .text_size(px(14.))
            .line_height(px(20.))
            .when(self.columns[column].numeric, |v| {
                v.text_align(TextAlign::Right)
            })
            .px_3()
            .py_2()
            .border_b_1()
            .border_r_1()
            .border_color(p.color("border"))
            .when(selected, |v| v.bg(p.color("accent")))
            .child(
                div()
                    .w_full()
                    .when(!self.wrap, |v| v.whitespace_nowrap().overflow_hidden())
                    .child(value),
            )
            .on_mouse_down(
                MouseButton::Left,
                cx.listener(move |this, event: &MouseDownEvent, window, cx| {
                    this.focus.focus(window, cx);
                    this.selection = Some(if event.modifiers.shift {
                        (this.selection.map_or((row, column), |s| s.0), (row, column))
                    } else {
                        ((row, column), (row, column))
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
            }))
            .into_any_element()
    }
}
impl Render for RichTable {
    fn render(&mut self, window: &mut Window, cx: &mut Context<Self>) -> impl IntoElement {
        if self.inline.is_some() {
            return self.render_inline(window, cx);
        }
        let p = Palette::new(cx.theme().mode.is_dark());
        let rows = self.order.len();
        let columns = self.document.headers.len();
        let widths: Vec<_> = (0..columns).map(|i| self.column_width(i)).collect();
        if self.height_widths != widths {
            self.row_heights.clear();
            self.height_widths = widths.clone();
        }
        let visible = visible_columns(
            &widths,
            -f32::from(self.horizontal.offset().x),
            self.available,
        );
        let before: f32 = widths[..visible.start].iter().sum();
        let after: f32 = widths[visible.end..].iter().sum();
        let handle = cx.entity().downgrade();
        let mut headers = row()
            .gap_0()
            .flex_nowrap()
            .child(div().w(px(before)).flex_shrink_0());
        for i in visible.clone() {
            let label = &self.document.headers[i];
            headers = headers.child(
                button(
                    ("sort-column", i),
                    format!(
                        "{label}{}",
                        self.sort
                            .filter(|s| s.column == i)
                            .map_or("", |s| if s.descending { " ↓" } else { " ↑" })
                    ),
                    ButtonKind::Ghost,
                    p,
                    cx,
                )
                .accessibility_label(format!("Sort by {label}"))
                .w(px(self.column_width(i)))
                .justify_start()
                .when(self.columns[i].numeric, |v| v.justify_end())
                .on_click(cx.listener(move |this, _, _, cx| {
                    this.sort = match this.sort {
                        Some(s) if s.column == i && !s.descending => Some(Sort {
                            column: i,
                            descending: true,
                        }),
                        Some(s) if s.column == i => None,
                        _ => Some(Sort {
                            column: i,
                            descending: false,
                        }),
                    };
                    this.reorder(cx);
                })),
            );
        }
        headers = headers.child(div().w(px(after)).flex_shrink_0());
        let list = list(self.list.clone(), move |i, window, cx| {
            handle
                .update(cx, |this, cx| {
                    let height = this.row_height(i, window);
                    let mut row = div()
                        .flex()
                        .items_start()
                        .h(px(height))
                        .child(div().w(px(before)).flex_shrink_0());
                    for column in visible.clone() {
                        row = row.child(this.cell(i, column, height, p, cx));
                    }
                    row.child(div().w(px(after)).flex_shrink_0())
                        .into_any_element()
                })
                .unwrap_or_else(|_| div().into_any_element())
        })
        .size_full();
        let view = cx.entity().downgrade();
        let measured_width = self.available;
        let table_width = (0..columns)
            .map(|i| self.column_width(i))
            .sum::<f32>()
            .max(180.);
        div()
            .relative()
            .id("rich-table")
            .role(Role::Table)
            .aria_label("Data table")
            .track_focus(&self.focus)
            .border_1()
            .border_color(rgba(0))
            .focus_visible(|style| style.border_color(p.color("ring")))
            .flex()
            .flex_col()
            .size_full()
            .gap_2()
            .capture_key_down(cx.listener(|this, event: &KeyDownEvent, window, cx| {
                this.handle_key(event, window, cx);
            }))
            .child(
                row()
                    .child(
                        div()
                            .w(px(220.))
                            .child(Input::new(&self.query).aria_label("Filter table rows")),
                    )
                    .child(caption(format!("{rows} rows · {columns} columns"), p))
                    .child(
                        button(
                            "table-wrap",
                            if self.wrap { "Wrap on" } else { "Wrap off" },
                            ButtonKind::Default,
                            p,
                            cx,
                        )
                        .on_click(cx.listener(|this, _, _, cx| {
                            this.wrap = !this.wrap;
                            this.row_heights.clear();
                            this.list.reset(this.order.len());
                            cx.notify();
                        })),
                    )
                    .child(
                        button(
                            "table-copy",
                            "Copy table / selection",
                            ButtonKind::Default,
                            p,
                            cx,
                        )
                        .on_click(cx.listener(|this, _, _, cx| this.copy(cx))),
                    )
                    .child(
                        button(
                            "table-expand",
                            if self.expanded {
                                "Expanded table"
                            } else {
                                "Expand table"
                            },
                            ButtonKind::Default,
                            p,
                            cx,
                        )
                        .on_click(cx.listener(|this, _, window, cx| this.expand(window, cx))),
                    ),
            )
            .child(
                div()
                    .id("table-horizontal")
                    .flex_1()
                    .min_h_0()
                    .overflow_x_scroll()
                    .restrict_scroll_to_axis()
                    .track_scroll(&self.horizontal)
                    .on_scroll(cx.listener(|_, _, _, cx| cx.notify()))
                    .child(
                        div()
                            .w(px(table_width))
                            .h_full()
                            .flex()
                            .flex_col()
                            .child(headers)
                            .child(div().flex_1().min_h_0().child(list)),
                    ),
            )
            .child(
                canvas(
                    move |bounds, _, cx| {
                        let width = f32::from(bounds.size.width);
                        if (measured_width - width).abs() <= 1. {
                            return;
                        }
                        let view = view.clone();
                        cx.defer(move |cx| {
                            let _ = view.update(cx, |this, cx| {
                                if (this.available - width).abs() > 1. {
                                    this.available = width;
                                    this.list.reset(this.order.len());
                                    cx.notify();
                                }
                            });
                        });
                    },
                    |_, _, _, _| {},
                )
                .absolute()
                .top_0()
                .left_0()
                .size_full(),
            )
            .into_any_element()
    }
}

#[cfg(test)]
mod tests {
    use super::visible_columns;

    #[test]
    fn column_window_preserves_space_and_covers_viewport() {
        let widths: Vec<f32> = (0..40).map(|i| 100. + i as f32 * 3.).collect();
        let total: f32 = widths.iter().sum();
        for offset in (0..8000).step_by(80) {
            let range = visible_columns(&widths, offset as f32, 900.);
            let before: f32 = widths[..range.start].iter().sum();
            let visible: f32 = widths[range.clone()].iter().sum();
            let after: f32 = widths[range.end..].iter().sum();
            let left = (offset as f32).min(total - 900.);
            assert!(before <= left && before + visible >= left + 900.);
            assert!((before + visible + after - total).abs() < 0.01);
            assert!(range.len() <= 12);
        }
        assert_eq!(visible_columns(&[], 0., 900.), 0..0);
        assert_eq!(visible_columns(&[200.], 500., 900.), 0..1);
    }
}
