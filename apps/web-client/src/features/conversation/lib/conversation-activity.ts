import type { Run, Snapshot } from "@/types/workspace";
import type { ConversationEntry } from "./conversation-parts";

export function waitingForUser(run: Run, snapshot: Snapshot) {
  return (
    snapshot.human_requests.some(
      (request) => request.source_run_id === run.id && request.state === "pending",
    ) ||
    run.native_interactions.some(
      (record) => record.observed_state === "pending" && record.submission?.state !== "submitted",
    )
  );
}

export function conversationActivity(snapshot: Snapshot | null, entries: ConversationEntry[]) {
  const byEntry = new Map<string, Run[]>();
  if (!snapshot) return byEntry;
  const inputAnchors = new Map<string, string>();
  const outputAnchors = new Map<string, string>();
  const visibleAnswers = new Set<string>();
  for (const entry of entries) {
    if (entry.type === "message") {
      inputAnchors.set(entry.message.id, entry.part.id);
      if (entry.message.author === "agent" && entry.message.run_id) {
        outputAnchors.set(entry.message.run_id, entry.part.id);
        if (entry.message.text?.trim()) visibleAnswers.add(entry.message.run_id);
      }
    } else {
      for (const part of entry.parts)
        if (part.message_id) inputAnchors.set(part.message_id, entry.parts[0].id);
    }
  }
  const handoffInputs = new Set(
    entries.flatMap((entry) =>
      entry.type === "activity"
        ? entry.parts
            .filter((part) => part.kind === "handoff_requested")
            .map((part) => part.message_id)
        : [],
    ),
  );
  const waitingParents = new Set(
    snapshot.tasks
      .filter((task) => task.state === "waiting_peer")
      .map((task) => task.current_run_id),
  );
  const taskInputs = new Map(
    snapshot.tasks.map((task) => [task.current_run_id, task.request_message_id]),
  );
  const replyInputs = new Map(
    snapshot.human_requests.flatMap((request) =>
      request.state === "answered" && request.continuation_run_id && request.response_message_id
        ? [[request.continuation_run_id, request.response_message_id] as const]
        : [],
    ),
  );
  const latestInput = new Map(snapshot.runs.map((run) => [run.input_message_id, run.id]));
  const busyAgents = new Set(
    snapshot.runs
      .filter((run) =>
        ["running", "dispatching", "cancel_requested", "unknown"].includes(run.status),
      )
      .map((run) => run.agent_id),
  );
  for (const run of snapshot.runs) {
    if (
      latestInput.get(run.input_message_id) !== run.id ||
      !snapshot.thread.member_agent_ids.includes(run.agent_id)
    )
      continue;
    if (
      visibleAnswers.has(run.id) &&
      ["running", "dispatching"].includes(run.status) &&
      !run.computer_activity
    )
      continue;
    const waiting = waitingForUser(run, snapshot);
    // The question or approval already explains what is needed in the timeline.
    if (waiting && !["failed", "unknown", "cancel_requested", "cancelled"].includes(run.status))
      continue;
    if (waitingParents.has(run.id) && !waiting && ["running", "succeeded"].includes(run.status))
      continue;
    if (["succeeded", "steered"].includes(run.status) && !waiting && !run.computer_activity)
      continue;
    if (
      run.publication !== "immediate" &&
      !waiting &&
      !replyInputs.has(run.id) &&
      !run.computer_activity
    )
      continue;
    if (
      run.status === "queued" &&
      !run.retry_of_run_id &&
      !handoffInputs.has(taskInputs.get(run.id) ?? run.input_message_id) &&
      (!run.preparation || busyAgents.has(run.agent_id))
    )
      continue;
    const requestId = replyInputs.get(run.id) ?? taskInputs.get(run.id) ?? run.input_message_id;
    const anchor = outputAnchors.get(run.id) ?? inputAnchors.get(requestId);
    // Internal routing, quiet work and unloaded history never borrow another message's identity.
    if (!anchor) continue;
    byEntry.set(anchor, [...(byEntry.get(anchor) ?? []), run]);
  }
  return byEntry;
}
