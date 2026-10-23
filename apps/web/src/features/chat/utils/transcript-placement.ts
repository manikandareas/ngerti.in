import type { Snapshot } from "@/features/chat/types";

// Source runs are stable even when history is paginated or several tasks share a run.
export function transcriptPlacement(snapshot: Snapshot) {
  const taskAnchors = new Map<string, string>();
  const runAnchors = new Map<string, string>();
  const approvalAnchors = new Map<string, string>();
  for (const message of snapshot.messages) {
    if (message.role === "user") {
      for (const part of message.parts) {
        if (part.task_id) taskAnchors.set(part.task_id, message.id);
      }
    }
    if (!message.run_id) continue;
    if (message.role === "user" && !runAnchors.has(message.run_id))
      runAnchors.set(message.run_id, message.id);
    if (message.role === "assistant") approvalAnchors.set(message.run_id, message.id);
  }
  for (const task of snapshot.tasks ?? []) {
    const messageId = task.source_run_id ? runAnchors.get(task.source_run_id) : undefined;
    if (messageId) taskAnchors.set(task.id, messageId);
  }
  return { taskAnchors, approvalAnchors };
}
