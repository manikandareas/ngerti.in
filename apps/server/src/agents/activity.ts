import { z } from "zod";
import { id } from "../contracts/base";
import { run } from "../runs/contracts";
import type { Store } from "../store";

const activity = z.strictObject({
  agent_id: id,
  thread_id: id,
  run_id: id,
  status: run.shape.status,
  activity: run.shape.activity,
  waiting_for_user: z.boolean(),
});
export const agentActivities = z.strictObject({
  cursor: z.int().nonnegative(),
  items: z.array(activity),
});

/** Owner-only activity summaries exclude transcripts, native requests and routing contexts. */
export function readAgentActivities(store: Store): z.infer<typeof agentActivities> {
  const threads = new Map(store.list("thread").map((thread) => [thread.id, thread]));
  const waiting = new Set(
    store
      .list("human_request")
      .filter((request) => request.state === "pending")
      .map((request) => request.source_run_id),
  );
  const latest = new Map<
    string,
    { value: z.infer<typeof activity>; priority: number; at: string }
  >();
  for (const current of store.list("run")) {
    const thread = threads.get(current.thread_id);
    if (thread?.purpose !== "conversation" || !thread.member_agent_ids.includes(current.agent_id))
      continue;
    const pending =
      waiting.has(current.id) ||
      current.native_interactions.some(
        (record) => record.observed_state === "pending" && record.submission?.state !== "submitted",
      );
    const active = ["running", "dispatching", "cancel_requested"].includes(current.status);
    const waitingForUser = pending && !["failed", "cancelled", "unknown"].includes(current.status);
    const priority = waitingForUser
      ? 4
      : active
        ? 3
        : current.status === "unknown"
          ? 2
          : current.status === "queued"
            ? 1
            : 0;
    const key = `${thread.id}:${current.agent_id}`;
    const previous = latest.get(key);
    if (
      previous &&
      (previous.priority > priority ||
        (previous.priority === priority && previous.at > current.created_at))
    )
      continue;
    latest.set(key, {
      priority,
      at: current.created_at,
      value: {
        agent_id: current.agent_id,
        thread_id: thread.id,
        run_id: current.id,
        status: current.status,
        activity: current.activity,
        waiting_for_user: waitingForUser,
      },
    });
  }
  return { cursor: store.cursor, items: Array.from(latest.values(), (entry) => entry.value) };
}
