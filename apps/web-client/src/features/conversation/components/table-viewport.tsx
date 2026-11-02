import { ArrowDown02Icon, ArrowUp02Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useVirtualizer } from "@tanstack/react-virtual";

import { type ReactNode, useEffect, useMemo, useRef, useState } from "react";
import { tableAction } from "@/features/conversation/lib/rich-content-actions";
import {
  columnMinimums,
  fitsColumns,
  isTableNumber,
  type TableSort,
} from "@/features/conversation/lib/table-data";
import { cn } from "@/lib/utils";

export interface TableCell {
  text: string;
  content?: ReactNode;
  align?: "left" | "center" | "right" | "start" | "end";
}
export interface TableColumn extends TableCell {
  id: string;
  width?: number;
}

// OpenMausBot 0.1.137 RichTable.tsx: fit short tables and virtualize above 80 rows.
export function TableViewport({
  columns,
  rows,
  order,
  name,
  wrap,
  large,
  sort,
  onSort,
  direction = "ltr",
}: {
  columns: TableColumn[];
  rows: TableCell[][];
  order: number[];
  name: string;
  wrap: boolean;
  large: boolean;
  sort: TableSort;
  onSort: (column: number) => void;
  direction?: "ltr" | "rtl";
}) {
  const card = !large;
  const scroll = useRef<HTMLDivElement>(null);
  const heading = useRef<HTMLTableSectionElement>(null);
  const [headingHeight, setHeadingHeight] = useState(40);
  const [available, setAvailable] = useState<number | null>(null);
  useEffect(() => {
    if (!heading.current) return;
    const observer = new ResizeObserver(([entry]) => {
      if (entry) setHeadingHeight(entry.target.getBoundingClientRect().height);
    });
    observer.observe(heading.current);
    return () => observer.disconnect();
  }, []);
  useEffect(() => {
    const element = scroll.current;
    if (!element) return;
    const observer = new ResizeObserver(() => setAvailable(element.clientWidth || null));
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  const virtual = order.length > 80;
  const minimums = useMemo(
    () =>
      columnMinimums(
        columns.map((column) => column.text),
        rows.map((row) => row.map((cell) => cell.text)),
      ),
    [columns, rows],
  );
  const fit = fitsColumns({ wrap, virtual, minimums, available });
  const widths = useMemo(
    () =>
      columns.map(
        (column, index) =>
          column.width ??
          Math.min(
            320,
            Math.max(
              140,
              Math.max(
                column.text.length,
                ...rows.slice(0, 100).map((row) => Math.min(40, row[index]?.text.length ?? 0)),
              ) *
                7 +
                40,
            ),
          ),
      ),
    [columns, rows],
  );
  const numeric = useMemo(
    () =>
      columns.map((_, index) => {
        const nonempty = rows
          .slice(0, 200)
          .map((row) => row[index]?.text.trim() ?? "")
          .filter(Boolean);
        return nonempty.length > 0 && nonempty.every(isTableNumber);
      }),
    [columns, rows],
  );
  const virtualizer = useVirtualizer({
    count: order.length,
    getScrollElement: () => scroll.current,
    estimateSize: () => 42,
    getItemKey: (index) => order[index] ?? index,
    overscan: 6,
    enabled: virtual,
    initialRect: { width: 800, height: 400 },
    scrollMargin: headingHeight,
  });
  // biome-ignore lint/correctness/useExhaustiveDependencies: Sorting and filtering reset the viewport when the order changes.
  useEffect(() => {
    if (scroll.current) scroll.current.scrollTop = 0;
  }, [order]);
  // biome-ignore lint/correctness/useExhaustiveDependencies: Wrapping and column-width changes invalidate measured row heights.
  useEffect(() => {
    virtualizer.measure();
  }, [wrap, widths, virtualizer]);
  const items = virtual
    ? virtualizer.getVirtualItems()
    : order.map((key, index) => ({ key, index, start: 0, end: 0 }));
  const before =
    virtual && items.length ? Math.max(0, (items[0]?.start ?? headingHeight) - headingHeight) : 0;
  const after =
    virtual && items.length
      ? Math.max(0, virtualizer.getTotalSize() - (items.at(-1)?.end ?? 0) + headingHeight)
      : 0;
  const alignment = (column: TableColumn, index: number) =>
    column.align ?? (numeric[index] || direction === "rtl" ? "right" : "left");
  const arrow = (index: number, className?: string) =>
    sort?.column === index && sort.descending ? (
      <HugeiconsIcon icon={ArrowDown02Icon} size={12} className={className} aria-hidden="true" />
    ) : (
      <HugeiconsIcon
        icon={ArrowUp02Icon}
        size={12}
        className={cn(className, sort?.column !== index && !card && "opacity-35")}
        aria-hidden="true"
      />
    );
  return (
    <section
      ref={scroll}
      // biome-ignore lint/a11y/noNoninteractiveTabindex: The table scroll region needs keyboard panning.
      tabIndex={0}
      aria-label={name}
      data-fit={fit || undefined}
      className={cn(
        "overflow-auto overscroll-x-contain focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring/60",
        card && !fit && "[mask-image:linear-gradient(90deg,#000_calc(100%-40px),transparent)]",
      )}
      style={{ maxHeight: large ? "65dvh" : virtual || !wrap ? 400 : undefined }}
    >
      <table
        dir={direction}
        aria-label={name}
        aria-rowcount={order.length + 1}
        className={cn(
          "w-full border-separate border-spacing-0 text-[14px]",
          fit ? "table-auto" : "table-fixed",
          card && "leading-5",
        )}
        style={fit ? undefined : { minWidth: widths.reduce((a, b) => a + b, 0) }}
      >
        {!fit && (
          <colgroup>
            {columns.map((column, index) => (
              <col key={column.id} style={{ width: widths[index] }} />
            ))}
          </colgroup>
        )}
        <thead ref={heading} className="sticky top-0 z-10 bg-composer">
          <tr aria-rowindex={1}>
            {columns.map((column, index) => (
              <th
                key={column.id}
                scope="col"
                aria-sort={
                  sort?.column === index ? (sort.descending ? "descending" : "ascending") : "none"
                }
                className={
                  card
                    ? "px-4 py-2.5 align-bottom font-semibold"
                    : "h-10 border-b border-border/60 px-3 py-2 font-medium"
                }
                style={{ textAlign: alignment(column, index) }}
              >
                <div
                  className="break-words [overflow-wrap:anywhere]"
                  style={fit ? { minWidth: minimums[index] } : undefined}
                >
                  {card ? (
                    <button
                      type="button"
                      className={cn(
                        "group/th inline-flex max-w-full items-center gap-1 text-start [text-align:inherit] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60",
                        card ? "font-semibold" : "font-medium",
                      )}
                      aria-label={`Urutkan ${column.text || index + 1}`}
                      title={`Urutkan ${column.text || index + 1}`}
                      onClick={() => onSort(index)}
                    >
                      <span dir="auto">
                        {column.content ?? (column.text || `Kolom ${index + 1}`)}
                      </span>
                      {arrow(
                        index,
                        cn(
                          "shrink-0 text-(--text-tertiary) transition-opacity",
                          sort?.column === index
                            ? "opacity-100"
                            : "opacity-0 group-hover/th:opacity-100 group-focus-within/th:opacity-100 touch:opacity-100",
                        ),
                      )}
                    </button>
                  ) : (
                    <>
                      <span dir="auto">
                        {column.content ?? (column.text || `Kolom ${index + 1}`)}
                      </span>
                      <button
                        type="button"
                        className={cn(tableAction, "ms-1 inline-flex align-middle")}
                        aria-label={`Urutkan ${column.text || index + 1}`}
                        title={`Urutkan ${column.text || index + 1}`}
                        onClick={() => onSort(index)}
                      >
                        {arrow(index)}
                      </button>
                    </>
                  )}
                </div>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {before > 0 && (
            // biome-ignore lint/a11y/noAriaHiddenOnFocusable: Virtual spacer rows contain no focusable elements.
            <tr aria-hidden="true">
              <td colSpan={columns.length} style={{ height: before, padding: 0 }} />
            </tr>
          )}
          {items.map((item) => (
            <tr
              key={item.key}
              data-index={item.index}
              ref={virtual ? virtualizer.measureElement : undefined}
              aria-rowindex={item.index + 2}
              className={
                card
                  ? undefined
                  : cn(item.index % 2 && "bg-foreground/[0.03]", "hover:bg-secondary/70")
              }
            >
              {columns.map((column, index) => {
                const sourceIndex = order[item.index];
                const cell = sourceIndex === undefined ? undefined : rows[sourceIndex]?.[index];
                return (
                  <td
                    key={column.id}
                    className={
                      card
                        ? "border-t-[0.5px] border-foreground/[0.07] px-4 py-2.5 align-top tabular-nums"
                        : "border-b border-border/20 px-3 py-2.5 align-top tabular-nums"
                    }
                    style={{ textAlign: cell?.align ?? alignment(column, index) }}
                  >
                    <div
                      dir="auto"
                      title={!wrap ? cell?.text : undefined}
                      className={
                        wrap
                          ? "whitespace-pre-wrap break-words [overflow-wrap:anywhere]"
                          : "truncate"
                      }
                    >
                      {cell?.content ?? cell?.text}
                    </div>
                  </td>
                );
              })}
            </tr>
          ))}
          {after > 0 && (
            // biome-ignore lint/a11y/noAriaHiddenOnFocusable: Virtual spacer rows contain no focusable elements.
            <tr aria-hidden="true">
              <td colSpan={columns.length} style={{ height: after, padding: 0 }} />
            </tr>
          )}
        </tbody>
      </table>
      {order.length === 0 && (
        <p className="p-8 text-center text-sm text-muted-foreground">
          {rows.length ? "Tidak ada hasil yang cocok." : "Tabel kosong."}
        </p>
      )}
    </section>
  );
}
