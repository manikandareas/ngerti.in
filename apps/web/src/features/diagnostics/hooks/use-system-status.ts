import { useQuery } from "@tanstack/react-query";
import type { SystemStatus } from "@/features/diagnostics/types";
import { api } from "@/lib/api";

export function useSystemStatus() {
  const status = useQuery({
    queryKey: ["system"],
    queryFn: () => api<SystemStatus>("/dev/status", null),
    refetchInterval: 5000,
  });
  return status;
}
