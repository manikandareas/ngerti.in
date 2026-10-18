import { useAuth } from "@clerk/tanstack-react-start";
import { useQuery } from "@tanstack/react-query";
import type { QuotaUsage } from "@/features/quotas/types";
import { api } from "@/lib/api";

export function useQuota() {
  const { userId, getToken } = useAuth();
  return useQuery({
    queryKey: ["quotas", userId],
    enabled: Boolean(userId),
    retry: 1,
    queryFn: async () => api<QuotaUsage>("/quotas", await getToken()),
    staleTime: 10_000,
    refetchInterval: (query) => {
      const resetAt = query.state.data?.period.ends_at;
      return resetAt
        ? Math.min(30_000, Math.max(1_000, Date.parse(resetAt) - Date.now() + 100))
        : 30_000;
    },
  });
}
