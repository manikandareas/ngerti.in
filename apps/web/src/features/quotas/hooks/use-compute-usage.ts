import { useAuth } from "@clerk/tanstack-react-start";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import type { ComputeUsage, WorkEstimate } from "../types";

export function useComputeUsage(offset = 0) {
  const { userId, getToken } = useAuth();
  return useQuery({
    queryKey: ["compute-usage", userId, offset],
    enabled: Boolean(userId),
    queryFn: async () => api<ComputeUsage>(`/usage?offset=${offset}`, await getToken()),
    retry: 1,
    staleTime: 5_000,
    refetchInterval: 15_000,
  });
}

export function useWorkEstimate(runtimeKind: string, inputs: string[], perRunCap?: number) {
  const { userId, getToken } = useAuth();
  return useQuery({
    queryKey: ["compute-estimate", userId, runtimeKind, inputs, perRunCap],
    enabled: Boolean(userId),
    queryFn: async () =>
      api<WorkEstimate>("/usage/estimate", await getToken(), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ runtime_kind: runtimeKind, inputs, per_run_cap: perRunCap }),
      }),
    retry: 1,
    staleTime: 5_000,
    refetchInterval: 15_000,
  });
}
