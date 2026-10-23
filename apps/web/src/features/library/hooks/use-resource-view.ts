import { useEffect, useState } from "react";
import type { ResourceRef } from "../types";

export function useResourceView(userId: string | null | undefined, threadId: string | null) {
  const [discussionRequest, setDiscussionRequest] = useState(0);
  const key = `resource-view:${userId}:${threadId}`;
  const [state, setState] = useState<{ key: string; ref: ResourceRef | null; discussing: boolean }>(
    { key: "", ref: null, discussing: false },
  );
  useEffect(() => {
    try {
      const saved = JSON.parse(sessionStorage.getItem(key) ?? "null");
      const ref = saved?.ref;
      if (
        typeof ref?.id === "string" &&
        ["file", "result", "goal", "schedule", "task", "thread"].includes(ref.kind)
      ) {
        setState({ key, ref, discussing: saved.discussing === true });
        return;
      }
    } catch {
      /* Optional persistence. */
    }
    setState({ key, ref: null, discussing: false });
  }, [key]);
  const current = state.key === key ? state : { key, ref: null, discussing: false };
  useEffect(() => {
    if (state.key !== key) return;
    try {
      sessionStorage.setItem(key, JSON.stringify({ ref: state.ref, discussing: state.discussing }));
    } catch {
      /* Keep in memory. */
    }
  }, [key, state]);
  return {
    opened: current.ref,
    discussing: current.discussing,
    discussionRequest,
    open: (ref: ResourceRef | null) =>
      setState((previous) => ({
        key,
        ref,
        discussing: Boolean(
          ref &&
            previous.key === key &&
            previous.ref?.id === ref.id &&
            previous.ref?.kind === ref.kind &&
            previous.discussing,
        ),
      })),
    discuss: () => {
      setDiscussionRequest((value) => value + 1);
      setState((previous) => (previous.key === key ? { ...previous, discussing: true } : previous));
    },
  };
}
