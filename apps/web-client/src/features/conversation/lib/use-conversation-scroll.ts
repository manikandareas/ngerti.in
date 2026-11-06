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
): RefObject<StickToBottomContext | null> {
  const context = useRef<StickToBottomContext | null>(null);
  const previous = useRef<ConversationPosition>({ threadId: null, userMessageSequence: 0 });

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
    if (!threadId || !current || (!threadChanged && !hasNewUserMessage)) return;

    // The library normally scrolls on a later animation frame. Place the initial frame
    // synchronously, then restore its follow mode after the owner has scrolled up.
    current.state.scrollTop = current.state.calculatedTargetScrollTop;
    void current.scrollToBottom({ animation: "instant" });
  }, [threadId, userMessageSequence]);

  return context;
}
