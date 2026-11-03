import { createHash } from "node:crypto";
import { mkdir } from "node:fs/promises";
import { resolve } from "node:path";
import type { Entity } from "../../../apps/server/src/contracts";
import type { ConversationPart } from "../../../apps/server/src/conversations/parts";

// Read-only evidence capture. Credentials remain in memory and never enter the report.
const root = resolve(import.meta.dir, "../../..");
const installation = await Bun.file(resolve(root, ".dev/harness-first/installation.json")).json();
const threadId = process.argv[2];
const title = process.argv[3];
const label = process.argv[4] ?? "group-native";
if (!threadId || !title || !/^[a-z-]+$/.test(label))
  throw new Error("Supply a thread, goal title and report label.");
const headers = { Authorization: `Bearer ${installation.token}` };
async function read(path: string) {
  const response = await fetch(`http://127.0.0.1:8000${path}`, { headers });
  if (!response.ok) throw new Error(`Evidence read failed: ${response.status}`);
  return response.json();
}
const snapshot = (await read(`/v1/threads/${threadId}/snapshot`)) as {
  cursor: number;
  goals: Entity<"goal">[];
  routines: Entity<"routine">[];
  runs: Entity<"run">[];
  artifacts: Entity<"artifact">[];
};
const goal = snapshot.goals.find((goal) => goal.title === title);
if (goal?.state !== "completed") throw new Error("The requested goal has not completed.");
let before: number | null = null;
const parts: ConversationPart[] = [];
do {
  const page = (await read(
    `/v1/threads/${threadId}/timeline?limit=100${before ? `&before=${before}` : ""}`,
  )) as { parts: ConversationPart[]; next_before: number | null };
  parts.unshift(...page.parts);
  before = page.next_before;
} while (before);
if (
  new Set(parts.map((part) => part.id)).size !== parts.length ||
  parts.some((part, index) => index > 0 && part.sequence <= parts[index - 1].sequence)
)
  throw new Error("Publication order is inconsistent.");
const source = parts.find((part) => part.message_id === goal.source_message_ids[0]);
if (!source) throw new Error("The source publication is missing.");
const relevant = parts.filter((part) => part.sequence >= source.sequence);
const evidence = [];
for (const id of goal.evidence_artifact_ids) {
  const artifact = snapshot.artifacts.find((file) => file.id === id);
  if (!artifact?.workspace_id) throw new Error("Goal evidence is missing its workspace.");
  const response = await fetch(
    `http://127.0.0.1:8000/v1/artifacts/${id}/content?workspace_id=${artifact.workspace_id}`,
    { headers },
  );
  if (!response.ok) throw new Error("Published evidence is not readable.");
  const bytes = new Uint8Array(await response.arrayBuffer());
  const sha256 = createHash("sha256").update(bytes).digest("hex");
  if (sha256 !== artifact.sha256 || bytes.length !== artifact.size_bytes)
    throw new Error("Published evidence bytes changed.");
  evidence.push({ id, name: artifact.name, sha256, size_bytes: bytes.length });
}
const originalName = "Retrieval-Augmented Generation for Knowledge-Intensive NLP Tasks.pdf";
const original = snapshot.artifacts.find(
  (file) => file.name === originalName && file.origin === "upload",
);
const originalBytes = original
  ? await Bun.file(
      resolve("/Users/vitoandareasmanik/Documents/skripsi-references", originalName),
    ).arrayBuffer()
  : new ArrayBuffer(0);
const originalSha = createHash("sha256").update(new Uint8Array(originalBytes)).digest("hex");
if (original && original.sha256 !== originalSha)
  throw new Error("The source PDF does not match the original thesis reference.");
const directory = resolve(root, "docs/verification/conversation-parts/brave-live-2026-11-03");
await mkdir(directory, { recursive: true });
await Bun.write(
  resolve(directory, `${label}.json`),
  JSON.stringify(
    {
      captured_at: new Date().toISOString(),
      thread_id: threadId,
      cursor: snapshot.cursor,
      goal: { id: goal.id, title: goal.title, state: goal.state, scope: goal.scope },
      parts: relevant,
      evidence,
      original: original
        ? {
            id: original.id,
            name: original.name,
            sha256: originalSha,
            size_bytes: originalBytes.byteLength,
          }
        : null,
      runs: snapshot.runs
        .filter(
          (run) =>
            goal.source_run_ids.includes(run.id) ||
            run.goal_id === goal.id ||
            run.created_at >= source.created_at,
        )
        .map((run) => ({
          id: run.id,
          status: run.status,
          agent_id: run.agent_id,
          publication: run.publication,
          response_mode: run.response_mode,
          product_tools: run.product_tools,
          attachment_observations: run.attachment_observations,
        })),
      routines: snapshot.routines
        .filter((routine) => routine.created_at >= source.created_at)
        .map((routine) => ({
          id: routine.id,
          instruction: routine.instruction,
          state: routine.state,
          scope: routine.scope,
          next_run_at: routine.next_run_at,
        })),
    },
    null,
    2,
  ) + "\n",
);
console.log(
  JSON.stringify({
    goal: goal.state,
    parts: relevant.map((part) => part.kind),
    evidence: evidence.map((file) => file.name),
    original_matches: original ? true : null,
  }),
);
