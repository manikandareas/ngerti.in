import { useAuth } from "@clerk/tanstack-react-start";
import { useQuery } from "@tanstack/react-query";
import type { TaskList } from "@/features/tasks/types";
import { api } from "@/lib/api";

export function useTasks() {
  const { getToken, userId } = useAuth();
  return useQuery({
    queryKey: ["tasks", userId],
    queryFn: async () => api<TaskList>("/tasks", await getToken()),
    enabled: Boolean(userId),
    refetchInterval: 2500,
  });
}
