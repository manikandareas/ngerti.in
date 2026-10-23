import assert from "node:assert/strict";
import { taskStatusLabel } from "../apps/web/src/features/tasks/constants";
import { transcriptPlacement } from "../apps/web/src/features/chat/utils/transcript-placement";
import type { Snapshot } from "../apps/web/src/features/chat/types";

const messages = [
  { id: "request", role: "user", run_id: "run", parts: [], status: "complete" },
  { id: "first-answer", role: "assistant", run_id: "run", parts: [], status: "complete" },
  { id: "later-answer", role: "assistant", run_id: "run", parts: [], status: "complete" },
  { id: "manual", role: "user", run_id: null, parts: [{id: "text", type: "text", task_id: "manual-task"}], status: "complete" },
];
const snapshot = { messages, tasks: [
  {id: "a", source_run_id: "run"}, {id: "b", source_run_id: "run"},
  {id: "manual-task", source_run_id: null}, {id: "older", source_run_id: "unloaded"},
] } as Snapshot;
const placed = transcriptPlacement(snapshot);
assert.equal(placed.taskAnchors.get("a"), "request");
assert.equal(placed.taskAnchors.get("b"), "request");
assert.equal(placed.taskAnchors.get("manual-task"), "manual");
assert.equal(placed.taskAnchors.has("older"), false);
assert.equal(placed.approvalAnchors.get("run"), "later-answer");
const page = transcriptPlacement({...snapshot, messages: snapshot.messages.slice(1)});
assert.equal(page.taskAnchors.has("a"), false);
assert.equal(page.approvalAnchors.size, 1);
assert.equal(taskStatusLabel({status: "cancelled", stage: "rejected"}), "Draft ditolak");
assert.equal(taskStatusLabel({status: "cancelled", stage: "expired"}), "Persetujuan kedaluwarsa");
assert.equal(taskStatusLabel({status: "cancelled", stage: "cancelled"}), "Dibatalkan");
console.log("10 transcript placement checks passed: multiple tasks, manual source, pagination, single approval anchor.");
