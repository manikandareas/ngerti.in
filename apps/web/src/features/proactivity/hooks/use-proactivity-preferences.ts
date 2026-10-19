import { useAuth } from "@clerk/tanstack-react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRef } from "react";
import type { ProactivityScope, ProactivitySettings } from "@/features/proactivity/types";
import { api } from "@/lib/api";

export function useProactivityPreferences() {
  const { userId, getToken } = useAuth();
  return useQuery({
    queryKey: ["proactivity-preferences", userId],
    enabled: Boolean(userId),
    queryFn: async () => api<ProactivitySettings>("/proactivity", await getToken()),
    staleTime: 10_000,
    refetchInterval: 30_000,
    retry: 1,
  });
}

export function useProactivityScope(scope: "thread" | "goal", id: string) {
  const { userId, getToken } = useAuth();
  return useQuery({
    queryKey: ["proactivity-scope", userId, scope, id],
    enabled: Boolean(userId),
    queryFn: async () =>
      api<ProactivityScope>(`/proactivity/scope/${scope}/${id}`, await getToken()),
    staleTime: 10_000,
    refetchInterval: 30_000,
    retry: 1,
  });
}

export function useProactivityCommand() {
  const { userId, getToken } = useAuth();
  const client = useQueryClient();
  const receipt = useRef<{ body: string; key: string } | null>(null);
  return useMutation({
    mutationFn: async (body: Record<string, unknown>) => {
      const serialized = JSON.stringify(body);
      if (receipt.current?.body !== serialized)
        receipt.current = { body: serialized, key: crypto.randomUUID() };
      return api("/proactivity/preferences", await getToken(), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...body, request_key: receipt.current.key }),
      });
    },
    onSuccess: () => {
      receipt.current = null;
    },
    onSettled: async () => {
      await Promise.all([
        client.invalidateQueries({ queryKey: ["proactivity-preferences", userId] }),
        client.invalidateQueries({ queryKey: ["proactivity-scope", userId] }),
      ]);
    },
  });
}
