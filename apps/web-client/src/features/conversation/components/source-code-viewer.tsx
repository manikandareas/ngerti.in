import {
  ArrowDown01Icon,
  ArrowUp01Icon,
  Cancel01Icon,
  Copy01Icon,
  Search01Icon,
  TextWrapIcon,
  Tick02Icon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { type CSSProperties, useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import type { ThemedToken } from "shiki/core";
import { Button } from "@/components/ui/button";
import { highlightTokens } from "../lib/code-highlight";
import { getLanguageDisplayName } from "../lib/code-snippet";
import { useContentCopy } from "../lib/rich-content-actions";
import { searchSource } from "../lib/source-search";
import { SourceCodeLine } from "./source-code-line";
import "./source-code-viewer.css";

export default function SourceCodeViewer({
  code,
  language,
  name,
  truncated,
}: {
  code: string;
  language: string;
  name: string;
  truncated?: boolean;
}) {
  const root = useRef<HTMLElement>(null);
  const scroll = useRef<HTMLElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const [highlighted, setHighlighted] = useState<{
    code: string;
    language: string;
    tokens: ThemedToken[][];
  } | null>(null);
  const [wrap, setWrap] = useState(false);
  const [finding, setFinding] = useState(false);
  const [query, setQuery] = useState("");
  const deferredQuery = useDeferredValue(query);
  const [position, setPosition] = useState(0);
  const [bottom, setBottom] = useState(180);
  const { state: copied, copy } = useContentCopy(code);
  const lines = useMemo(() => code.split(/\r\n|\r|\n/), [code]);
  const matches = useMemo(() => searchSource(lines, deferredQuery), [lines, deferredQuery]);
  const matchesByLine = useMemo(() => {
    const grouped = new Map<number, typeof matches>();
    for (const match of matches) {
      const group = grouped.get(match.line) ?? [];
      group.push(match);
      grouped.set(match.line, group);
    }
    return grouped;
  }, [matches]);
  const active = matches.length
    ? ((position % matches.length) + matches.length) % matches.length
    : -1;
  const virtual = lines.length > 500;
  const columns = useMemo(
    () => lines.reduce((max, line) => Math.max(max, line.replaceAll("\t", "    ").length), 0),
    [lines],
  );
  const rows = useVirtualizer({
    count: virtual ? lines.length : 0,
    getScrollElement: () => scroll.current,
    estimateSize: () => 22,
    overscan: 12,
    paddingStart: 120,
    paddingEnd: bottom,
  });
  const tokens =
    highlighted?.code === code && highlighted.language === language
      ? highlighted.tokens
      : undefined;
  useEffect(() => {
    if (language === "text") return;
    let current = true;
    void highlightTokens(code, language)
      .then((tokens) => {
        if (current && tokens) setHighlighted({ code, language, tokens });
      })
      .catch(() => {});
    return () => {
      current = false;
    };
  }, [code, language]);
  useEffect(() => {
    const surface = root.current?.closest<HTMLElement>(".workspace-main");
    if (!surface) return;
    const resize = new ResizeObserver(() => {
      const inset = parseFloat(getComputedStyle(surface).getPropertyValue("--conversation-bottom"));
      if (Number.isFinite(inset)) setBottom(inset + 32);
    });
    const composer = surface.querySelector(".composer-dock");
    if (composer) resize.observe(composer);
    return () => resize.disconnect();
  }, []);
  useEffect(() => {
    const viewer = root.current?.closest("[data-content-viewer]") ?? root.current;
    const find = (event: Event) => {
      const key = event as KeyboardEvent;
      if (!root.current?.getClientRects().length) return;
      if ((key.metaKey || key.ctrlKey) && key.key.toLowerCase() === "f") {
        key.preventDefault();
        setFinding(true);
        requestAnimationFrame(() => {
          input.current?.focus();
          input.current?.select();
        });
      }
    };
    viewer?.addEventListener("keydown", find);
    return () => viewer?.removeEventListener("keydown", find);
  }, []);
  useEffect(() => {
    if (finding) input.current?.focus();
  }, [finding]);
  // biome-ignore lint/correctness/useExhaustiveDependencies: Wrapping changes measured row heights without changing the virtualizer instance.
  useEffect(() => {
    rows.measure();
    if (scroll.current) scroll.current.scrollLeft = 0;
  }, [wrap, rows]);
  useEffect(() => {
    const match = matches[active];
    if (!finding || !match) return;
    if (virtual) rows.scrollToIndex(match.line, { align: "center" });
    else
      scroll.current
        ?.querySelector(`[data-source-line="${match.line + 1}"]`)
        ?.scrollIntoView({ block: "center", inline: "nearest" });
  }, [active, finding, matches, virtual, rows]);
  const closeFind = () => {
    setFinding(false);
    setQuery("");
    scroll.current?.focus({ preventScroll: true });
  };
  const row = (index: number) => (
    <SourceCodeLine
      text={lines[index]}
      tokens={tokens?.[index]}
      matches={matchesByLine.get(index)}
      active={matchesByLine.get(index)?.some((match) => match.index === active) ? active : -1}
    />
  );
  return (
    <section
      ref={root}
      aria-label={`Code viewer ${name}`}
      className="source-code-viewer"
      data-source-code
      data-language={language}
      data-wrap={wrap}
      data-virtualized={virtual}
      onKeyDown={(event) => {
        if (event.key === "Escape" && finding) {
          event.preventDefault();
          event.stopPropagation();
          closeFind();
        }
      }}
    >
      <div
        className="source-code-toolbar"
        role="toolbar"
        aria-label="Code controls"
        data-finding={finding}
      >
        {finding ? (
          <>
            <input
              ref={input}
              value={query}
              aria-label="Find in file"
              placeholder="Find in file"
              onChange={(event) => {
                setQuery(event.target.value);
                setPosition(0);
              }}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  setPosition((value) => value + (event.shiftKey ? -1 : 1));
                }
              }}
            />
            <output aria-live="polite" className="source-search-count">
              {matches.length ? `${active + 1}/${matches.length}` : "0/0"}
            </output>
            <Button
              size="icon-sm"
              variant="ghost"
              aria-label="Previous match"
              disabled={!matches.length}
              onClick={() => setPosition((value) => value - 1)}
            >
              <HugeiconsIcon icon={ArrowUp01Icon} size={15} />
            </Button>
            <Button
              size="icon-sm"
              variant="ghost"
              aria-label="Next match"
              disabled={!matches.length}
              onClick={() => setPosition((value) => value + 1)}
            >
              <HugeiconsIcon icon={ArrowDown01Icon} size={15} />
            </Button>
            <Button size="icon-sm" variant="ghost" aria-label="Close find" onClick={closeFind}>
              <HugeiconsIcon icon={Cancel01Icon} size={15} />
            </Button>
          </>
        ) : (
          <>
            <span className="source-code-language">
              {language === "text" ? "Plain text" : getLanguageDisplayName(language)}
              <span
                className="source-line-count"
                role={truncated ? "status" : undefined}
                title={
                  truncated
                    ? "Preview limited to 128 KB. Download the original to read the full file."
                    : undefined
                }
              >
                {" "}
                · {truncated ? "128 KB preview" : `${lines.length} lines`}
              </span>
            </span>
            <Button
              size="icon-sm"
              variant="ghost"
              aria-label="Find in file"
              title="Find in file (⌘/Ctrl F)"
              onClick={() => setFinding(true)}
            >
              <HugeiconsIcon icon={Search01Icon} size={16} />
            </Button>
          </>
        )}
        <Button
          className="source-code-option"
          size="icon-sm"
          variant="ghost"
          aria-label="Wrap lines"
          title="Wrap lines"
          aria-pressed={wrap}
          onClick={() => setWrap((value) => !value)}
        >
          <HugeiconsIcon icon={TextWrapIcon} size={16} />
        </Button>
        <Button
          className="source-code-option"
          size="icon-sm"
          variant="ghost"
          aria-label={
            copied === "copied"
              ? "Code copied"
              : copied === "failed"
                ? "Copy failed. Try again"
                : "Copy code"
          }
          title="Copy code"
          onClick={() => void copy()}
        >
          <HugeiconsIcon icon={copied === "copied" ? Tick02Icon : Copy01Icon} size={16} />
        </Button>
      </div>
      <section
        ref={scroll}
        className="source-code-scroll"
        // biome-ignore lint/a11y/noNoninteractiveTabindex: This scroll region supports keyboard panning and scoped Find.
        tabIndex={0}
        aria-label={`Source code ${name}`}
        style={{ "--source-columns": columns, "--source-bottom": `${bottom}px` } as CSSProperties}
      >
        <div
          className="source-code-lines"
          style={virtual ? { height: rows.getTotalSize(), position: "relative" } : undefined}
        >
          {virtual
            ? rows.getVirtualItems().map((item) => (
                <div
                  key={item.key}
                  ref={rows.measureElement}
                  data-index={item.index}
                  data-source-line={item.index + 1}
                  className="source-code-line source-code-line-virtual"
                  style={{ transform: `translateY(${item.start}px)` }}
                >
                  <span aria-hidden="true" className="source-line-number">
                    {item.index + 1}
                  </span>
                  <code>{row(item.index)}</code>
                </div>
              ))
            : lines.map((_, index) => (
                // biome-ignore lint/suspicious/noArrayIndexKey: Source files are immutable within a viewer entry; line positions are stable identities.
                <div key={index} data-source-line={index + 1} className="source-code-line">
                  <span aria-hidden="true" className="source-line-number">
                    {index + 1}
                  </span>
                  <code>{row(index)}</code>
                </div>
              ))}
        </div>
      </section>
    </section>
  );
}
