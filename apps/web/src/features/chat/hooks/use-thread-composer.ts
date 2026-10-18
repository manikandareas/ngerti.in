import { useAuth } from "@clerk/tanstack-react-start";
import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { postChatCommand } from "@/features/chat/api/chat-api";
import { useAttachments } from "@/features/files/hooks/use-attachments";
import { attachmentInputs, type OutputSpec } from "@/features/files/types";

interface ThreadComposerOptions {
  threadId: string;
  active: boolean;
  blocked: boolean;
  acceptedRequestKey?: string;
}

export function useThreadComposer({
  threadId,
  active,
  blocked,
  acceptedRequestKey,
}: ThreadComposerOptions) {
  const { getToken, userId } = useAuth();
  const queryClient = useQueryClient();
  const attachments = useAttachments(`chat:${threadId}`);
  const [outputs, setOutputs] = useState<OutputSpec[]>([{ filename: "hasil.md", format: "md" }]);
  const [draft, setDraft] = useState("");
  const draftValue = useRef("");
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState("");
  const request = useRef<{ text: string; key: string; identity?: string } | null>(null);
  const draftKey = `ngertiin-draft:v1:${userId}:${threadId}`;
  useEffect(() => {
    try {
      draftValue.current = sessionStorage.getItem(draftKey) ?? "";
      setDraft(draftValue.current);
      const savedOutputs = JSON.parse(sessionStorage.getItem(`${draftKey}:outputs`) ?? "null");
      if (Array.isArray(savedOutputs) && savedOutputs.every((v) => typeof v?.filename === "string"))
        setOutputs(savedOutputs);
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
  function updateOutputs(value: OutputSpec[]) {
    setOutputs(value);
    try {
      sessionStorage.setItem(`${draftKey}:outputs`, JSON.stringify(value));
    } catch {
      /* Optional draft storage. */
    }
  }
  async function send() {
    const text = draft.trim();
    if (!text || sending || active || blocked || attachments.progress !== null) return;
    const inputs = attachmentInputs(attachments.items);
    const selectedOutputs = inputs.length ? outputs : [];
    const runtimeKind = attachments.items.some(({ file }) =>
      ["text/csv", "application/json"].includes(file.content_type),
    )
      ? "code"
      : "text";
    const identity = JSON.stringify({
      text,
      inputs,
      outputs: selectedOutputs,
      runtime_kind: runtimeKind,
    });
    const current =
      request.current?.identity === identity
        ? request.current
        : { text, identity, key: crypto.randomUUID() };
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
        inputs,
        outputs: selectedOutputs,
        runtime_kind: runtimeKind,
      });
      attachments.clear();
      if (draftValue.current.trim() === text) updateDraft("");
      request.current = null;
      try {
        sessionStorage.removeItem(`${draftKey}:pending`);
      } catch {
        /* Optional browser draft storage. */
      }
    } catch (reason) {
      setSendError(
        reason instanceof TypeError
          ? "Pesan belum terkirim. Periksa koneksi, lalu coba lagi. Draftmu tetap ada."
          : reason instanceof Error
            ? reason.message
            : "Pesan belum terkirim. Draftmu tetap ada.",
      );
    } finally {
      setSending(false);
      void queryClient.invalidateQueries({ queryKey: ["quotas", userId] });
    }
  }

  return {
    draft,
    updateDraft,
    sending,
    sendError,
    setSendError,
    send,
    attachments,
    outputs,
    setOutputs: updateOutputs,
  };
}
