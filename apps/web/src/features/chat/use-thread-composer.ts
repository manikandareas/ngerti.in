import { useAuth } from "@clerk/tanstack-react-start";
import { useEffect, useRef, useState } from "react";
import { postChatCommand } from "./chat-api";

interface ThreadComposerOptions {
  threadId: string;
  active: boolean;
  acceptedRequestKey?: string;
}

export function useThreadComposer({ threadId, active, acceptedRequestKey }: ThreadComposerOptions) {
  const { getToken, userId } = useAuth();
  const [draft, setDraft] = useState("");
  const draftValue = useRef("");
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState("");
  const request = useRef<{ text: string; key: string } | null>(null);
  const draftKey = `ngertiin-draft:v1:${userId}:${threadId}`;
  useEffect(() => {
    try {
      draftValue.current = sessionStorage.getItem(draftKey) ?? "";
      setDraft(draftValue.current);
      const pending = JSON.parse(sessionStorage.getItem(`${draftKey}:pending`) ?? "null");
      if (typeof pending?.key === "string" && typeof pending.text === "string") {
        request.current = pending;
      }
    } catch {
      /* Optional browser draft storage. */
    }
  }, [draftKey]);
  useEffect(() => {
    const pending = request.current;
    if (!pending || pending.key !== acceptedRequestKey) return;
    try {
      if (sessionStorage.getItem(draftKey)?.trim() === pending.text) {
        sessionStorage.removeItem(draftKey);
        draftValue.current = "";
        setDraft("");
      }
      sessionStorage.removeItem(`${draftKey}:pending`);
    } catch {
      /* Optional browser draft storage. */
    }
    request.current = null;
  }, [draftKey, acceptedRequestKey]);
  function updateDraft(value: string) {
    draftValue.current = value;
    setDraft(value);
    try {
      sessionStorage.setItem(draftKey, value);
    } catch {
      /* Optional browser draft storage. */
    }
  }
  async function send() {
    const text = draft.trim();
    if (!text || sending || active) return;
    const current =
      request.current?.text === text ? request.current : { text, key: crypto.randomUUID() };
    request.current = current;
    try {
      sessionStorage.setItem(`${draftKey}:pending`, JSON.stringify(current));
    } catch {
      /* Optional browser draft storage. */
    }
    setSending(true);
    setSendError("");
    try {
      await postChatCommand(`/chat/threads/${threadId}/runs`, await getToken(), {
        text,
        request_key: current.key,
      });
      if (draftValue.current.trim() === text) updateDraft("");
      request.current = null;
      try {
        sessionStorage.removeItem(`${draftKey}:pending`);
      } catch {
        /* Optional browser draft storage. */
      }
    } catch (reason) {
      setSendError(
        reason instanceof Error ? reason.message : "Pesan belum terkirim. Draftmu tetap ada.",
      );
    } finally {
      setSending(false);
    }
  }

  return { draft, updateDraft, sending, sendError, setSendError, send };
}
