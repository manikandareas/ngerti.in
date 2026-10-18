import { useAuth } from "@clerk/tanstack-react-start";
import { useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { api } from "@/lib/api";
import { useTaskDraft } from "./use-task-draft";

export function useCreateTask(threadId: string | null) {
  const { getToken, userId } = useAuth();
  const queryClient = useQueryClient();
  const form = useTaskDraft(`task-draft:${userId}:${threadId}`);
  const { instruction, review } = form;
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");

  async function create(): Promise<void> {
    if (!threadId || sending || !instruction.trim()) return;
    setSending(true);
    setError("");
    try {
      await api("/tasks", await getToken(), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          thread_id: threadId,
          instruction,
          review_required: review,
          request_key: form.requestKey,
        }),
      });
      form.clear();
      void queryClient.invalidateQueries({ queryKey: ["tasks", userId] });
      void queryClient.invalidateQueries({ queryKey: ["quotas", userId] });
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Task belum tersimpan.");
    } finally {
      setSending(false);
    }
  }

  return { form, sending, error, create };
}
