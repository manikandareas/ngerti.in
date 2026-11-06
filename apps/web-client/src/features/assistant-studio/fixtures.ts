import { defaultAgentAvatar } from "@ngertiin/avatar/config";
import type { Artifact } from "@/types/work";
import type { Agent, ConversationPart, Message, Run, Snapshot } from "@/types/workspace";

export const sampleTime = "2026-11-05T04:30:00.000Z";
const base = { revision: 1, created_at: sampleTime };
export const tobi: Agent = {
  ...base,
  id: "studio-tobi",
  name: "Tobi",
  handle: "tobi",
  avatar: null,
  avatar_config: defaultAgentAvatar("studio-tobi", true),
  soul: "Your everyday work partner.",
  instructions: "",
  harness: "codex",
  connection_id: null,
  model_id: null,
  reasoning: null,
  billing_source: "subscription",
  system_role: "tobi",
};
export const skinny: Agent = {
  ...tobi,
  id: "studio-skinny",
  name: "Skinny Vicuna",
  handle: "skinny",
  avatar_config: defaultAgentAvatar("studio-skinny", false),
  system_role: null,
};

export function sampleRun(changes: Partial<Run> = {}): Run {
  return {
    ...base,
    id: "studio-run-2",
    input_message_id: "studio-input",
    agent_id: tobi.id,
    status: "running",
    delivery: "accepted",
    activity: "generating",
    cancellation: "none",
    native_run_id: "studio-native-run",
    diagnostic: null,
    product_tools: [],
    native_tools: [],
    native_interactions: [],
    sources: [],
    publication: "immediate",
    goal_id: null,
    routine_id: null,
    ...changes,
  };
}

export const inputMessage: Message = {
  ...base,
  id: "studio-input",
  thread_id: "studio-thread",
  author: "user",
  author_agent_id: null,
  text: "Bantu siapkan panduan impor CSV dan file contoh untuk staf operasional.",
  state: "published",
  run_id: null,
  artifact_ids: [],
  purpose: "conversation",
};

export const sampleFiles = [
  {
    id: "studio-guide",
    name: "panduan-csv.md",
    mediaType: "text/markdown",
    content:
      "# Panduan impor CSV\n\nUntuk staf operasional toko kecil.\n\n1. Simpan salinan sumber.\n2. Cocokkan header dan pemisah koma.\n3. Periksa harga dan jumlah sebagai bilangan bulat.\n4. Tinjau pratinjau sebelum impor.\n5. Periksa laporan hasil sebelum mengulang.\n\n[Sumber: dokumentasi Python csv](https://docs.python.org/3/library/csv.html)\n",
  },
  {
    id: "studio-csv",
    name: "contoh-produk.csv",
    mediaType: "text/csv",
    content:
      "nama_produk,harga_satuan,jumlah\nBuku Tulis Pelangi,12000,20\nSabun Melati,8500,15\nTeh Pagi 100 gram,15000,10\n",
  },
];

export const artifacts: Artifact[] = sampleFiles.map((file) => ({
  ...base,
  id: file.id,
  thread_id: "studio-thread",
  agent_id: tobi.id,
  workspace_id: "studio-workspace",
  run_id: "studio-run-2",
  name: file.name,
  media_type: file.mediaType,
  size_bytes: new TextEncoder().encode(file.content).length,
  sha256: "0".repeat(64),
  origin: "agent_output",
  source_artifact_id: null,
}));

export function sampleSnapshot(changes: Partial<Snapshot> = {}): Snapshot {
  return {
    timeline: { parts: [], messages: [], has_more: false, next_before: null },
    cursor: 0,
    thread: {
      ...base,
      id: "studio-thread",
      type: "group",
      purpose: "conversation",
      name: "Katalog produk",
      member_agent_ids: [tobi.id, skinny.id],
      creation_operation_id: null,
      shared_instructions: "",
    },
    agents: [tobi, skinny],
    messages: [inputMessage],
    runs: [],
    has_more: false,
    next_before: null,
    controls: [],
    workspaces: [],
    artifacts,
    goals: [],
    routines: [],
    human_requests: [],
    tasks: [],
    routes: [],
    occurrences: [],
    ...changes,
  };
}

export const sources: Run["sources"] = [
  {
    url: "https://docs.python.org/3/library/csv.html",
    title: "Python · CSV file reading and writing",
    operation: "read",
  },
  {
    url: "https://pandas.pydata.org/docs/reference/api/pandas.read_csv.html",
    title: "pandas · pandas.read_csv",
    operation: "read",
  },
];

export function samplePart(kind: ConversationPart["kind"], index = 1): ConversationPart {
  const handoff = kind.startsWith("handoff");
  const routine = kind.startsWith("routine");
  return {
    id: `studio-part-${index}`,
    sequence: index,
    source_cursor: index,
    thread_id: "studio-thread",
    created_at: sampleTime,
    kind,
    message_id: null,
    source_message_id: null,
    resource_id: handoff ? null : routine ? "studio-routine" : "studio-goal",
    actors: (handoff ? [tobi, skinny] : [tobi]).map((agent) => ({
      id: agent.id,
      name: agent.name,
      handle: agent.handle,
      avatar_config: agent.avatar_config ?? null,
    })),
    name: handoff
      ? "review"
      : routine
        ? "Tinjau katalog setiap Senin pukul 09.00"
        : "Siapkan katalog produk",
    summary:
      kind === "goal_blocked"
        ? "Pilih format katalog agar pekerjaan dapat dilanjutkan."
        : kind === "handoff_failed"
          ? "Tinjauan belum berhasil. Periksa koneksi agent untuk melanjutkan."
          : null,
  };
}
