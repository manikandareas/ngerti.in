import { useCallback, useState } from "react";
import { attachmentParts } from "./attachment-references";

const key = (threadId: string) => `ngertiin:draft:${threadId}`;
function read(threadId: string | null) {
  try {
    return threadId
      ? (sessionStorage.getItem(key(threadId)) ?? localStorage.getItem(key(threadId)) ?? "")
      : "";
  } catch {
    return "";
  }
}

export function useConversationDraft(threadId: string | null) {
  const [state, setState] = useState(() => ({ threadId, value: read(threadId) }));
  const value = state.threadId === threadId ? state.value : read(threadId);
  const update = useCallback(
    (value: string) => {
      setState({ threadId, value });
      if (!threadId) return;
      try {
        // Local files keep their existing submit-time/IndexedDB lifecycle; do not restore orphan chips.
        if (!value || attachmentParts(value).some((part) => "id" in part)) {
          sessionStorage.removeItem(key(threadId));
          localStorage.removeItem(key(threadId));
        } else {
          sessionStorage.setItem(key(threadId), value);
          localStorage.setItem(key(threadId), value);
        }
      } catch {
        /* Editing remains available when browser storage is unavailable. */
      }
    },
    [threadId],
  );
  return [value, update] as const;
}
