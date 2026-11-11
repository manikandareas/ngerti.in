import { type ReactNode, useEffect, useRef, useState } from "react";

/** Mount a whole group before it enters view, preserving its space while it is offscreen. */
export function DeferredEntries({
  count,
  initial,
  columns,
  mobile,
  activateNext,
  children,
}: {
  count: number;
  initial: boolean;
  columns: number;
  mobile: boolean;
  activateNext?: () => void;
  children: ReactNode;
}) {
  const element = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(initial);
  const active = initial || visible;
  useEffect(() => {
    if (active || !element.current) return;
    if (typeof IntersectionObserver === "undefined") {
      setVisible(true);
      return;
    }
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          setVisible(true);
          observer.disconnect();
        }
      },
      { root: element.current.closest(".marketplace-pane"), rootMargin: "600px 0px" },
    );
    observer.observe(element.current);
    return () => observer.disconnect();
  }, [active]);
  const rows = Math.ceil(count / columns);
  return (
    <div
      ref={element}
      className="marketplace-deferred-entries"
      style={{ minHeight: rows * (mobile ? 88 : 72) + Math.max(0, rows - 1) * (mobile ? 4 : 8) }}
      onFocusCapture={activateNext}
    >
      {active && children}
    </div>
  );
}
