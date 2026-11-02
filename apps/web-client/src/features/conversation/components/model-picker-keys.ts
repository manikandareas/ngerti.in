import type { KeyboardEvent, PointerEvent } from "react";

// Adapted from OpenMausBot 0.1.137 model-menu-keys.ts and lib/menu-keys.ts.
export type ModelMenuTypeahead = { text: string; at: number };

function nextIndex(key: string, current: number, count: number) {
  if (!count) return null;
  if (key === "ArrowDown") return current < 0 ? 0 : (current + 1) % count;
  if (key === "ArrowUp") return current < 0 ? count - 1 : (current - 1 + count) % count;
  if (key === "Home") return 0;
  if (key === "End") return count - 1;
  return null;
}

export function modelMenuKey(
  event: KeyboardEvent<HTMLDivElement>,
  {
    query,
    typed,
    close,
  }: {
    query: string;
    typed: { current: ModelMenuTypeahead | null };
    close: () => void;
  },
) {
  if (
    event.nativeEvent.isComposing ||
    event.defaultPrevented ||
    !(event.target instanceof HTMLElement)
  )
    return;
  const menu = event.currentTarget;
  const target = event.target;
  const handled = () => {
    event.preventDefault();
    event.stopPropagation();
  };
  const goTo = (row?: HTMLElement) => {
    handled();
    row?.focus({ preventScroll: true });
    row?.scrollIntoView({ block: "nearest" });
  };
  if (event.key === "Tab") {
    const stops = [
      ...menu.querySelectorAll<HTMLElement>(
        "button:not(:disabled), input:not(:disabled), [tabindex]",
      ),
    ].filter((element) => element !== target && element.tabIndex >= 0);
    const follows = (first: Node, second: Node) =>
      Boolean(first.compareDocumentPosition(second) & Node.DOCUMENT_POSITION_FOLLOWING);
    if (!stops.some((stop) => (event.shiftKey ? follows(stop, target) : follows(target, stop)))) {
      handled();
      close();
    }
    return;
  }
  const rtl = getComputedStyle(menu).direction === "rtl";
  const pills = target.closest("[data-simple-effort]");
  if (pills) {
    const buttons = [...pills.querySelectorAll<HTMLButtonElement>("button:not(:disabled)")];
    const step =
      {
        ArrowRight: rtl ? "ArrowUp" : "ArrowDown",
        ArrowLeft: rtl ? "ArrowDown" : "ArrowUp",
        Home: "Home",
        End: "End",
      }[event.key] ?? "";
    const next = nextIndex(step, buttons.indexOf(target as HTMLButtonElement), buttons.length);
    if (next !== null) goTo(buttons[next]);
    return;
  }
  const search = menu.querySelector<HTMLInputElement>("[data-menu-search]");
  if (target instanceof HTMLInputElement && target !== search) return;
  const rows = [...menu.querySelectorAll<HTMLButtonElement>("[data-menu-row]:not(:disabled)")];
  const below = search
    ? rows.filter((row) => search.compareDocumentPosition(row) & Node.DOCUMENT_POSITION_FOLLOWING)
    : [];
  if (target === search) {
    if (event.key === "ArrowDown") goTo(below[0]);
    else if (event.key === "Enter") {
      handled();
      if (query.trim()) rows.find((row) => row.hasAttribute("aria-pressed"))?.click();
    }
    return;
  }
  const index = rows.indexOf(target as HTMLButtonElement);
  if (index < 0 && target !== menu) return;
  if (search && event.key === "ArrowUp" && target === below[0]) return goTo(search);
  const next = nextIndex(event.key, index, rows.length);
  if (next !== null) return goTo(rows[next]);
  if (
    event.key === (rtl ? "ArrowLeft" : "ArrowRight") &&
    target.matches("[data-simple-manage], [data-simple-sign-in]")
  ) {
    handled();
    target.click();
    return;
  }
  const continuing =
    event.key === " " && typed.current !== null && event.timeStamp - typed.current.at < 500;
  if (
    (!continuing && (event.key.length !== 1 || event.key === " ")) ||
    event.ctrlKey ||
    event.metaKey ||
    event.altKey
  )
    return;
  if (search) {
    search.focus();
    return;
  }
  if (continuing) handled();
  const text =
    typed.current && event.timeStamp - typed.current.at < 500
      ? typed.current.text + event.key
      : event.key;
  typed.current = { text, at: event.timeStamp };
  const lower = text.toLocaleLowerCase();
  const sameLetter = [...lower].every((letter) => letter === lower[0]);
  const prefix = sameLetter ? lower.slice(0, 1) : lower;
  const start = sameLetter ? index + 1 : Math.max(index, 0);
  for (let offset = 0; offset < rows.length; offset++) {
    const row = rows[(start + offset) % rows.length];
    if (row?.textContent?.trim().toLocaleLowerCase().startsWith(prefix)) return goTo(row);
  }
}

export function modelMenuPointerMove(event: PointerEvent<HTMLDivElement>) {
  if (event.pointerType !== "mouse" || !(event.target instanceof Element)) return;
  const row = event.target.closest<HTMLElement>("[data-menu-row]");
  const focused = document.activeElement;
  if (!row || row === focused || row.matches(":disabled") || !(focused instanceof HTMLElement))
    return;
  if (focused.matches("[data-menu-row]") && event.currentTarget.contains(focused))
    row.focus({ preventScroll: true });
}
