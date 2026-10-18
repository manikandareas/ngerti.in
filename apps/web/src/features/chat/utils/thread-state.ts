import type { ChatEvent, Snapshot } from "@/features/chat/types";

function upsert<T extends { id: string }>(values: T[], value: T): T[] {
  const index = values.findIndex((item) => item.id === value.id);
  return index === -1
    ? [...values, value]
    : values.map((item) => (item.id === value.id ? { ...item, ...value } : item));
}

export function applyEvent(state: Snapshot, event: ChatEvent): Snapshot {
  if (event.thread_id !== state.thread.id || event.seq <= state.through_seq) return state;
  if (
    event.version !== 1 ||
    event.seq !== state.through_seq + 1 ||
    !["message.upsert", "run.status", "approval.upsert", "task.upsert"].includes(event.type) ||
    (event.type === "message.upsert" && !event.message) ||
    (event.type === "run.status" && !event.run) ||
    (event.type === "approval.upsert" && !event.approval) ||
    (event.type === "task.upsert" && !event.task)
  )
    throw new Error("Percakapan perlu dimuat ulang.");
  let run = state.run;
  if (event.run) {
    run = run?.id === event.run.id ? { ...run, ...event.run } : event.run;
  }
  return {
    ...state,
    through_seq: event.seq,
    messages: event.message ? upsert(state.messages, event.message) : state.messages,
    approvals: event.approval ? upsert(state.approvals, event.approval) : state.approvals,
    tasks: event.task ? upsert(state.tasks ?? [], event.task) : (state.tasks ?? []),
    run,
  };
}
