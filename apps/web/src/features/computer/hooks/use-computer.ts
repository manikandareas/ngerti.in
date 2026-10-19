import { useAuth } from "@clerk/tanstack-react-start";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import type { ComputerState } from "@/features/computer/types";
import { api, apiUrl } from "@/lib/api";

export function useComputer(taskId: string, open: boolean) {
  const { getToken, userId } = useAuth();
  const client = useQueryClient();
  const [viewer, setViewer] = useState<{ url: string; version: number; expires: string } | null>(
    null,
  );
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const state = useQuery({
    queryKey: ["computer", userId, taskId],
    queryFn: async () => api<ComputerState>(`/computer/tasks/${taskId}`, await getToken()),
    enabled: open && !!userId,
    refetchInterval: open ? 1500 : false,
  });
  const version = state.data?.workspace?.control_version;
  const validViewer = open && viewer?.version === version ? viewer : null;

  useEffect(() => {
    if (!open) setViewer(null);
  }, [open]);

  useEffect(() => {
    if (!viewer) return;
    const timer = setTimeout(
      () => setViewer(null),
      Math.max(0, Date.parse(viewer.expires) - Date.now()),
    );
    return () => clearTimeout(timer);
  }, [viewer]);

  async function command(path: string, body: Record<string, unknown> = {}) {
    if (pending) return false;
    setPending(true);
    setError("");
    try {
      await api(path, await getToken(), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      void client.invalidateQueries({ queryKey: ["tasks", userId] });
      void state.refetch();
      return true;
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Perubahan komputer belum tersimpan.");
      return false;
    } finally {
      setPending(false);
    }
  }

  async function connect() {
    if (pending) return;
    setPending(true);
    setError("");
    setViewer(null);
    try {
      const value = await api<{ path: string; control_version: number; expires_at: string }>(
        `/computer/tasks/${taskId}/viewer`,
        await getToken(),
        { method: "POST", credentials: "include" },
      );
      setViewer({
        url: apiUrl.replace(/^http/, "ws") + value.path,
        version: value.control_version,
        expires: value.expires_at,
      });
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Viewer belum tersambung.");
    } finally {
      setPending(false);
    }
  }

  return {
    state,
    viewer: validViewer,
    pending,
    error,
    connect,
    command,
    closeViewer: () => setViewer(null),
  };
}
