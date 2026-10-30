import assert from "node:assert/strict";
import { chmodSync, mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

// Exercise the actual HTTP bootstrap. Provider secrets are written only to the selected credential file.
const base = process.argv[2];
const directory = resolve(process.argv[3] ?? ".dev/nma050/state");
const phase = process.argv[4] ?? "initial";
assert(base?.startsWith("http://127.0.0.1:"));
const { token } = await Bun.file(resolve(directory, "installation.json")).json();
const results: object[] = [];
async function api(path: string, body?: object) {
  const response = await fetch(`${base}${path}`, {
    method: body === undefined ? "GET" : "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      "Idempotency-Key": crypto.randomUUID(),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  const value = await response.json();
  if (!response.ok) throw new Error(`HTTP ${response.status}: ${value.error?.code ?? "UNKNOWN"}`);
  return value;
}
async function run(threadId: string, agentId: string, text: string) {
  await api(`/v1/threads/${threadId}/sessions`, { agent_id: agentId });
  const admitted = await api("/v1/runs", { thread_id: threadId, agent_id: agentId, text });
  const deadline = Date.now() + 180_000;
  let current = admitted.run;
  while (Date.now() < deadline) {
    await Bun.sleep(250);
    current = await api(`/v1/entities/run/${current.id}`);
    if (["succeeded", "failed", "cancelled", "unknown"].includes(current.status)) break;
  }
  const messages = await api("/v1/entities/message");
  const answer = messages.find(
    (m: { run_id: string; author: string }) => m.run_id === current.id && m.author === "agent",
  );
  results.push({
    case: "native_run",
    status: current.status,
    run_id: current.id,
    native_run_id: current.native_run_id,
    answer: answer?.text ?? null,
  });
  assert.equal(current.status, "succeeded", `Native turn ended as ${current.status}`);
  return { current, answer };
}
try {
  if (phase === "initial") {
    const key = process.env.MUSE_API_KEY;
    assert(
      key,
      "MUSE_API_KEY is required for the explicitly selected developer-credit connection.",
    );
    const reference = crypto.randomUUID();
    mkdirSync(resolve(directory, "credentials"), { recursive: true, mode: 0o700 });
    const file = resolve(directory, "credentials", reference);
    writeFileSync(file, key, { mode: 0o600 });
    chmodSync(file, 0o600);
    const connection = await api("/v1/connections", {
      harness: "muse",
      authentication: { method: "api_key", billing_source: "api_key", credential_ref: reference },
    });
    const inspected = await api(`/v1/connections/${connection.id}/inspect`, {});
    results.push({
      case: "effective_credential_and_catalog",
      status: "pass",
      login: inspected.login,
      discovery: inspected.discovery,
      inference_before: inspected.inference,
      billing_source: inspected.authentication.billing_source,
      model_count: inspected.models.length,
    });
    assert.equal(inspected.login, "authenticated");
    const model =
      inspected.models.find((m: { id: string }) => m.id === "muse-spark-1.3") ??
      inspected.models[0];
    assert(model, "Native catalog must contain an accessible model.");
    const agent = await api("/v1/agents", {
      name: "Muse native verification",
      harness: "muse",
      connection_id: connection.id,
      model_id: model.id,
      reasoning: model.reasoning.includes("medium") ? "medium" : null,
      instructions:
        "Follow the exact request. Use the Ngertiin MCP product tool when asked. Keep each conversation private.",
    });
    const dm = await api("/v1/threads", { type: "dm", member_agent_ids: [agent.id] });
    const group = await api("/v1/threads", { type: "group", member_agent_ids: [agent.id] });
    const dmMarker = `DM_${crypto.randomUUID()}`;
    const groupMarker = `GROUP_${crypto.randomUUID()}`;
    await Bun.write(
      resolve(directory, "native-proof.json"),
      JSON.stringify({
        connection_id: connection.id,
        agent_id: agent.id,
        dm_id: dm.id,
        group_id: group.id,
        dm_marker: dmMarker,
        group_marker: groupMarker,
      }),
    );
    const first = await run(
      dm.id,
      agent.id,
      `Remember this conversation's private marker: ${dmMarker}. Reply with only MUSE_DEV_CREDITS_OK.`,
    );
    assert(first.answer?.text.includes("MUSE_DEV_CREDITS_OK"));
    const tool = await run(
      dm.id,
      agent.id,
      "Call the Ngertiin MCP tool ngertiin.read_run_context with arguments {}. Reply with the exact run_id and thread_id from its result. Do not guess them.",
    );
    assert(tool.answer?.text.includes(tool.current.id));
    assert(tool.answer?.text.includes(dm.id));
    results.push({
      case: "key_backed_product_tool_round_trip",
      status: "pass",
      run_id: tool.current.id,
    });
    await run(
      group.id,
      agent.id,
      `Remember this conversation's private marker: ${groupMarker}. Reply with only MUSE_GROUP_OK.`,
    );
    results.push({
      case: "isolated_dm_group_sessions",
      status: "pass",
      bindings: await api("/v1/entities/binding"),
    });
  } else if (phase === "resume") {
    const proof = await Bun.file(resolve(directory, "native-proof.json")).json();
    const result = await run(
      proof.dm_id,
      proof.agent_id,
      "Return only this conversation's private marker from earlier. Do not call tools.",
    );
    assert(result.answer?.text.includes(proof.dm_marker));
    assert(!result.answer?.text.includes(proof.group_marker));
    results.push({
      case: "exact_native_history_after_service_restart",
      status: "pass",
      bindings: await api("/v1/entities/binding"),
    });
  } else if (phase === "controls") {
    const proof = await Bun.file(resolve(directory, "native-proof.json")).json();
    await api(`/v1/threads/${proof.dm_id}/sessions`, { agent_id: proof.agent_id });
    const { run: admitted } = await api("/v1/runs", {
      thread_id: proof.dm_id,
      agent_id: proof.agent_id,
      text: "Write 200 numbered detailed paragraphs about database indexes. Do not call tools.",
    });
    let current = admitted;
    for (let i = 0; i < 240; i++) {
      await Bun.sleep(100);
      current = await api(`/v1/entities/run/${current.id}`);
      if (current.status === "running") break;
    }
    assert.equal(current.status, "running");
    await api(`/v1/runs/${current.id}/cancel`, {});
    results.push({ case: "stop_intent", status: "pass", run_id: current.id });
    for (let i = 0; i < 300; i++) {
      await Bun.sleep(100);
      current = await api(`/v1/entities/run/${current.id}`);
      if (["cancelled", "failed", "succeeded", "unknown"].includes(current.status)) break;
    }
    results.push({
      case: "native_stop_confirmation",
      status: current.status === "cancelled" ? "pass" : "fail",
      run_status: current.status,
      cancellation: current.cancellation,
    });
    assert.equal(current.status, "cancelled");
    assert.equal(current.cancellation, "confirmed");
  } else if (phase === "question") {
    const proof = await Bun.file(resolve(directory, "native-proof.json")).json();
    await api(`/v1/threads/${proof.dm_id}/sessions`, { agent_id: proof.agent_id });
    const { run: admitted } = await api("/v1/runs", {
      thread_id: proof.dm_id,
      agent_id: proof.agent_id,
      text: "Call your native request_user_input tool now. Ask exactly one single-choice question: Which database? Options SQLite and Postgres. Wait for my answer through that tool, then repeat the chosen database. Do not call subagents or any other tools.",
    });
    let current = admitted;
    let answered = false;
    for (let i = 0; i < 360; i++) {
      await Bun.sleep(250);
      current = await api(`/v1/entities/run/${current.id}`);
      if (["failed", "succeeded", "cancelled", "unknown"].includes(current.status)) break;
      if (current.status !== "running" || answered) continue;
      const pending = await api(`/v1/runs/${current.id}/interactions`);
      const request = pending.user_inputs[0];
      if (!request) continue;
      const question = request.questions[0];
      await api(`/v1/runs/${current.id}/interactions`, {
        type: "user_input",
        request_id: request.userInputId,
        answers: [{ questionId: question.id, selectedLabel: question.options[0].label }],
      });
      results.push({
        case: "native_question_answered_via_http",
        status: "pass",
        run_id: current.id,
        request_id: request.userInputId,
      });
      answered = true;
    }
    if (!["failed", "succeeded", "cancelled", "unknown"].includes(current.status))
      await api(`/v1/runs/${current.id}/cancel`, {});
    results.push({
      case: "native_question_completed",
      status: answered && current.status === "succeeded" ? "pass" : "fail",
      run_status: current.status,
      answered,
    });
    assert(answered && current.status === "succeeded");
  } else throw new Error("Unknown verification phase.");
} catch (error) {
  results.push({
    case: phase,
    status: "fail",
    reason: error instanceof Error ? error.message : "Verification failed.",
  });
  process.exitCode = 1;
} finally {
  console.log(
    JSON.stringify(
      {
        phase,
        billing_source: "api_key",
        subscription: "not_available",
        runtime: `bun@${Bun.version}`,
        results,
      },
      null,
      2,
    ),
  );
}
