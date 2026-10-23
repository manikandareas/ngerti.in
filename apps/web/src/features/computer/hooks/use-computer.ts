import { useAuth } from "@clerk/tanstack-react-start";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useRef, useState } from "react";
import type { ComputerState } from "@/features/computer/types";
import { api, apiUrl } from "@/lib/api";

export function useComputer(taskId: string, open: boolean) {
  const { getToken, userId } = useAuth();
  const client = useQueryClient();
  const [viewer, setViewer] = useState<{ url: string; version: number; expires: string } | null>(
    null,
  );
  const desired = useRef(false);
  const channelId = useRef<string | null>(null);
  const attempts = useRef(0);
  const connectionEpoch = useRef<number | null>(null);
  const reconnecting = useRef(false);
  const [connectionStatus, setConnectionStatus] = useState("");
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

  useEffect(
    () => () => {
      desired.current = false;
    },
    [],
  );

  useEffect(() => {
    if (!open) {
      desired.current = false;
      setViewer(null);
    }
  }, [open]);

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

  const reconnect = useCallback(async () => {
    if (!desired.current || reconnecting.current) return;
    reconnecting.current = true;
    setViewer(null);
    setConnectionStatus("Menyambungkan kembali layar…");
    try {
      if (channelId.current)
        await api(`/computer/tasks/${taskId}/viewer/close`, await getToken(), {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ident: channelId.current }),
        });
      while (desired.current && attempts.current < 3) {
        const retry = attempts.current++;
        await new Promise((resolve) => setTimeout(resolve, 500 * 2 ** retry));
        if (!desired.current) return;
        const fresh = await state.refetch();
        const workspace = fresh.data?.workspace;
        if (
          workspace?.state !== "ready" ||
          workspace.control_version !== connectionEpoch.current ||
          !["agent", "human"].includes(workspace.control)
        ) {
          desired.current = false;
          setConnectionStatus("Kendali atau sesi berubah. Sambungkan layar dari status terbaru.");
          return;
        }
        try {
          const value = await api<{ path: string; control_version: number; expires_at: string }>(
            `/computer/tasks/${taskId}/viewer`,
            await getToken(),
            { method: "POST", credentials: "include" },
          );
          if (!desired.current) return;
          channelId.current = value.path.split("/").at(-1) ?? null;
          setViewer({
            url: apiUrl.replace(/^http/, "ws") + value.path,
            version: value.control_version,
            expires: value.expires_at,
          });
          setConnectionStatus("");
          return;
        } catch {
          // The server waits for the revoked channel to drain before minting.
        }
      }
      setConnectionStatus("Layar belum tersambung. Coba sambungkan lagi; kendali tidak berubah.");
    } catch {
      setConnectionStatus("Sesi layar belum dapat diperiksa. Coba sambungkan lagi.");
    } finally {
      reconnecting.current = false;
    }
  }, [getToken, state.refetch, taskId]);

  useEffect(() => {
    if (!viewer) return;
    const renew = setTimeout(
      () => void reconnect(),
      Math.max(0, Date.parse(viewer.expires) - Date.now() - 5000),
    );
    const stable = setTimeout(() => {
      attempts.current = 0;
    }, 30000);
    return () => {
      clearTimeout(renew);
      clearTimeout(stable);
    };
  }, [viewer, reconnect]);

  async function connect() {
    if (pending || reconnecting.current) return;
    desired.current = true;
    attempts.current = 0;
    connectionEpoch.current = version ?? null;
    await reconnect();
  }

  function closeViewer() {
    desired.current = false;
    setViewer(null);
    setConnectionStatus("");
    const ident = channelId.current;
    channelId.current = null;
    if (ident)
      void getToken()
        .then((token) =>
          api(`/computer/tasks/${taskId}/viewer/close`, token, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ ident }),
          }),
        )
        .catch(() => undefined);
  }

  return {
    state,
    viewer: validViewer,
    pending,
    error,
    connect,
    command,
    closeViewer,
    reconnect,
    connectionStatus,
  };
}
