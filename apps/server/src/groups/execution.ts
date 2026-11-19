import type { Entity } from "../contracts";

export const peerBudgetDiagnostic = {
  code: "PEER_BUDGET_EXCEEDED",
  category: "configuration",
  outcome: "failed",
} as const;

export function peerBudgetDeadline(run: Entity<"run">) {
  const dispatched = run.timings?.dispatched_at;
  return run.peer_budget_seconds !== undefined && dispatched !== undefined
    ? Date.parse(dispatched) + run.peer_budget_seconds * 1000
    : undefined;
}

export function peerBudgetExpired(run: Entity<"run">, now = Date.now()) {
  return now >= (peerBudgetDeadline(run) ?? Infinity);
}

export function groupRunBlocks(candidate: Entity<"run">, other: Entity<"run">) {
  return (
    candidate.thread_id === other.thread_id &&
    ["dispatching", "running", "cancel_requested", "unknown"].includes(other.status) &&
    !(
      candidate.parallel_peer_source_id &&
      candidate.parallel_peer_source_id === other.parallel_peer_source_id &&
      candidate.agent_id !== other.agent_id &&
      other.status !== "unknown"
    )
  );
}
