import type { Agent } from "@/features/agents/agents-page";

export type Thread = {
  thread_id: string;
  kind: "dm" | "group";
  title: string;
  dm_agent_id: string | null;
  membership_revision: string;
  status: "open" | "archived";
  agents: Agent[];
};
export type Message = {
  message_id: string;
  message_seq: string;
  run_id: string;
  author_kind: "user" | "agent" | "system";
  author_agent_id: string | null;
  content: string;
};
export type Run = {
  run_id: string;
  agent_id: string;
  status:
    | "queued"
    | "running"
    | "recovering"
    | "succeeded"
    | "failed"
    | "cancelled"
    | "indeterminate";
  text: string;
  error_code: string | null;
  activity?: string;
};
export type Snapshot = {
  thread: Thread;
  messages: Message[];
  runs: Run[];
  through_cursor: string;
  next_before_message_seq: string | null;
};
export type Event = {
  type: string;
  seq: string;
  thread_id: string;
  run_id: string;
  agent_id: string;
  payload: Record<string, unknown>;
};
export const activeRun = (run: Run) => ["queued", "running", "recovering"].includes(run.status);
export const runLabels: Record<Run["status"], string> = {
  queued: "Menunggu giliran",
  running: "Sedang menulis",
  recovering: "Memulihkan pekerjaan",
  succeeded: "Selesai",
  failed: "Jawaban gagal diselesaikan",
  cancelled: "Dihentikan",
  indeterminate: "Hasil pekerjaan belum dapat dipastikan",
};

export function mergeMessages(current: Message[], incoming: Message[]) {
  const byId = new Map(current.map((message) => [message.message_id, message]));
  for (const message of incoming) byId.set(message.message_id, message);
  return [...byId.values()].sort((a, b) =>
    BigInt(a.message_seq) < BigInt(b.message_seq)
      ? -1
      : BigInt(a.message_seq) > BigInt(b.message_seq)
        ? 1
        : 0,
  );
}

export function applyEvent(state: Snapshot, event: Event): Snapshot {
  if (event.thread_id !== state.thread.thread_id) throw new Error("Unexpected conversation event");
  if (event.type === "message.created") {
    const message = event.payload as unknown as Message;
    return {
      ...state,
      messages: mergeMessages(state.messages, [message]),
      runs: state.runs.map((run) =>
        run.run_id === message.run_id && message.author_kind === "agent"
          ? { ...run, text: "" }
          : run,
      ),
    };
  }
  if (!event.run_id) return state;
  const prior = state.runs.find((run) => run.run_id === event.run_id);
  const run: Run = prior ?? {
    run_id: event.run_id,
    agent_id: event.agent_id,
    status: "queued",
    text: "",
    error_code: null,
  };
  const terminal: Record<string, Run["status"]> = {
    "run.completed": "succeeded",
    "run.failed": "failed",
    "run.cancelled": "cancelled",
    "run.indeterminate": "indeterminate",
  };
  let next = run;
  if (terminal[event.type])
    next = {
      ...run,
      status: terminal[event.type],
      text: "",
      error_code: typeof event.payload.error_code === "string" ? event.payload.error_code : null,
      activity: undefined,
    };
  else if (activeRun(run)) {
    if (event.type === "run.delta")
      next = {
        ...run,
        status: "running",
        text: run.text + (typeof event.payload.text === "string" ? event.payload.text : ""),
        activity: undefined,
      };
    if (event.type === "run.started") next = { ...run, status: "running" };
    if (event.type === "tool.started")
      next = { ...run, status: "running", activity: "Menggunakan alat" };
    if (event.type === "tool.completed") next = { ...run, activity: "Menyiapkan jawaban" };
  }
  // Native message.completed is informational; only message.created commits a message.
  return {
    ...state,
    runs: prior
      ? state.runs.map((item) => (item.run_id === run.run_id ? next : item))
      : [...state.runs, next],
  };
}
