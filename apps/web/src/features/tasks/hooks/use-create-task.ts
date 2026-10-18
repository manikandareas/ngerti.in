import { useAuth } from "@clerk/tanstack-react-start";
import { useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useAttachments } from "@/features/files/hooks/use-attachments";
import { attachmentInputs } from "@/features/files/types";
import { api } from "@/lib/api";
import { useTaskDraft } from "./use-task-draft";

export function useCreateTask(threadId: string | null) {
  const { getToken, userId } = useAuth();
  const queryClient = useQueryClient();
  const form = useTaskDraft(`task-draft:${userId}:${threadId}`);
  const attachments = useAttachments(`task:${threadId}`);
  const { instruction, review } = form;
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");

  async function create(): Promise<void> {
    if (!threadId || sending || !instruction.trim() || attachments.progress !== null) return;
    setSending(true);
    setError("");
    try {
      const inputs = attachmentInputs(attachments.items);
      const identity = JSON.stringify({ key: form.requestKey, inputs, outputs: form.outputs });
      const hash = new Uint8Array(
        await crypto.subtle.digest("SHA-256", new TextEncoder().encode(identity)),
      );
      const hex = Array.from(hash.slice(0, 16), (v) => v.toString(16).padStart(2, "0")).join("");
      const requestKey = `${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(13, 16)}-8${hex.slice(17, 20)}-${hex.slice(20)}`;
      await api("/tasks", await getToken(), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          thread_id: threadId,
          instruction,
          review_required: review,
          request_key: requestKey,
          inputs,
          outputs: form.outputs,
        }),
      });
      form.clear();
      attachments.clear();
      void queryClient.invalidateQueries({ queryKey: ["tasks", userId] });
      void queryClient.invalidateQueries({ queryKey: ["quotas", userId] });
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Task belum tersimpan.");
    } finally {
      setSending(false);
    }
  }

  return { form, attachments, sending, error, create };
}
