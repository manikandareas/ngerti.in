import { useAuth } from "@clerk/tanstack-react-start";
import { useInfiniteQuery, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRef, useState } from "react";
import type { PersonaHistory, PersonaList, PersonaProposal } from "@/features/persona/types";
import { ApiError, api } from "@/lib/api";

export function usePersona() {
  const { userId, getToken } = useAuth();
  return useQuery({
    queryKey: ["persona", userId],
    queryFn: async () => api<PersonaList>("/persona", await getToken()),
    enabled: Boolean(userId),
    staleTime: 2000,
    refetchInterval: 4000,
    retry: 1,
  });
}

export function usePersonaHistory() {
  const { userId, getToken } = useAuth();
  return useInfiniteQuery({
    queryKey: ["persona-history", userId],
    queryFn: async ({ pageParam }) =>
      api<PersonaHistory>(`/persona/history?before=${pageParam}`, await getToken()),
    initialPageParam: 2147483647,
    getNextPageParam: (page) => (page.has_more ? page.revisions.at(-1)?.revision : undefined),
    enabled: Boolean(userId),
  });
}

export function usePersonaCommands() {
  const { userId, getToken } = useAuth();
  const client = useQueryClient();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const inflight = useRef(false);
  const receipt = useRef<{ identity: string; key: string } | null>(null);
  async function send(path: string, body: object, keyed = true) {
    if (inflight.current) return null;
    inflight.current = true;
    setPending(true);
    setError("");
    const identity = JSON.stringify([path, body]);
    const storageKey = `persona-command:v1:${userId}`;
    let command = receipt.current;
    try {
      const saved = JSON.parse(sessionStorage.getItem(storageKey) ?? "null");
      if (saved?.identity === identity && typeof saved.key === "string") command = saved;
    } catch {
      /* Optional retry persistence. */
    }
    if (command?.identity !== identity) command = { identity, key: crypto.randomUUID() };
    receipt.current = command;
    try {
      try {
        if (keyed) sessionStorage.setItem(storageKey, JSON.stringify(command));
      } catch {
        /* Optional storage. */
      }
      const result = await api<PersonaProposal>(`/persona${path}`, await getToken(), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(keyed ? { ...body, request_key: command.key } : body),
      });
      receipt.current = null;
      try {
        sessionStorage.removeItem(storageKey);
      } catch {
        /* Optional storage. */
      }
      await Promise.all([
        client.invalidateQueries({ queryKey: ["persona", userId] }),
        client.invalidateQueries({ queryKey: ["persona-history", userId] }),
        client.invalidateQueries({ queryKey: ["chat-threads", userId] }),
      ]);
      return result;
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Perubahan belum tersimpan.");
      if (reason instanceof ApiError && reason.status === 409)
        await client.invalidateQueries({ queryKey: ["persona", userId] });
      return null;
    } finally {
      inflight.current = false;
      setPending(false);
    }
  }
  return { pending, error, send };
}
