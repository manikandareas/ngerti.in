import { useAuth } from "@clerk/tanstack-react-start";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import type { DaytonaSession } from "@/features/diagnostics/types";
import { api, apiUrl } from "@/lib/api";

export function useDaytonaTrial() {
  const { getToken } = useAuth();
  const cache = useQueryClient();
  const [viewer, setViewer] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);
  const sessions = useQuery({
    queryKey: ["daytona-trial"],
    queryFn: async () => api<DaytonaSession[]>("/dev/daytona/sessions", await getToken()),
    refetchInterval: 3000,
  });
  const active = sessions.data?.find((session) => session.status !== "deleted");

  async function command(path: string, method: string, body?: object) {
    setPending(true);
    setError("");
    try {
      const result = await api<{ path?: string }>(`/dev/daytona/${path}`, await getToken(), {
        method,
        credentials: "include",
        headers: body ? { "Content-Type": "application/json" } : undefined,
        body: body ? JSON.stringify(body) : undefined,
      });
      setViewer(result?.path ? `${apiUrl}${result.path}` : null);
      await cache.invalidateQueries({ queryKey: ["daytona-trial"] });
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "Trial belum berhasil.");
    } finally {
      setPending(false);
    }
  }

  return { sessions, active, viewer, pending, error, command };
}
