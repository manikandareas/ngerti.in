import { useAuth } from "@clerk/tanstack-react-start";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useRef, useState } from "react";
import type {
  ScheduleList,
  ScheduleOperation,
  ScheduleProposal,
  ScheduleSpec,
} from "@/features/schedules/types";
import { api } from "@/lib/api";

export function useSchedules() {
  const { userId, getToken } = useAuth();
  return useQuery({
    queryKey: ["schedules", userId],
    queryFn: async () => api<ScheduleList>("/schedules", await getToken()),
    enabled: Boolean(userId),
    refetchInterval: 4000,
  });
}

export function useScheduleCommands() {
  const { userId, getToken } = useAuth();
  const client = useQueryClient();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const inflight = useRef(false);
  const keys = useRef(new Map<string, string>());
  async function send(path: string, body: object) {
    if (inflight.current) return null;
    inflight.current = true;
    setPending(true);
    setError("");
    try {
      const response = await api<ScheduleProposal>(path, await getToken(), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      await Promise.all([
        client.invalidateQueries({ queryKey: ["schedules", userId] }),
        client.invalidateQueries({ queryKey: ["tasks", userId] }),
      ]);
      return response;
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Perubahan jadwal belum tersimpan.");
      return null;
    } finally {
      inflight.current = false;
      setPending(false);
    }
  }
  function propose(
    threadId: string,
    operation: ScheduleOperation,
    spec?: ScheduleSpec,
    scheduleId?: string,
    revision?: number,
  ) {
    const body = {
      thread_id: threadId,
      operation,
      spec,
      schedule_id: scheduleId,
      expected_revision: revision,
    };
    const identity = `${userId}:${JSON.stringify(body)}`;
    let key = keys.current.get(identity) ?? crypto.randomUUID();
    const storageKey = `schedule-command:${userId}`;
    try {
      const saved = JSON.parse(sessionStorage.getItem(storageKey) ?? "null");
      if (saved?.identity === identity && typeof saved.key === "string") key = saved.key;
      sessionStorage.setItem(storageKey, JSON.stringify({ identity, key }));
    } catch {
      /* In-memory retries remain stable when storage is unavailable. */
    }
    keys.current.set(identity, key);
    return send("/schedules/proposals", { ...body, request_key: key }).then((result) => {
      if (result) {
        keys.current.delete(identity);
        try {
          sessionStorage.removeItem(storageKey);
        } catch {
          /* Optional persistence. */
        }
      }
      return result;
    });
  }
  return {
    pending,
    error,
    propose,
    decide: (id: string, approved: boolean) =>
      send(`/schedules/proposals/${id}/decision`, { approved }),
  };
}
