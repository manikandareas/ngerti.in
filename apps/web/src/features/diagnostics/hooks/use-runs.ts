import { useAuth } from "@clerk/tanstack-react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRef, useState } from "react";
import type { Run } from "@/features/diagnostics/types";
import { api } from "@/lib/api";
import { useObjectDownload } from "./use-object-download";

export function useRuns() {
  const { getToken } = useAuth();
  const client = useQueryClient();
  const requestKey = useRef<string | null>(null);
  const [delay, setDelay] = useState("10");
  const runs = useQuery({
    queryKey: ["runs"],
    queryFn: async () => api<Run[]>("/dev/runs", await getToken()),
    refetchInterval: 3000,
  });
  const start = useMutation({
    mutationFn: async () => {
      requestKey.current ||= crypto.randomUUID();
      return api<Run>("/dev/runs", await getToken(), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ request_key: requestKey.current, delay_seconds: Number(delay) }),
      });
    },
    onSuccess: () => {
      requestKey.current = null;
      client.invalidateQueries({ queryKey: ["runs"] });
    },
  });
  const download = useObjectDownload();

  return { delay, setDelay, runs, start, download };
}
