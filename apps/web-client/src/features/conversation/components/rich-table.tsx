import { Check, Copy, Download, Maximize2, Search, WrapText, X } from "lucide-react";
import {
  type ReactNode,
  useDeferredValue,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";
import {
  type TableCell,
  type TableColumn,
  TableViewport,
} from "@/features/conversation/components/table-viewport";
import {
  downloadContent,
  tableAction,
  useContentCopy,
} from "@/features/conversation/lib/rich-content-actions";
import { type TableSort, tableCsv, tableRowOrder } from "@/features/conversation/lib/table-data";
import { cn } from "@/lib/utils";

function TableDialog({
  title,
  onClose,
  returnFocus,
  children,
}: {
  title: string;
  onClose: () => void;
  returnFocus: HTMLElement | null;
  children: ReactNode;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const id = useId();
  useEffect(() => {
    const element = dialog.current;
    element?.showModal();
    return () => {
      element?.close();
      if (returnFocus?.isConnected) returnFocus.focus();
    };
  }, [returnFocus]);
  return createPortal(
    <dialog
      ref={dialog}
      aria-labelledby={id}
      onCancel={onClose}
      onClose={onClose}
      onKeyDown={(event) => {
        if (event.key === "Escape") event.stopPropagation();
      }}
      className="m-auto flex max-h-[94dvh] w-[min(96vw,1400px)] max-w-none flex-col overflow-hidden rounded-2xl border border-border bg-panel p-0 text-foreground shadow-2xl backdrop:bg-black/55"
    >
      <header className="flex shrink-0 items-center justify-between gap-3 border-b border-border/40 px-4 py-3">
        <h2 id={id} className="min-w-0 truncate text-sm font-medium">
          {title}
        </h2>
        <button type="button" onClick={onClose} className={tableAction} aria-label="Tutup tabel">
          <X size={16} aria-hidden="true" />
        </button>
      </header>
      <div className="min-h-0 overflow-auto p-3 sm:p-5">{children}</div>
    </dialog>,
    document.body,
  );
}

// OpenMausBot 0.1.137 RichTable: Simple reply cards, with the same expanded table.
export function RichTable({
  columns,
  rows,
  name = "Tabel",
  direction = "ltr",
  expanded = false,
}: {
  columns: TableColumn[];
  rows: TableCell[][];
  name?: string;
  direction?: "ltr" | "rtl";
  expanded?: boolean;
}) {
  const [query, setQuery] = useState("");
  const deferredQuery = useDeferredValue(query);
  const [sort, setSort] = useState<TableSort>(null);
  const [wrap, setWrap] = useState(true);
  const [open, setOpen] = useState(false);
  const trigger = useRef<HTMLButtonElement | null>(null);
  const values = useMemo(() => rows.map((row) => row.map((cell) => cell.text)), [rows]);
  const order = useMemo(
    () => tableRowOrder(values, deferredQuery, sort),
    [values, deferredQuery, sort],
  );
  const csv = () =>
    tableCsv(
      columns.map((column) => column.text),
      order.map((index) => values[index] ?? []),
    );
  const { state: copied, copy } = useContentCopy(csv, 2500);
  function download() {
    const filename = `${
      name
        .replace(/\.(csv|tsv)$/i, "")
        .replace(/[\\/:*?"<>|]/g, "_")
        .slice(0, 150) || "table"
    }.csv`;
    downloadContent(filename, ["\uFEFF", csv()], "text/csv;charset=utf-8");
  }
  function sortBy(column: number) {
    setSort(
      sort?.column !== column
        ? { column, descending: false }
        : !sort.descending
          ? { column, descending: true }
          : null,
    );
  }
  const status = (visible = false) =>
    copied !== "idle" && (
      <span
        role={copied === "failed" ? "alert" : "status"}
        className={visible ? undefined : "sr-only"}
      >
        {copied === "failed" ? "Gagal menyalin tabel." : "Tabel disalin."}
      </span>
    );
  const search = (className: string) => (
    <label className={className}>
      <Search size={13} aria-hidden="true" />
      <input
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        aria-label="Cari dalam tabel"
        placeholder="Cari dalam tabel"
        className="w-full min-w-0 bg-transparent py-1 text-xs text-foreground outline-none placeholder:text-(--text-tertiary) focus-visible:ring-1 focus-visible:ring-ring"
      />
    </label>
  );
  const count = (card = false) => (
    <span role="status" className={cn("shrink-0 tabular-nums", card && "text-[12px]")}>
      {order.length.toLocaleString()} dari {rows.length.toLocaleString()} baris · {columns.length}{" "}
      kolom
    </span>
  );
  const viewport = (large: boolean) => (
    <TableViewport
      columns={columns}
      rows={rows}
      order={order}
      name={name}
      wrap={wrap}
      large={large}
      sort={sort}
      direction={direction}
      onSort={sortBy}
    />
  );
  const actions = (plate: boolean) => (
    <>
      {!plate && (
        <button
          type="button"
          className={tableAction}
          aria-label="Bungkus teks"
          title="Bungkus teks"
          aria-pressed={wrap}
          onClick={() => setWrap(!wrap)}
        >
          <WrapText size={14} aria-hidden="true" />
        </button>
      )}
      <button
        type="button"
        className={cn(tableAction, plate && "size-6 min-h-6 min-w-6 rounded-full")}
        aria-label="Salin tabel"
        title="Salin tabel"
        onClick={() => void copy()}
      >
        {copied === "copied" ? (
          <Check size={14} aria-hidden="true" />
        ) : (
          <Copy size={14} aria-hidden="true" />
        )}
      </button>
      <button
        type="button"
        className={cn(tableAction, plate && "size-6 min-h-6 min-w-6 rounded-full")}
        aria-label="Unduh tabel"
        title="Unduh tabel"
        onClick={download}
      >
        <Download size={14} aria-hidden="true" />
      </button>
      {plate && (
        <button
          type="button"
          className={cn(tableAction, "size-6 min-h-6 min-w-6 rounded-full")}
          aria-label="Perbesar tabel"
          title="Perbesar tabel"
          onClick={(event) => {
            trigger.current = event.currentTarget;
            setOpen(true);
          }}
        >
          <Maximize2 size={14} aria-hidden="true" />
        </button>
      )}
    </>
  );
  const expandedView = (
    <div
      className="rich-table w-fit min-w-[min(100%,var(--chat-prose-max))] max-w-full overflow-hidden rounded-xl border border-border/50 bg-composer text-foreground"
      dir="ltr"
    >
      <div className="flex flex-wrap items-center gap-1 border-b border-border/40 px-2 py-1.5">
        {search("flex min-w-24 flex-1 items-center gap-2 px-1 text-muted-foreground")}
        {actions(false)}
      </div>
      {viewport(true)}
      <footer className="flex flex-wrap items-center justify-between gap-2 border-t border-border/40 px-3 py-2 text-[11px] text-muted-foreground">
        {count()}
        {status(true)}
      </footer>
    </div>
  );
  if (expanded) return <div className="chat-table">{expandedView}</div>;
  return (
    <>
      <div hidden={open} className="chat-table">
        <div
          data-table-card
          className="group/table relative w-full overflow-hidden rounded-[20px] bg-composer text-foreground shadow-[0_0_0_0.5px_var(--composer-ring),0_2px_8px_rgb(28_28_28/0.035)] touch:pt-11"
          dir="ltr"
        >
          <div className="table-plate absolute end-1.5 top-1.5 z-20 flex items-center gap-0.5 rounded-full bg-composer p-0.5 opacity-0 ring-[0.5px] ring-foreground/10 transition-opacity focus-within:opacity-100 group-hover/table:opacity-100 touch:end-1 touch:top-0 touch:bg-transparent touch:p-0 touch:opacity-100 touch:ring-0">
            {actions(true)}
          </div>
          {rows.length > 8 && (
            <div className="flex items-center gap-2 px-4 pb-1.5 text-(--text-tertiary)">
              {search("flex min-w-24 flex-1 items-center gap-2")}
              {count(true)}
            </div>
          )}
          {viewport(false)}
          {status()}
        </div>
      </div>
      {open && (
        <TableDialog title={name} returnFocus={trigger.current} onClose={() => setOpen(false)}>
          {expandedView}
        </TableDialog>
      )}
    </>
  );
}
