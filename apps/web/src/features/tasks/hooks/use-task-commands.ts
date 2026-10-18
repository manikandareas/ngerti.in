import { useAuth } from "@clerk/tanstack-react-start";
import { useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import type { BackgroundTask, TaskCommand } from "@/features/tasks/types";
import { getTaskCommandRequest } from "@/features/tasks/utils/task-command";
import { api } from "@/lib/api";

export function useTaskCommands(task: BackgroundTask) {
  const { getToken, userId } = useAuth();
  const queryClient = useQueryClient();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");

  async function command(action: TaskCommand, draft?: string) {
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
    const { path, body } = getTaskCommandRequest(task, action, requestKey, draft);
    try {
      await api<BackgroundTask>(path, await getToken(), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
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
