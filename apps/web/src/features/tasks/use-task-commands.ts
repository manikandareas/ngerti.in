import { useAuth } from "@clerk/tanstack-react-start";
import { useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { api } from "@/lib/api";
import type { BackgroundTask } from "./types";

export function useTaskCommands(task: BackgroundTask) {
  const { getToken, userId } = useAuth();
  const queryClient = useQueryClient();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");

  async function command(
    action: "approve" | "reject" | "cancel" | "retry" | "revise" | "reconcile",
    draft?: string,
  ) {
    if (pending) return false;
    setPending(true);
    setError("");
    const identity = `task-command:${userId}:${task.id}:${task.revision}:${task.attempt}:${action}`;
    let requestKey: string = crypto.randomUUID();
    const fingerprint = JSON.stringify({ action, draft });
    try {
      const saved = JSON.parse(sessionStorage.getItem(identity) ?? "null");
      if (saved?.fingerprint === fingerprint && typeof saved.requestKey === "string")
        requestKey = saved.requestKey;
      else sessionStorage.setItem(identity, JSON.stringify({ fingerprint, requestKey }));
    } catch {
      /* Commands remain safe when browser storage is unavailable. */
    }
    const decision = action === "approve" || action === "reject";
    try {
      await api<BackgroundTask>(
        decision ? `/approvals/${task.action?.id}/decision` : `/tasks/${task.id}/${action}`,
        await getToken(),
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(
            decision
              ? { revision: task.revision, approved: action === "approve", request_key: requestKey }
              : action === "revise"
                ? { revision: task.revision, draft, request_key: requestKey }
                : action === "retry"
                  ? { request_key: requestKey }
                  : undefined,
          ),
        },
      );
      void queryClient.invalidateQueries({ queryKey: ["tasks", userId] });
      return true;
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Perubahan belum tersimpan.");
      return false;
    } finally {
      setPending(false);
    }
  }
  return { command, pending, error };
}
