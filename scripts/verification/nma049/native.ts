import assert from "node:assert/strict";
import { mkdirSync, writeFileSync, unlinkSync } from "node:fs";
import { resolve } from "node:path";

// Run against the real development HTTP service; never import the adapter or read provider credentials.
const base = process.argv[2];
const directory = resolve(process.argv[3] ?? ".dev/nma049-native");
const phase = process.argv[4] ?? "initial";
assert(base?.startsWith("http://127.0.0.1:"));
const { token } = await Bun.file(resolve(directory, "installation.json")).json();
const results: object[] = [];
async function api(path: string, body?: object): Promise<any> {
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
  assert.equal(response.status, 200, JSON.stringify(value));
  return value;
}
async function run(threadId: string, agentId: string, text: string) {
  await api(`/v1/threads/${threadId}/sessions`, { agent_id: agentId });
  const { run } = await api("/v1/runs", { thread_id: threadId, agent_id: agentId, text });
  const deadline = Date.now() + 180_000;
  let current;
  do {
    await Bun.sleep(250);
    current = await api(`/v1/entities/run/${run.id}`);
    if (["succeeded", "failed", "cancelled", "unknown"].includes(current.status)) break;
  } while (Date.now() < deadline);
  assert.equal(current.status, "succeeded", `Native run ended as ${current.status}`);
  const messages = await api("/v1/entities/message");
  const answer = messages.find(
    (message: any) => message.run_id === run.id && message.author === "agent",
  );
  assert(answer?.text && answer.state === "complete");
  return { run: current, answer };
}
try {
  if (phase === "initial") {
    const connections = await api("/v1/entities/connection");
    const connection = connections.find(
      (c: any) =>
        c.harness === "codex" && c.authentication.method === "native_login" && c.state === "active",
    );
    assert(connection, "Provision a native-login connection first.");
    const observed = await api(`/v1/connections/${connection.id}/inspect`, {});
    assert.equal(observed.login, "authenticated");
    assert.equal(observed.discovery, "succeeded");
    results.push({
      case: "native_login_and_catalog",
      status: "pass",
      login: observed.login,
      model_count: observed.models.length,
      inference_before: observed.inference,
      auth_method: observed.authentication.method,
      billing_source: observed.authentication.billing_source,
    });
    const model = observed.models.find((m: any) => m.id === "gpt-6.1-sol");
    assert(model);
    const agent = await api("/v1/agents", {
      name: "NMA049 native verification",
      harness: "codex",
      connection_id: connection.id,
      model_id: model.id,
      reasoning: "low",
      instructions:
        "Follow the user request precisely. Keep each conversation private. Use the Ngertiin product tool when requested.",
    });
    const dm = await api("/v1/threads", { type: "dm", member_agent_ids: [agent.id] });
    const group = await api("/v1/threads", { type: "group", member_agent_ids: [agent.id] });
    const dmMarker = `DM_${crypto.randomUUID()}`;
    const groupMarker = `GROUP_${crypto.randomUUID()}`;
    const first = await run(
      dm.id,
      agent.id,
      `Remember this conversation's private marker: ${dmMarker}. Reply with only NMA049_SUBSCRIPTION_OK.`,
    );
    assert(first.answer.text.includes("NMA049_SUBSCRIPTION_OK"));
    results.push({
      case: "subscription_completed_request",
      status: "pass",
      run_id: first.run.id,
      native_run_id: first.run.native_run_id,
      answer: first.answer.text,
    });
    const tool = await run(
      dm.id,
      agent.id,
      "Call ngertiin_product_tool with name ngertiin.read_run_context and arguments {}. Read its result, then reply with NMA049_TOOL_OK followed by the exact run_id and thread_id returned by the tool. Do not guess these identifiers.",
    );
    assert(tool.answer.text.includes(tool.run.id));
    assert(tool.answer.text.includes(dm.id));
    results.push({
      case: "subscription_product_tool_http_round_trip",
      status: "pass",
      run_id: tool.run.id,
      answer: tool.answer.text,
    });
    const second = await run(
      group.id,
      agent.id,
      `Remember this conversation's private marker: ${groupMarker}. Reply with only NMA049_GROUP_OK.`,
    );
    assert(second.answer.text.includes("NMA049_GROUP_OK"));
    const bindings = await api("/v1/entities/binding");
    const lanes = bindings.filter((b: any) => b.agent_id === agent.id);
    assert.equal(new Set(lanes.map((b: any) => b.native_session_id)).size, 2);
    await Bun.write(
      resolve(directory, "native-proof.json"),
      JSON.stringify({
        connection_id: connection.id,
        agent_id: agent.id,
        dm_id: dm.id,
        group_id: group.id,
        dmMarker,
        groupMarker,
        bindings: lanes,
      }),
    );
    results.push({
      case: "native_dm_group_bindings",
      status: "pass",
      bindings: lanes,
      group_run_id: second.run.id,
    });
  } else if (phase === "resume") {
    const proof = await Bun.file(resolve(directory, "native-proof.json")).json();
    const dm = await run(
      proof.dm_id,
      proof.agent_id,
      "Reply with only the private marker I asked you to remember in this conversation earlier.",
    );
    assert(dm.answer.text.includes(proof.dmMarker));
    assert(!dm.answer.text.includes(proof.groupMarker));
    const group = await run(
      proof.group_id,
      proof.agent_id,
      "Reply with only the private marker I asked you to remember in this conversation earlier.",
    );
    assert(group.answer.text.includes(proof.groupMarker));
    assert(!group.answer.text.includes(proof.dmMarker));
    const bindings = await api("/v1/entities/binding");
    assert.deepEqual(
      bindings.filter((b: any) => b.agent_id === proof.agent_id),
      proof.bindings,
    );
    results.push({
      case: "native_resume_history_after_service_restart",
      status: "pass",
      dm_run_id: dm.run.id,
      group_run_id: group.run.id,
      preserved_binding_count: 2,
      crossed_markers: 0,
    });
    const tool = await run(
      proof.dm_id,
      proof.agent_id,
      "Call ngertiin_product_tool with name ngertiin.read_run_context and arguments {}. Reply with NMA049_RESUMED_TOOL_OK and the exact returned run_id and thread_id.",
    );
    assert(tool.answer.text.includes(tool.run.id));
    assert(tool.answer.text.includes(proof.dm_id));
    results.push({
      case: "native_product_tool_restored_after_restart",
      status: "pass",
      run_id: tool.run.id,
      answer: tool.answer.text,
    });
  } else if (phase === "controls") {
    const proof = await Bun.file(resolve(directory, "native-proof.json")).json();
    const activeRun = async () => {
      await api(`/v1/threads/${proof.dm_id}/sessions`, { agent_id: proof.agent_id });
      const { run } = await api("/v1/runs", {
        thread_id: proof.dm_id,
        agent_id: proof.agent_id,
        text: "Write an extensive explanation of prime numbers and then list the first 500 primes.",
      });
      const deadline = Date.now() + 30_000;
      while (Date.now() < deadline) {
        const current = await api(`/v1/entities/run/${run.id}`);
        if (current.status === "running") return current;
        await Bun.sleep(100);
      }
      throw new Error("Native run was not accepted.");
    };
    const cancel = await activeRun();
    const intent = await api(`/v1/runs/${cancel.id}/cancel`, {});
    assert.equal(intent.cancellation, "requested");
    let terminal;
    const deadline = Date.now() + 30_000;
    do {
      await Bun.sleep(100);
      terminal = await api(`/v1/entities/run/${cancel.id}`);
    } while (terminal.status === "cancel_requested" && Date.now() < deadline);
    assert.equal(terminal.status, "cancelled");
    assert.equal(terminal.cancellation, "confirmed");
    results.push({
      case: "native_cancel_intent_and_confirmation",
      status: "pass",
      run_id: cancel.id,
      intent: intent.cancellation,
      terminal: terminal.status,
    });
    const steer = await activeRun();
    await api(`/v1/runs/${steer.id}/steer`, {
      text: "Change direction now. Stop the prime-number task and reply only NMA049_STEER_OK.",
    });
    const steerDeadline = Date.now() + 90_000;
    do {
      await Bun.sleep(250);
      terminal = await api(`/v1/entities/run/${steer.id}`);
    } while (terminal.status === "running" && Date.now() < steerDeadline);
    assert.equal(terminal.status, "succeeded");
    const messages = await api("/v1/entities/message");
    const answer = messages.find((m: any) => m.run_id === steer.id && m.author === "agent");
    assert(answer?.text.includes("NMA049_STEER_OK"));
    results.push({
      case: "native_steer_current_turn",
      status: "pass",
      run_id: steer.id,
      answer: answer.text,
    });
  } else if (phase === "key") {
    const reference = crypto.randomUUID();
    mkdirSync(resolve(directory, "credentials"), { recursive: true, mode: 0o700 });
    const credentialFile = resolve(directory, "credentials", reference);
    writeFileSync(credentialFile, "sk-nma049-invalid-verification-key", {
      mode: 0o600,
      flag: "wx",
    });
    const connection = await api("/v1/connections", {
      harness: "codex",
      authentication: { method: "api_key", billing_source: "api_key", credential_ref: reference },
    });
    try {
      const inspected = await api(`/v1/connections/${connection.id}/inspect`, {});
      assert.equal(inspected.authentication.method, "api_key");
      assert.equal(inspected.authentication.billing_source, "api_key");
      const model = inspected.models.find((m: any) => m.id === "gpt-6.1-sol");
      assert(model);
      const agent = await api("/v1/agents", {
        name: "Invalid key verification",
        harness: "codex",
        connection_id: connection.id,
        model_id: model.id,
        reasoning: "low",
      });
      const thread = await api("/v1/threads", { type: "dm", member_agent_ids: [agent.id] });
      await api(`/v1/threads/${thread.id}/sessions`, { agent_id: agent.id });
      const { run } = await api("/v1/runs", {
        thread_id: thread.id,
        agent_id: agent.id,
        text: "Reply only NMA049_KEY_MUST_NOT_SUCCEED.",
      });
      let terminal;
      const deadline = Date.now() + 90_000;
      do {
        await Bun.sleep(250);
        terminal = await api(`/v1/entities/run/${run.id}`);
      } while (
        ["queued", "dispatching", "running"].includes(terminal.status) &&
        Date.now() < deadline
      );
      assert.equal(terminal.status, "failed");
      const observed = await api(`/v1/entities/connection/${connection.id}`);
      assert.equal(observed.authentication.billing_source, "api_key");
      assert.equal(observed.inference, "failed");
      results.push({
        case: "native_invalid_key_has_no_subscription_fallback",
        status: "pass",
        run_id: run.id,
        login: observed.login,
        discovery: observed.discovery,
        inference: observed.inference,
        billing_source: observed.authentication.billing_source,
        successful_key_inference: "not_attempted_no_valid_key_supplied",
      });
    } finally {
      await api(`/v1/connections/${connection.id}/revoke`, {});
      unlinkSync(credentialFile);
    }
  } else throw new Error("Unknown probe phase.");
  console.log(
    JSON.stringify(
      {
        evidence: phase === "key" ? "native_invalid_key_http" : "native_subscription_http",
        phase,
        cli: "0.165.0",
        planned: phase === "initial" ? 4 : phase === "key" ? 1 : 2,
        passed: results.length,
        failed: 0,
        results,
      },
      null,
      2,
    ),
  );
} catch (error) {
  console.log(
    JSON.stringify(
      {
        evidence: "native_subscription_http",
        phase,
        passed: results.length,
        failed: 1,
        results,
        error: error instanceof Error ? error.message : "Probe failed.",
      },
      null,
      2,
    ),
  );
  process.exitCode = 1;
}
