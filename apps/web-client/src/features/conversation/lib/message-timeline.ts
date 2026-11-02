import type { Message, Run } from "@/types/workspace";

/** Project durable admissions into sent turns and inputs waiting behind another run. */
export function messageTimeline(messages: Message[], runs: Run[]) {
  const occupied = new Set(
    runs
      .filter((run) =>
        ["dispatching", "running", "cancel_requested", "unknown"].includes(run.status),
      )
      .map((run) => run.agent_id),
  );
  const waiting = new Set<string>();
  const runByInput = new Map<string, Run>();
  const runById = new Map(runs.map((run) => [run.id, run]));
  for (const run of runs) {
    runByInput.set(run.input_message_id, run);
    if (run.status !== "queued") continue;
    if (occupied.has(run.agent_id) || run.delivery !== "pending") waiting.add(run.id);
    occupied.add(run.agent_id);
  }
  const queued = messages.flatMap((message) => {
    const run = runByInput.get(message.id);
    return message.state !== "deleted" && message.author === "user" && run && waiting.has(run.id)
      ? [{ message, run }]
      : [];
  });
  const queuedIds = new Set(queued.map(({ message }) => message.id));
  const visible = messages.filter(
    (message) => message.state !== "deleted" && !queuedIds.has(message.id),
  );
  const answers = new Map<string, Message[]>();
  for (const message of visible) {
    const run = message.run_id ? runById.get(message.run_id) : undefined;
    if (message.author !== "agent" || !run) continue;
    const replies = answers.get(run.input_message_id) ?? [];
    replies.push(message);
    answers.set(run.input_message_id, replies);
  }

  // Inputs persist at admission, sometimes before the preceding answer exists.
  // Flush that answer before the next ordinary turn; steered inputs retain their observed position.
  const ordered: Message[] = [];
  const seen = new Set<string>();
  let precedingAnswers: Message[] = [];
  function append(message: Message) {
    if (seen.has(message.id)) return;
    seen.add(message.id);
    ordered.push(message);
  }
  for (const message of visible) {
    const run = runByInput.get(message.id);
    if (message.author === "user" && run && run.status !== "steered") {
      for (const answer of precedingAnswers) append(answer);
      precedingAnswers = answers.get(message.id) ?? [];
    }
    append(message);
  }
  return { queued, messages: ordered };
}
