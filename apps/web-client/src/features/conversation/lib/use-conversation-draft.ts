import { useCallback, useEffect, useState } from "react";
import { usePreferences } from "@/hooks/use-preferences";
import { attachmentParts } from "./attachment-references";

const key = (threadId: string) => `ngertiin:draft:${threadId}`;
function read(threadId: string | null, persistent: boolean) {
  try {
    return threadId
      ? (sessionStorage.getItem(key(threadId)) ??
          (persistent ? localStorage.getItem(key(threadId)) : null) ??
          "")
      : "";
  } catch {
    return "";
  }
}

export function useConversationDraft(threadId: string | null) {
  const { preferences } = usePreferences();
  const persistent = preferences.persistDrafts;
  const [state, setState] = useState(() => ({ threadId, value: read(threadId, persistent) }));
  const value = state.threadId === threadId ? state.value : read(threadId, persistent);
  useEffect(() => {
    if (!threadId) return;
    try {
      // Local files retain their submit-time/IndexedDB lifecycle; never restore orphan chips.
      if (!value || attachmentParts(value).some((part) => "id" in part)) {
        sessionStorage.removeItem(key(threadId));
        localStorage.removeItem(key(threadId));
      } else {
        sessionStorage.setItem(key(threadId), value);
        if (persistent) localStorage.setItem(key(threadId), value);
        else localStorage.removeItem(key(threadId));
      }
    } catch {
      // Editing remains available when browser storage is unavailable.
    }
  }, [threadId, value, persistent]);
  const update = useCallback((value: string) => setState({ threadId, value }), [threadId]);
  return [value, update] as const;
}
