import { useAuth } from "@clerk/tanstack-react-start";
import { useInfiniteQuery, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRef, useState } from "react";
import type { MemoryHistory, MemoryList } from "@/features/memory/types";
import { ApiError, api } from "@/lib/api";

export function useMemory() {
  const { userId, getToken } = useAuth();
  return useInfiniteQuery({
    queryKey: ["memory", userId],
    queryFn: async ({ pageParam }) =>
      api<MemoryList>(`/memory${pageParam ? `?before=${pageParam}` : ""}`, await getToken()),
    initialPageParam: "",
    getNextPageParam: (page) => page.next_cursor ?? undefined,
    enabled: Boolean(userId),
    staleTime: 1500,
    refetchInterval: 3000,
    retry: 1,
  });
}

export function useMemoryHistory(id: string, enabled: boolean) {
  const { userId, getToken } = useAuth();
  return useQuery({
    queryKey: ["memory-history", userId, id],
    queryFn: async () => api<MemoryHistory>(`/memory/${id}/history`, await getToken()),
    enabled: Boolean(userId) && enabled,
    retry: 1,
  });
}

export function useMemoryCommands() {
  const { userId, getToken } = useAuth();
  const client = useQueryClient();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const busy = useRef(false);
  const receipt = useRef<{ identity: string; key: string } | null>(null);

  async function send(path: string, body: object) {
    if (busy.current) return null;
    busy.current = true;
    setPending(true);
    setError("");
    const identity = JSON.stringify([path, body]);
    const storageKey = `memory-command:v1:${userId}`;
    let command = receipt.current;
    let persistentIdentity: string | null = null;
    try {
      const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(identity));
      persistentIdentity = Array.from(new Uint8Array(digest), (byte) =>
        byte.toString(16).padStart(2, "0"),
      ).join("");
      const saved = JSON.parse(sessionStorage.getItem(storageKey) ?? "null");
      if (saved?.identity === persistentIdentity && typeof saved.key === "string")
        command = { identity, key: saved.key };
    } catch {
      /* Optional retry persistence. */
    }
    if (command?.identity !== identity) command = { identity, key: crypto.randomUUID() };
    receipt.current = command;
    try {
      try {
        if (persistentIdentity)
          sessionStorage.setItem(
            storageKey,
            JSON.stringify({ identity: persistentIdentity, key: command.key }),
          );
      } catch {
        /* Optional storage. */
      }
      const result = await api<{ id?: string; status?: string }>(
        `/memory${path}`,
        await getToken(),
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ...body, request_key: command.key }),
        },
      );
      receipt.current = null;
      try {
        sessionStorage.removeItem(storageKey);
      } catch {
        /* Optional storage. */
      }
      await Promise.all([
        client.invalidateQueries({ queryKey: ["memory", userId] }),
        client.invalidateQueries({ queryKey: ["chat-threads", userId] }),
      ]);
      if (path.endsWith("/forget")) client.removeQueries({ queryKey: ["memory-history", userId] });
      else await client.invalidateQueries({ queryKey: ["memory-history", userId] });
      return result;
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Perubahan belum tersimpan.");
      if (reason instanceof ApiError && reason.status === 409)
        await client.invalidateQueries({ queryKey: ["memory", userId] });
      return null;
    } finally {
      busy.current = false;
      setPending(false);
    }
  }
  return { userId, pending, error, send };
}
