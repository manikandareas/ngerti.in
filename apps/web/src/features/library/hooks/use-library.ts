import { useAuth } from "@clerk/tanstack-react-start";
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import type { ResourceRef, ResourceSelection, SearchPage, SearchSpec } from "../types";

export async function libraryCommand<T>(
  path: string,
  token: string | null,
  body: unknown,
  signal?: AbortSignal,
) {
  return api<T>(`/library/${path}`, token, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal,
  });
}
export function useResourceSearch(spec: SearchSpec) {
  const { getToken, userId } = useAuth();
  return useInfiniteQuery({
    queryKey: ["library", userId, spec],
    initialPageParam: 0,
    queryFn: async ({ pageParam, signal }) =>
      libraryCommand<SearchPage>(
        "search",
        await getToken(),
        { ...spec, offset: pageParam },
        signal,
      ),
    getNextPageParam: (page) => page.next_offset ?? undefined,
    enabled: Boolean(userId),
    staleTime: 0,
  });
}
export function useResourceSelection(threadId: string | null) {
  const { getToken, userId } = useAuth();
  const client = useQueryClient();
  const key = ["resource-selection", userId, threadId];
  const query = useQuery({
    queryKey: key,
    queryFn: async () =>
      api<{ selection: ResourceSelection | null }>(
        `/library/threads/${threadId}/selection`,
        await getToken(),
      ),
    enabled: Boolean(userId && threadId),
    refetchInterval: 5000,
    retry: false,
  });
  const mutation = useMutation({
    mutationFn: async (ref: ResourceRef | null) =>
      libraryCommand<{ selection: ResourceSelection | null }>(
        `threads/${threadId}/selection`,
        await getToken(),
        { ref },
      ),
    onSuccess: (data) => client.setQueryData(key, data),
  });
  return { ...query, select: mutation, selection: query.data?.selection };
}
