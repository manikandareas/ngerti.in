import { type RefObject, useLayoutEffect, useRef } from "react";
import type { StickToBottomContext } from "use-stick-to-bottom";

type ConversationPosition = {
  threadId: string | null;
  userMessageId: string | null;
};

/** Open history and reveal new owner messages before paint; assistant updates retain scroll intent. */
export function useConversationScroll(
  threadId: string | null,
  userMessageId: string | null,
  visible = true,
): RefObject<StickToBottomContext | null> {
  const context = useRef<StickToBottomContext | null>(null);
  const previous = useRef<ConversationPosition>({ threadId: null, userMessageId: null });
  const suspended = useRef<{ threadId: string | null; top: number; atBottom: boolean } | null>(
    null,
  );

  useLayoutEffect(() => {
    const current = context.current;
    const scroll = current?.scrollRef.current;
    const content = current?.contentRef.current;
    if (!threadId || !visible || !current || !scroll || !content) return;
    let frame = 0;
    let settling = false;
    const pin = () => {
      if (!settling || !current.state.isAtBottom || current.state.escapedFromLock) return;
      current.state.scrollTop = current.state.calculatedTargetScrollTop;
      current.state.lastScrollTop = current.state.scrollTop;
    };
    // WebKit can restore a removed text anchor after React commits, even when
    // the bubble keeps its height.
    const observer = new MutationObserver(() => {
      settling = current.state.isAtBottom && !current.state.escapedFromLock;
      cancelAnimationFrame(frame);
      pin();
      frame = requestAnimationFrame(() => {
        pin();
        frame = requestAnimationFrame(() => {
          settling = false;
        });
      });
    });
    const release = () => {
      settling = false;
      cancelAnimationFrame(frame);
    };
    const wheel = (event: WheelEvent) => {
      if (event.deltaY < 0) release();
    };
    const pointer = (event: PointerEvent) => {
      release();
      if (event.pointerType === "touch" || event.target === scroll) current.stopScroll();
    };
    const key = (event: KeyboardEvent) => {
      if (["ArrowUp", "ArrowDown", "PageUp", "PageDown", "Home", "End", " "].includes(event.key)) {
        release();
        current.stopScroll();
      }
    };
    observer.observe(content, { childList: true, subtree: true, characterData: true });
    scroll.addEventListener("scroll", pin, { capture: true, passive: true });
    scroll.addEventListener("wheel", wheel, { capture: true, passive: true });
    scroll.addEventListener("pointerdown", pointer, { capture: true, passive: true });
    scroll.addEventListener("keydown", key, true);
    return () => {
      release();
      observer.disconnect();
      scroll.removeEventListener("scroll", pin, true);
      scroll.removeEventListener("wheel", wheel, true);
      scroll.removeEventListener("pointerdown", pointer, true);
      scroll.removeEventListener("keydown", key, true);
    };
  }, [threadId, visible]);

  useLayoutEffect(() => {
    const current = context.current;
    const content = current?.contentRef.current;
    if (!current || !content) return;
    if (!visible) {
      suspended.current = {
        threadId,
        top: current.state.lastScrollTop ?? current.state.scrollTop,
        atBottom: current.state.isAtBottom,
      };
      // A hidden screen has zero height. Do not let that resize reset reading intent.
      current.state.resizeObserver?.unobserve(content);
      current.stopScroll();
      return;
    }
    const saved = suspended.current;
    if (!saved) return;
    suspended.current = null;
    if (saved.threadId === threadId) {
      current.stopScroll();
      current.state.scrollTop = saved.top;
      current.state.lastScrollTop = saved.top;
      if (saved.atBottom) void current.scrollToBottom({ animation: "instant" });
    }
    current.state.resizeObserver?.observe(content);
  }, [threadId, visible]);

  useLayoutEffect(() => {
    const threadChanged = previous.current.threadId !== threadId;
    const hasNewUserMessage = userMessageId !== previous.current.userMessageId;
    previous.current = {
      threadId,
      userMessageId,
    };
    const current = context.current;
    if (!visible || !threadId || !current || (!threadChanged && !hasNewUserMessage)) return;

    // The library normally scrolls on a later animation frame. Place the initial frame
    // synchronously, then restore its follow mode after the owner has scrolled up.
    if (threadChanged) current.state.scrollTop = current.state.calculatedTargetScrollTop;
    void current.scrollToBottom({ animation: "instant" });
  }, [threadId, userMessageId, visible]);

  return context;
}
