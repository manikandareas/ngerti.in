import {
  defaultRangeExtractor,
  measureElement,
  type Range,
  useVirtualizer,
} from "@tanstack/react-virtual";
import {
  Fragment,
  type ReactNode,
  useCallback,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useStickToBottomContext } from "use-stick-to-bottom";
import type { ConversationRow } from "../lib/conversation-rows";

const virtualizeAfter = 40;
const estimatedRowHeight = 128;

type TranscriptItem = {
  key: string;
  messageId: string | null;
  keepMounted: boolean;
  row: ConversationRow;
};

export type TranscriptNavigation = { threadId: string; messageId: string } & (
  | { kind: "jump" }
  | { kind: "prepend"; offset: number }
);

export function captureTranscriptAnchor(scroll: HTMLElement | null | undefined) {
  if (!scroll) return null;
  const viewport = scroll.getBoundingClientRect();
  const padding = Number.parseFloat(getComputedStyle(scroll).scrollPaddingTop) || 0;
  for (const message of scroll.querySelectorAll<HTMLElement>("[id^='message-']")) {
    const bounds = message.getBoundingClientRect();
    if (bounds.bottom > viewport.top + padding && bounds.top < viewport.bottom)
      return { messageId: message.id.slice("message-".length), offset: bounds.top - viewport.top };
  }
  return null;
}

export function TranscriptViewport({
  items,
  navigation,
  paginated,
  renderRow,
}: {
  items: TranscriptItem[];
  navigation: TranscriptNavigation | null;
  paginated: boolean;
  renderRow: (row: ConversationRow, index: number) => ReactNode;
}) {
  const { scrollRef, stopScroll } = useStickToBottomContext();
  const list = useRef<HTMLDivElement>(null);
  const [handled, setHandled] = useState<TranscriptNavigation | null>(null);
  const [margin, setMargin] = useState(0);
  const [focusedKey, setFocusedKey] = useState<string | null>(null);
  const enabled = paginated || items.length > virtualizeAfter;
  const getScrollElement = useCallback(() => scrollRef.current, [scrollRef]);
  const itemKey = useCallback((index: number) => items[index]?.key ?? index, [items]);
  const retained = useMemo(
    () =>
      items.flatMap((item, index) => (item.keepMounted || item.key === focusedKey ? [index] : [])),
    [items, focusedKey],
  );
  const targetIndex =
    navigation && navigation !== handled
      ? items.findIndex((item) => item.messageId === navigation.messageId)
      : -1;
  const rangeExtractor = useCallback(
    (range: Range) => {
      const indexes = new Set(defaultRangeExtractor(range));
      for (const index of retained) indexes.add(index);
      if (targetIndex >= 0 && navigation?.kind === "prepend") indexes.add(targetIndex);
      return [...indexes].sort((a, b) => a - b);
    },
    [retained, targetIndex, navigation?.kind],
  );
  const virtualizer = useVirtualizer({
    count: items.length,
    enabled,
    getScrollElement,
    getItemKey: itemKey,
    estimateSize: () => estimatedRowHeight,
    measureElement: (element, resize, instance) =>
      element.getClientRects().length
        ? measureElement(element, resize, instance)
        : (instance.itemSizeCache.get(itemKey(instance.indexFromElement(element))) ??
          estimatedRowHeight),
    rangeExtractor,
    overscan: 8,
    gap: 16,
    scrollMargin: margin,
    anchorTo: "end",
    useAnimationFrameWithResizeObserver: true,
  });

  useLayoutEffect(() => {
    if (!enabled) return;
    const element = list.current;
    if (!element) return;
    const measure = () => {
      const scroll = getScrollElement();
      if (scroll?.clientHeight) {
        const distance = element.getBoundingClientRect().top - scroll.getBoundingClientRect().top;
        setMargin(Math.round(distance + scroll.scrollTop));
      }
    };
    let frame = requestAnimationFrame(measure);
    const observer = new ResizeObserver(() => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(measure);
    });
    if (element.parentElement) observer.observe(element.parentElement);
    if (element.previousElementSibling) observer.observe(element.previousElementSibling);
    measure();
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
    };
  }, [enabled, getScrollElement]);

  useLayoutEffect(() => {
    if (!navigation || targetIndex < 0) return;
    const destination = navigation;
    let frames = 0;
    let frame = requestAnimationFrame(restore);
    function restore() {
      const message = document.getElementById(`message-${destination.messageId}`);
      stopScroll();
      if (destination.kind === "jump") {
        if (enabled)
          virtualizer.scrollToIndex(targetIndex, { align: "center", behavior: "instant" });
        else message?.scrollIntoView({ block: "center", behavior: "instant" });
      } else {
        const scroll = getScrollElement();
        if (scroll && message) {
          const offset = message.getBoundingClientRect().top - scroll.getBoundingClientRect().top;
          scroll.scrollTop += offset - destination.offset;
        }
        if (++frames < 3) {
          frame = requestAnimationFrame(restore);
          return;
        }
      }
      setHandled(destination);
    }
    return () => cancelAnimationFrame(frame);
  }, [enabled, getScrollElement, navigation, stopScroll, targetIndex, virtualizer]);

  if (!enabled)
    return items.map((item, index) => (
      <Fragment key={item.key}>{renderRow(item.row, index)}</Fragment>
    ));

  return (
    <div
      ref={list}
      data-transcript-virtualized
      className="relative shrink-0"
      style={{ height: virtualizer.getTotalSize() }}
    >
      {virtualizer.getVirtualItems().map((virtual) => {
        const item = items[virtual.index];
        if (!item) return null;
        return (
          <div
            key={item.key}
            ref={virtualizer.measureElement}
            data-index={virtual.index}
            data-transcript-row
            className="absolute inset-x-0 top-0 flex flex-col gap-4"
            style={{ transform: `translateY(${virtual.start - margin}px)` }}
            onFocusCapture={() => setFocusedKey(item.key)}
            onBlurCapture={(event) => {
              if (!event.currentTarget.contains(event.relatedTarget))
                setFocusedKey((key) => (key === item.key ? null : key));
            }}
          >
            {renderRow(item.row, virtual.index)}
          </div>
        );
      })}
    </div>
  );
}
