import { useCallback, useEffect, useRef, useState } from "react";
import { usePreferences } from "@/hooks/use-preferences";
import { type ClientScope, clientScope, scopedStorageKey } from "@/lib/client-scope";
import { attachmentParts } from "./attachment-references";

const key = (threadId: string, scope: ClientScope | null) =>
  scopedStorageKey(`ngertiin:draft:${threadId}`, scope);
function read(threadId: string | null, persistent: boolean, scope: ClientScope | null) {
  try {
    return threadId
      ? (sessionStorage.getItem(key(threadId, scope)) ??
          (persistent ? localStorage.getItem(key(threadId, scope)) : null) ??
          "")
      : "";
  } catch {
    return "";
  }
}

export function useConversationDraft(threadId: string | null) {
  const scope = useRef(clientScope()).current;
  const { preferences } = usePreferences();
  const persistent = preferences.persistDrafts;
  const [state, setState] = useState(() => ({
    threadId,
    value: read(threadId, persistent, scope),
  }));
  const value = state.threadId === threadId ? state.value : read(threadId, persistent, scope);
  useEffect(() => {
    if (!threadId) return;
    try {
      // Local files retain their submit-time/IndexedDB lifecycle; never restore orphan chips.
      if (!value || attachmentParts(value).some((part) => "id" in part)) {
        sessionStorage.removeItem(key(threadId, scope));
        localStorage.removeItem(key(threadId, scope));
      } else {
        sessionStorage.setItem(key(threadId, scope), value);
        if (persistent) localStorage.setItem(key(threadId, scope), value);
        else localStorage.removeItem(key(threadId, scope));
      }
    } catch {
      // Editing remains available when browser storage is unavailable.
    }
  }, [threadId, value, persistent, scope]);
  const update = useCallback((value: string) => setState({ threadId, value }), [threadId]);
  return [value, update] as const;
}
