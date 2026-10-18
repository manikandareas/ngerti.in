import { useAuth } from "@clerk/tanstack-react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import type { ChatThread } from "@/features/chat/types";
import { api } from "@/lib/api";

interface ThreadListResponse {
  threads: ChatThread[];
  profile: { name: string };
}

export function useChatThreads(onCreated: (id: string) => void) {
  const { userId, getToken } = useAuth();
  const client = useQueryClient();
  const [search, setSearch] = useState("");
  const queryKey = ["chat-threads", userId];
  const threads = useQuery({
    enabled: Boolean(userId),
    retry: 1,
    queryKey,
    queryFn: async () => api<ThreadListResponse>("/chat/threads", await getToken()),
    staleTime: 10_000,
  });
  const create = useMutation({
    mutationFn: async () =>
      api<ChatThread>("/chat/threads", await getToken(), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ request_key: crypto.randomUUID() }),
      }),
    onSuccess: async (thread) => {
      await client.invalidateQueries({ queryKey });
      setSearch("");
      onCreated(thread.id);
    },
  });

  return { threads, search, setSearch, create };
}
