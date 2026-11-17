import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { resolve } from "node:path";

const base = process.argv[2];
const directory = resolve(process.argv[3]);
const harness = process.argv[4];
const phase = process.argv[5] ?? "initial";
assert(base?.startsWith("http://127.0.0.1:"));
assert(harness === "codex" || harness === "muse");
const { token } = await Bun.file(resolve(directory, "installation.json")).json();
const results: object[] = [];
const streamEvents: object[] = [];
const streamAbort = new AbortController();
let streamTask: Promise<void> | undefined;
let agentId: string | undefined;
let threadId: string | undefined;
const reportPath = `.dev/verification/nma-053/native-${harness}.json`;
const digest = (text: string) => createHash("sha256").update(text).digest("hex");
async function api(path: string, body?: object, key = crypto.randomUUID()) {
  const response = await fetch(`${base}${path}`, {
    method: body === undefined ? "GET" : "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      "Idempotency-Key": key,
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  const value = await response.json();
  assert.equal(response.status, 200, `HTTP ${path}: ${value.error?.code}`);
  return value;
}
async function wait(runId: string, predicate: (run: any) => boolean) {
  const deadline = Date.now() + 180_000;
  while (Date.now() < deadline) {
    const run = await api(`/v1/entities/run/${runId}`);
    if (predicate(run)) return run;
    await Bun.sleep(100);
  }
  throw new Error("Native verification deadline expired.");
}
const terminal = (run: any) => ["succeeded", "failed", "cancelled", "unknown"].includes(run.status);
async function verifyReplay(after: number, stoppedId: string, answerId: string) {
  const events: any[] = [];
  let cursor = after;
  while (true) {
    const page = await api(`/v1/events?after=${cursor}&limit=1000`);
    events.push(...page.events);
    cursor = page.next_cursor;
    if (page.events.length < 1000) break;
  }
  const transitions = events
    .filter((event) => event.entity_id === stoppedId && event.data.kind === "run")
    .map((event) => ({
      cursor: event.cursor,
      status: event.data.status,
      cancellation: event.data.cancellation,
    }));
  assert(transitions.some((event) => event.status === "cancel_requested"));
  assert(transitions.some((event) => event.status === "cancelled"));
  results.push({
    case: "replay_stop_transitions",
    status: "pass",
    pages: Math.ceil(events.length / 1000),
    transitions,
  });
  assert(streamEvents.some((event: any) => event.id === answerId && event.state === "partial"));
  results.push({
    case: "authenticated_sse_native_events",
    status: "pass",
    events: streamEvents.length,
  });
}
async function capture(after: number) {
  const response = await fetch(`${base}/v1/events/stream`, {
    headers: { Authorization: `Bearer ${token}`, "Last-Event-ID": String(after) },
    signal: streamAbort.signal,
  });
  assert.equal(response.status, 200);
  assert(response.body);
  const decoder = new TextDecoder();
  let buffer = "";
  let cursor = after;
  for await (const chunk of response.body) {
    buffer += decoder.decode(chunk, { stream: true });
    while (buffer.includes("\n\n")) {
      const split = buffer.indexOf("\n\n");
      const frame = buffer.slice(0, split);
      buffer = buffer.slice(split + 2);
      const raw = frame
        .split("\n")
        .find((line) => line.startsWith("data: "))
        ?.slice(6);
      if (!raw) continue;
      const event = JSON.parse(raw);
      assert(event.cursor > cursor);
      cursor = event.cursor;
      const value = event.data;
      if (value.thread_id !== threadId) continue;
      streamEvents.push({
        cursor,
        type: event.type,
        id: event.entity_id,
        revision: event.revision,
        status: value.status,
        state: value.state,
        cancellation: value.cancellation,
        activity: value.activity,
        text_length: value.text?.length,
        text_sha256: value.text ? digest(value.text) : undefined,
      });
    }
  }
}
try {
  if (phase === "replay") {
    const previous = await Bun.file(
      ".dev/verification/nma-053/native-muse-replay-limit.json",
    ).json();
    agentId = previous.agent_id;
    threadId = previous.thread_id;
    results.push(...previous.results.filter((item: any) => item.status === "pass"));
    streamEvents.push(...previous.stream_events);
    const stop = previous.results.find(
      (item: any) => item.case === "conversational_stop_native_confirmation",
    );
    const streamed = previous.results.find(
      (item: any) => item.case === "native_queue_edit_delete_stream_steer_exact_retry",
    );
    await verifyReplay((streamEvents[0] as any).cursor - 1, stop.run_id, streamed.answer_id);
  } else {
    const agents = await api("/v1/entities/agent");
    const connections = await api("/v1/entities/connection");
    const prior = agents.find(
      (agent: any) =>
        agent.harness === harness &&
        agent.model_id &&
        connections.some(
          (connection: any) =>
            connection.id === agent.connection_id &&
            connection.state === "active" &&
            connection.authentication.method === (harness === "codex" ? "native_login" : "api_key"),
        ),
    );
    assert(prior, "An explicitly provisioned connection is required.");
    const observed = await api(`/v1/connections/${prior.connection_id}/inspect`, {});
    assert.equal(observed.login, "authenticated");
    assert.equal(
      observed.effective_billing_source,
      harness === "codex" ? "subscription" : "api_key",
    );
    results.push({
      case: "account_catalog",
      status: "pass",
      billing: observed.effective_billing_source,
      models: observed.models.length,
    });
    const agent = await api("/v1/agents", {
      name: `Queue proof ${harness} ${crypto.randomUUID().slice(0, 8)}`,
      harness,
      connection_id: prior.connection_id,
      model_id: prior.model_id,
      reasoning: prior.reasoning,
      instructions:
        "Follow the user's current direction. Use Ngertiin product tools only when explicitly requested. Do not run external actions.",
    });
    agentId = agent.id;
    const thread = await api(`/v1/agents/${agent.id}/dm`, {});
    threadId = thread.id;
    await api(`/v1/threads/${thread.id}/sessions`, { agent_id: agent.id });
    const goal = await api("/v1/goals", {
      thread_id: thread.id,
      agent_id: agent.id,
      title: "Verify conversation control without external effects",
    });
    const routine = await api("/v1/routines", {
      thread_id: thread.id,
      agent_id: agent.id,
      goal_id: goal.id,
      instruction: "Report a check",
      timezone: "UTC",
      schedule: { type: "once", at: "2099-01-01T00:00:00.000Z" },
    });
    const before = await api(`/v1/threads/${thread.id}/snapshot`);
    streamTask = capture(before.cursor).catch((error) => {
      if (!streamAbort.signal.aborted) throw error;
    });
    const first = await api("/v1/runs", {
      thread_id: thread.id,
      agent_id: agent.id,
      goal_id: goal.id,
      text: "Write a detailed 2500-word explanation of how a queue works, with numbered examples. Keep writing until the explanation is complete. Do not call tools.",
    });
    const running = await wait(
      first.run.id,
      (value) => value.status === "running" || terminal(value),
    );
    assert.equal(running.status, "running");
    const waiting = await api("/v1/runs", {
      thread_id: thread.id,
      agent_id: agent.id,
      goal_id: goal.id,
      text: "Original queued correction",
    });
    assert.equal(waiting.run.status, "queued");
    const changed = await api(`/v1/messages/${waiting.message.id}/edit`, {
      expected_revision: 1,
      text: "Change direction now. End your explanation and reply with QUEUE_DIRECTION_ACCEPTED.",
    });
    assert.equal(changed.revision, 2);
    const quoted = await api("/v1/runs", {
      thread_id: thread.id,
      agent_id: agent.id,
      goal_id: goal.id,
      text: 'Explain the hypothetical phrase "stop" later.',
    });
    assert.equal(quoted.run.status, "queued");
    await api(`/v1/messages/${quoted.message.id}/delete`, { expected_revision: 1 });
    const deadline = Date.now() + 60_000;
    let partial: any;
    while (Date.now() < deadline) {
      const snapshot = await api(`/v1/threads/${thread.id}/snapshot`);
      partial = snapshot.messages.find(
        (message: any) =>
          message.run_id === first.run.id &&
          message.author === "agent" &&
          message.state === "partial",
      );
      if (partial) break;
      await Bun.sleep(100);
    }
    assert(partial?.text, "A partial answer must be visible before terminal completion.");
    const key = crypto.randomUUID();
    const controlBody = {
      queued_run_id: waiting.run.id,
      expected_native_run_id: running.native_run_id,
    };
    const control = await api(`/v1/runs/${first.run.id}/steer`, controlBody, key);
    assert.equal(control.state, harness === "codex" ? "accepted" : "rejected");
    if (harness === "muse") {
      assert.equal(control.error_code, "CAPABILITY_UNKNOWN");
      assert.equal((await api(`/v1/entities/run/${waiting.run.id}`)).delivery, "pending");
      await api(`/v1/messages/${waiting.message.id}/delete`, { expected_revision: 2 });
    }
    assert.deepEqual(await api(`/v1/runs/${first.run.id}/steer`, controlBody, key), control);
    const completed = await wait(first.run.id, terminal);
    assert.equal(completed.status, "succeeded");
    assert.equal(
      (await api(`/v1/entities/run/${waiting.run.id}`)).status,
      harness === "codex" ? "steered" : "cancelled",
    );
    const answer = (await api(`/v1/threads/${thread.id}/history`)).messages.filter(
      (message: any) => message.run_id === first.run.id && message.author === "agent",
    );
    assert.equal(answer.length, 1);
    assert.equal(answer[0].id, partial.id);
    results.push({
      case: "native_queue_edit_delete_stream_steer_exact_retry",
      status: "pass",
      run_id: completed.id,
      native_run_id: completed.native_run_id,
      control_id: control.id,
      control_state: control.state,
      control_error: control.error_code,
      final_status: completed.status,
      answer_id: answer[0].id,
      partial_length: partial.text.length,
      final_length: answer[0].text.length,
      final_sha256: digest(answer[0].text),
      correction_visible: answer[0].text.includes("QUEUE_DIRECTION_ACCEPTED"),
    });
    console.log(JSON.stringify({ harness, case: "queue_stream_steer", status: "pass" }));
    const stopRun = await api("/v1/runs", {
      thread_id: thread.id,
      agent_id: agent.id,
      goal_id: goal.id,
      text: "Write a detailed 2500-word guide to gardening. Continue until complete. Do not use tools.",
    });
    assert.equal(
      (await wait(stopRun.run.id, (value) => value.status === "running" || terminal(value))).status,
      "running",
    );
    const stop = await api("/v1/runs", {
      thread_id: thread.id,
      agent_id: agent.id,
      goal_id: goal.id,
      text: "gajadi deh",
    });
    assert.equal(stop.control.action, "stop_run");
    assert.equal(stop.run.status, "cancel_requested");
    const stopped = await wait(stopRun.run.id, terminal);
    assert.equal(stopped.status, "cancelled");
    assert.equal(stopped.cancellation, "confirmed");
    assert.equal((await api(`/v1/entities/goal/${goal.id}`)).state, "active");
    results.push({
      case: "conversational_stop_native_confirmation",
      status: "pass",
      run_id: stopped.id,
      requested: stop.run.status,
      final_status: stopped.status,
      cancellation: stopped.cancellation,
      goal_still_active: true,
    });
    const stopGoal = await api("/v1/runs", {
      thread_id: thread.id,
      agent_id: agent.id,
      goal_id: goal.id,
      text: "stop goal ini",
    });
    assert.equal(stopGoal.control.goal.state, "stopped");
    assert.equal((await api(`/v1/entities/routine/${routine.id}`)).state, "stopped");
    results.push({
      case: "goal_stop_distinct_from_run",
      status: "pass",
      goal_id: goal.id,
      routine_id: routine.id,
    });
    await verifyReplay(before.cursor, stopped.id, partial.id);
  }
} catch (error) {
  results.push({
    case: "verification",
    status: "failed",
    message: error instanceof Error ? error.message : "Unknown verification failure",
  });
  process.exitCode = 1;
} finally {
  streamAbort.abort();
  await streamTask;
  const report = {
    evidence: "native_http",
    harness,
    phase,
    billing: harness === "codex" ? "subscription" : "api_key_developer_credits",
    muse_subscription: "unverified",
    agent_id: agentId,
    thread_id: threadId,
    results,
    stream_events: streamEvents,
  };
  await Bun.write(reportPath, `${JSON.stringify(report, null, 2)}\n`);
  console.log(JSON.stringify({ harness, results }, null, 2));
}
