import { useAuth } from "@clerk/tanstack-react-start";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useRef, useState } from "react";
import type {
  EvidenceInput,
  GoalDetail,
  GoalList,
  GoalOperation,
  GoalProposal,
  GoalSpec,
} from "@/features/goals/types";
import { api } from "@/lib/api";

export function useGoals() {
  const { userId, getToken } = useAuth();
  return useQuery({
    queryKey: ["goals", userId],
    enabled: Boolean(userId),
    queryFn: async () => api<GoalList>("/goals", await getToken()),
    refetchInterval: 4000,
  });
}

export function useGoal(id: string) {
  const { userId, getToken } = useAuth();
  return useQuery({
    queryKey: ["goals", userId, id],
    enabled: Boolean(userId && id),
    queryFn: async () => api<GoalDetail>(`/goals/${id}`, await getToken()),
    refetchInterval: 4000,
  });
}

export function useGoalCommands() {
  const { userId, getToken } = useAuth();
  const client = useQueryClient();
  const inflight = useRef(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const keys = useRef(new Map<string, string>());
  async function send(path: string, body: object, keyed = false) {
    if (inflight.current) return null;
    inflight.current = true;
    setPending(true);
    setError("");
    let retry: { hash: string; storage: string } | null = null;
    try {
      let payload = body;
      if (keyed) {
        const bytes = await crypto.subtle.digest(
          "SHA-256",
          new TextEncoder().encode(JSON.stringify(body)),
        );
        const hash = Array.from(new Uint8Array(bytes), (b) => b.toString(16).padStart(2, "0")).join(
          "",
        );
        const storage = `goal-command:${userId}:${hash}`;
        retry = { hash, storage };
        let key = keys.current.get(hash) ?? crypto.randomUUID();
        try {
          key = sessionStorage.getItem(storage) ?? key;
          sessionStorage.setItem(storage, key);
        } catch {
          /* Optional storage. */
        }
        keys.current.set(hash, key);
        payload = { ...body, request_key: key };
      }
      const result = await api<GoalProposal>(path, await getToken(), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (retry) {
        keys.current.delete(retry.hash);
        try {
          sessionStorage.removeItem(retry.storage);
        } catch {
          /* Optional persistence. */
        }
      }
      await Promise.all(
        ["goals", "tasks", "schedules"].map((name) =>
          client.invalidateQueries({ queryKey: [name, userId] }),
        ),
      );
      if (keyed) {
        requestAnimationFrame(() => {
          const card = document.querySelector<HTMLElement>(
            `[data-goal-proposal="${CSS.escape(result.id)}"]`,
          );
          card?.scrollIntoView({ block: "center" });
          card?.focus({ preventScroll: true });
        });
      }
      return result;
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Perubahan tujuan belum tersimpan.");
      return null;
    } finally {
      inflight.current = false;
      setPending(false);
    }
  }
  return {
    pending,
    error,
    propose: (
      threadId: string,
      operation: GoalOperation,
      goalId?: string,
      revision?: number,
      spec?: GoalSpec,
      evidence?: EvidenceInput,
    ) =>
      send(
        "/goals/proposals",
        {
          thread_id: threadId,
          operation,
          goal_id: goalId,
          expected_revision: revision,
          spec,
          evidence,
        },
        true,
      ),
    decide: (id: string, approved: boolean) =>
      send(`/goals/proposals/${id}/decision`, { approved }),
  };
}
