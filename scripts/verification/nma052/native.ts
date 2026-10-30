import assert from "node:assert/strict";
import { resolve } from "node:path";

const base = process.argv[2];
const directory = resolve(process.argv[3]);
const harness = process.argv[4];
const phase = process.argv[5] ?? "initial";
assert(base?.startsWith("http://127.0.0.1:"));
assert(harness === "codex" || harness === "muse");
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
  assert.equal(response.status, 200, `HTTP ${path}: ${value.error?.code}`);
  return value;
}
async function run(threadId: string, agentId: string, text: string) {
  const { run } = await api("/v1/runs", { thread_id: threadId, agent_id: agentId, text });
  const deadline = Date.now() + 180_000;
  let current = run;
  while (Date.now() < deadline) {
    await Bun.sleep(250);
    current = await api(`/v1/entities/run/${run.id}`);
    if (["succeeded", "failed", "cancelled", "unknown"].includes(current.status)) break;
  }
  const snapshot = await api(`/v1/threads/${threadId}/snapshot`);
  const answer = snapshot.messages.find(
    (message: any) => message.run_id === run.id && message.author === "agent",
  );
  results.push({
    case: "native_turn",
    status: current.status,
    run_id: current.id,
    native_run_id: current.native_run_id,
    binding_id: current.binding_id,
    agent_revision: current.agent_snapshot?.revision,
    answer: answer?.text ?? null,
  });
  assert.equal(current.status, "succeeded");
  assert(answer?.text);
  return { run: current, answer: answer.text as string };
}
try {
  if (phase === "initial") {
    const before = (await api("/v1/entities/run")).length;
    const setups = await Promise.all(Array.from({ length: 16 }, () => api("/v1/setup", {})));
    const setup = setups[0];
    assert(
      setups.every(
        (value) => value.agent_id === setup.agent_id && value.thread_id === setup.thread_id,
      ),
    );
    for (let i = 0; i < 3; i++) await api(`/v1/threads/${setup.thread_id}/snapshot`);
    assert.equal((await api("/v1/entities/run")).length, before);
    results.push({ case: "concurrent_setup_read_only_open", status: "pass", requests: 16 });
    const connections = await api("/v1/entities/connection");
    const previousAgents = await api("/v1/entities/agent");
    const prior = previousAgents.find(
      (agent: any) =>
        agent.harness === harness &&
        agent.model_id !== null &&
        connections.some(
          (connection: any) =>
            connection.id === agent.connection_id &&
            connection.state === "active" &&
            connection.authentication.method === (harness === "codex" ? "native_login" : "api_key"),
        ),
    );
    assert(prior, "An explicitly provisioned connection and model are required.");
    const observed = await api(`/v1/connections/${prior.connection_id}/inspect`, {});
    assert.equal(observed.login, "authenticated");
    assert.equal(
      observed.effective_billing_source,
      harness === "codex" ? "subscription" : "api_key",
    );
    results.push({
      case: "effective_credential_catalog",
      status: "pass",
      harness,
      billing_source: observed.effective_billing_source,
      model_count: observed.models.length,
    });
    let tobi = await api(`/v1/entities/agent/${setup.agent_id}`);
    tobi = await api(`/v1/agents/${tobi.id}/configuration`, {
      expected_revision: tobi.revision,
      changes: {
        harness,
        connection_id: prior.connection_id,
        model_id: prior.model_id,
        reasoning: prior.reasoning,
        instructions:
          "Use Ngertiin product tools to carry out the user's requested configuration changes. Never transfer context between threads. Answer the owner's history questions within this same thread.",
      },
    });
    const suffix = crypto.randomUUID().slice(0, 8);
    const handle = `proof_${suffix}`;
    const marker = `PROFILE_${suffix}`;
    const privateMarker = `DM_${crypto.randomUUID()}`;
    const createCommand = crypto.randomUUID();
    const updateCommand = crypto.randomUUID();
    const first = await run(
      setup.thread_id,
      tobi.id,
      `Remember the private marker ${privateMarker} for this DM. Use ngertiin.describe_tools and ngertiin.list_agents, then create an agent through ngertiin.create_agent with command_id ${createCommand}, name "Proof Writer ${suffix}", handle "${handle}", harness "${harness}", connection_id "${prior.connection_id}", model_id "${prior.model_id}", reasoning ${JSON.stringify(prior.reasoning)}, soul "A concise writer", instructions "Write clear summaries.". Then use ngertiin.update_agent with command_id ${updateCommand}, the created agent_id and expected_revision 1, changes {"soul":"A careful concise writer"}. Do not create a run for the new agent. Report its saved ID and revision. Do not simulate tool calls.`,
    );
    const created = (await api("/v1/entities/agent")).find((agent: any) => agent.handle === handle);
    assert(created && created.revision === 2 && created.soul === "A careful concise writer");
    assert.equal(
      (await api("/v1/entities/thread")).filter(
        (thread: any) => thread.type === "dm" && thread.member_agent_ids[0] === created.id,
      ).length,
      1,
    );
    results.push({
      case: "native_create_update_tools",
      status: "pass",
      agent_id: created.id,
      revision: created.revision,
    });
    const selfCommand = crypto.randomUUID();
    const changed = await run(
      setup.thread_id,
      tobi.id,
      `Use ngertiin.update_agent with command_id "${selfCommand}", agent_id "${tobi.id}", expected_revision ${tobi.revision}, changes {"instructions":"When asked for your current profile marker, answer ${marker}. Never transfer context between threads; answer the owner's history questions within the same thread."}. Report the tool's saved revision. Do not repeat this request as plain text without calling the tool.`,
    );
    const revised = await api(`/v1/entities/agent/${tobi.id}`);
    assert.equal(revised.revision, tobi.revision + 1);
    assert.equal(changed.run.agent_snapshot.revision, tobi.revision);
    const next = await run(
      setup.thread_id,
      tobi.id,
      "What is your current profile marker? Also recall the private DM marker from our previous conversation. Return the two markers only.",
    );
    assert(next.answer.includes(marker));
    assert(next.answer.includes(privateMarker));
    assert.notEqual(next.run.binding_id, first.run.binding_id);
    const group = await api("/v1/threads", { type: "group", member_agent_ids: [tobi.id] });
    const groupRun = await run(
      group.id,
      tobi.id,
      "What is your current profile marker? Return that marker only. Do not access any other conversation.",
    );
    assert(groupRun.answer.includes(marker));
    assert(!groupRun.answer.includes(privateMarker));
    assert.notEqual(groupRun.run.binding_id, next.run.binding_id);
    results.push({
      case: "profile_snapshot_replacement_and_channel_isolation",
      status: "pass",
      active_revision: changed.run.agent_snapshot.revision,
      next_revision: next.run.agent_snapshot.revision,
    });
    await Bun.write(
      resolve(directory, `nma052-${harness}-proof.json`),
      JSON.stringify(
        {
          setup,
          marker,
          privateMarker,
          binding_id: next.run.binding_id,
          agent_revision: revised.revision,
          group_id: group.id,
          created_agent_id: created.id,
        },
        null,
        2,
      ),
    );
  } else if (phase === "continuity") {
    const previous = await Bun.file("docs/verification/nma-052/native-muse-initial.json").json();
    const created = previous.results.find(
      (result: any) => result.case === "native_create_update_tools",
    );
    let agent = await api(`/v1/entities/agent/${created.agent_id}`);
    const dm = await api(`/v1/agents/${agent.id}/dm`, {});
    const marker = `PROFILE_${crypto.randomUUID().slice(0, 8)}`;
    const privateMarker = `CONTINUITY_${crypto.randomUUID()}`;
    const changed = await run(
      dm.id,
      agent.id,
      `Remember the ordinary continuity marker ${privateMarker} for this conversation. Call ngertiin.update_agent with command_id "${crypto.randomUUID()}", agent_id "${agent.id}", expected_revision ${agent.revision}, changes {"instructions":"When asked for your current profile marker, include ${marker}. Answer continuity questions using this conversation's history. Do not transfer history between conversations."}. Report the saved revision.`,
    );
    const revised = await api(`/v1/entities/agent/${agent.id}`);
    assert.equal(revised.revision, agent.revision + 1);
    assert.equal(changed.run.agent_snapshot.revision, agent.revision);
    const next = await run(
      dm.id,
      agent.id,
      "Return your current profile marker and the ordinary continuity marker I gave you earlier in this same conversation. Return those two markers only.",
    );
    assert(next.answer.includes(marker));
    assert(next.answer.includes(privateMarker));
    assert.notEqual(next.run.binding_id, changed.run.binding_id);
    const group = await api("/v1/threads", { type: "group", member_agent_ids: [agent.id] });
    const groupRun = await run(group.id, agent.id, "Return your current profile marker only.");
    assert(groupRun.answer.includes(marker));
    assert(!groupRun.answer.includes(privateMarker));
    assert.notEqual(groupRun.run.binding_id, next.run.binding_id);
    results.push({
      case: "profile_snapshot_replacement_and_channel_isolation",
      status: "pass",
      active_revision: agent.revision,
      next_revision: revised.revision,
    });
    await Bun.write(
      resolve(directory, `nma052-${harness}-proof.json`),
      JSON.stringify(
        {
          setup: { agent_id: agent.id, thread_id: dm.id },
          marker,
          privateMarker,
          binding_id: next.run.binding_id,
          agent_revision: revised.revision,
          group_id: group.id,
          created_agent_id: agent.id,
          created_revision: revised.revision,
        },
        null,
        2,
      ),
    );
  } else {
    const proof = await Bun.file(resolve(directory, `nma052-${harness}-proof.json`)).json();
    const snapshot = await api(`/v1/threads/${proof.setup.thread_id}/snapshot`);
    assert.equal(snapshot.agents[0].revision, proof.agent_revision);
    assert.equal((await api(`/v1/events?after=${snapshot.cursor}`)).events.length, 0);
    const resumed = await run(
      proof.setup.thread_id,
      proof.setup.agent_id,
      "Return your current profile marker and the continuity marker I gave you earlier in this same conversation. Return those two markers only.",
    );
    assert.equal(resumed.run.binding_id, proof.binding_id);
    assert(resumed.answer.includes(proof.marker));
    assert(resumed.answer.includes(proof.privateMarker));
    assert.equal(
      (await api(`/v1/entities/agent/${proof.created_agent_id}`)).revision,
      proof.created_revision ?? 2,
    );
    results.push({ case: "native_restart_exact_binding_and_history", status: "pass" });
  }
} catch (error) {
  results.push({
    case: "verification",
    status: "failed",
    error: error instanceof Error ? error.message : "Unknown verification failure",
  });
  process.exitCode = 1;
} finally {
  const report = {
    evidence: "native_http",
    harness,
    phase,
    billing_source: harness === "codex" ? "subscription" : "api_key_developer_credits",
    subscription_muse: "unavailable",
    results,
  };
  await Bun.write(
    resolve(`docs/verification/nma-052/native-${harness}-${phase}.json`),
    JSON.stringify(report, null, 2),
  );
  console.log(JSON.stringify(report, null, 2));
}
