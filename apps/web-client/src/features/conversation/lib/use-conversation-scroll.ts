import { type RefObject, useLayoutEffect, useRef } from "react";
import type { StickToBottomContext } from "use-stick-to-bottom";

type ConversationPosition = {
  threadId: string | null;
  userMessageSequence: number;
};

/** Open history and reveal new owner messages before paint; assistant updates retain scroll intent. */
export function useConversationScroll(
  threadId: string | null,
  userMessageSequence: number,
  visible = true,
): RefObject<StickToBottomContext | null> {
  const context = useRef<StickToBottomContext | null>(null);
  const previous = useRef<ConversationPosition>({ threadId: null, userMessageSequence: 0 });
  const suspended = useRef<{ threadId: string | null; top: number; atBottom: boolean } | null>(
    null,
  );

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
    const hasNewUserMessage = userMessageSequence > previous.current.userMessageSequence;
    previous.current = {
      threadId,
      userMessageSequence: threadChanged
        ? userMessageSequence
        : Math.max(previous.current.userMessageSequence, userMessageSequence),
    };
    const current = context.current;
    if (!visible || !threadId || !current || (!threadChanged && !hasNewUserMessage)) return;

    // The library normally scrolls on a later animation frame. Place the initial frame
    // synchronously, then restore its follow mode after the owner has scrolled up.
    current.state.scrollTop = current.state.calculatedTargetScrollTop;
    void current.scrollToBottom({ animation: "instant" });
  }, [threadId, userMessageSequence, visible]);

  return context;
}
