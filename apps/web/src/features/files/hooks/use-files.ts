import { useAuth } from "@clerk/tanstack-react-start";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import type { ProductFile } from "../types";

export function useFiles(enabled = true) {
  const { getToken, userId } = useAuth();
  return useQuery({
    queryKey: ["files", userId],
    queryFn: async () => api<{ files: ProductFile[] }>("/files", await getToken()),
    enabled: Boolean(userId) && enabled,
    staleTime: 10000,
  });
}
