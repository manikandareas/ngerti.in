import { useAuth } from "@clerk/tanstack-react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { ProactiveList } from "@/features/proactivity/types";
import { api } from "@/lib/api";

export function useProactivity() {
  const { userId, getToken } = useAuth();
  const client = useQueryClient();
  const queryKey = ["proactive-inspection", userId];
  const query = useQuery({
    queryKey,
    enabled: Boolean(userId),
    queryFn: async () => api<ProactiveList>("/dev/proactivity", await getToken()),
    refetchInterval: (q) =>
      q.state.data?.evaluations.some((e) => e.status === "queued" || e.status === "running")
        ? 3000
        : false,
  });
  const command = useMutation({
    mutationFn: async ({ path, body }: { path: string; body: object }) =>
      api(`/dev/proactivity/${path}`, await getToken(), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      }),
    onSettled: () => client.invalidateQueries({ queryKey }),
  });
  return { query, command };
}
