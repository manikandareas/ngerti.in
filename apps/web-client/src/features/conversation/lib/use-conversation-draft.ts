import { useCallback, useEffect, useEffectEvent, useRef, useState } from "react";
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

type Draft = {
  threadId: string;
  value: string;
  persistent: boolean;
};

const pendingWriters = new WeakMap<ClientScope, () => void>();

export function flushConversationDraft() {
  const scope = clientScope();
  if (scope) pendingWriters.get(scope)?.();
}

function save({ threadId, value, persistent }: Draft, scope: ClientScope | null) {
  const storageKey = key(threadId, scope);
  try {
    if (!value || attachmentParts(value).some((part) => "id" in part)) {
      sessionStorage.removeItem(storageKey);
      localStorage.removeItem(storageKey);
    } else {
      sessionStorage.setItem(storageKey, value);
      if (persistent) localStorage.setItem(storageKey, value);
      else localStorage.removeItem(storageKey);
    }
  } catch {}
}

export function useConversationDraft(threadId: string | null) {
  const scope = useRef(clientScope()).current;
  const { preferences } = usePreferences();
  const persistent = preferences.persistDrafts;
  const outstanding = useRef<Draft | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const [state, setState] = useState(() => ({
    threadId,
    value: read(threadId, persistent, scope),
  }));
  const value = state.threadId === threadId ? state.value : read(threadId, persistent, scope);
  const flush = useCallback(() => {
    clearTimeout(timer.current);
    const draft = outstanding.current;
    outstanding.current = null;
    if (draft && clientScope() === scope) save(draft, scope);
  }, [scope]);
  const schedule = useCallback(
    (draft: Draft) => {
      if (outstanding.current?.threadId !== draft.threadId) flush();
      clearTimeout(timer.current);
      outstanding.current = draft;
      if (draft.value) timer.current = setTimeout(flush, 180);
      else flush();
    },
    [flush],
  );
  const applyPreference = useEffectEvent((activeThread: string, persist: boolean) => {
    schedule({ threadId: activeThread, value, persistent: persist });
  });
  useEffect(() => {
    if (threadId) applyPreference(threadId, persistent);
  }, [threadId, persistent]);
  useEffect(() => {
    if (!threadId) return;
    if (scope) pendingWriters.set(scope, flush);
    const onHide = () => {
      if (document.visibilityState === "hidden") flush();
    };
    window.addEventListener("pagehide", flush);
    document.addEventListener("visibilitychange", onHide);
    return () => {
      if (outstanding.current?.threadId === threadId) flush();
      if (scope && pendingWriters.get(scope) === flush) pendingWriters.delete(scope);
      window.removeEventListener("pagehide", flush);
      document.removeEventListener("visibilitychange", onHide);
    };
  }, [threadId, flush, scope]);
  const update = useCallback(
    (value: string) => {
      setState({ threadId, value });
      if (threadId) schedule({ threadId, value, persistent });
    },
    [threadId, persistent, schedule],
  );
  return [value, update] as const;
}
