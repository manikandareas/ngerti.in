import assert from "node:assert/strict";
import { chmodSync, copyFileSync, existsSync } from "node:fs";
import { join, resolve } from "node:path";
import { Database } from "bun:sqlite";
import type { Entity } from "../../../apps/server/src/contracts";

const base = process.argv[2];
const directory = resolve(process.argv[3]);
const phase = process.argv[4] ?? "initial";
const output = process.argv[5] ?? `.dev/verification/nma-056/native/${phase}.json`;
assert(base?.startsWith("http://127.0.0.1:"));
const { token } = await Bun.file(join(directory, "installation.json")).json();
const report: Record<string, any> = {
  phase,
  started_at: new Date().toISOString(),
  checks: [],
  native_approvals: [],
};
const save = () => Bun.write(output, `${JSON.stringify(report, null, 2)}\n`);
async function api(path: string, body?: unknown, key = crypto.randomUUID()) {
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
  assert.equal(response.status, 200, `${path}: ${value.error?.code}`);
  return value;
}
async function observe() {
  const snapshot = await api(`/v1/threads/${report.group_id}/snapshot`);
  const route = await api(`/v1/entities/group_route/${report.route_id}`);
  const routerRun = route.router_run_id
    ? await api(`/v1/entities/run/${route.router_run_id}`)
    : null;
  report.route = route;
  report.router_run = routerRun;
  report.snapshot = snapshot;
  await save();
  return {
    snapshot,
    route,
    runs: [...snapshot.runs, ...(routerRun ? [routerRun] : [])] as Entity<"run">[],
  };
}
async function wait(until: (snapshot: any) => boolean) {
  const deadline = Date.now() + 600_000;
  while (Date.now() < deadline) {
    const { snapshot, route, runs } = await observe();
    assert(
      !["rejected", "unknown"].includes(route.state),
      `Route ${route.state}: ${route.error_code}`,
    );
    for (const run of runs) {
      assert(
        !["failed", "cancelled", "unknown"].includes(run.status),
        `${run.id}: ${run.status}/${run.diagnostic?.code}`,
      );
      if (run.status !== "running" || run.agent_id !== report.reviewer_id) continue;
      const interactionResponse = await fetch(`${base}/v1/runs/${run.id}/interactions`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const pending = await interactionResponse.json();
      if (interactionResponse.status === 409 && pending.error?.code === "NATIVE_REJECTED") {
        (report.interaction_poll_races ??= []).push({ run_id: run.id, code: pending.error.code });
        // A native turn can finish during the pending-state read. The next authoritative run read decides the outcome.
        continue;
      }
      assert.equal(interactionResponse.status, 200);
      for (const approval of pending.approvals ?? []) {
        assert.equal(approval.subject.kind, "tool");
        assert(approval.availableChoices.some((c: any) => c.choiceId === "allow_once"));
        await api(`/v1/runs/${run.id}/interactions`, {
          type: "approval",
          request_id: approval.approvalId,
          source_index: approval.currentRequirementId.sourceIndex,
          choice_id: "allow_once",
        });
        report.native_approvals.push({
          run_id: run.id,
          approval_id: approval.approvalId,
          choice: "allow_once",
        });
        await save();
      }
    }
    if (until(snapshot)) return snapshot;
    await Bun.sleep(500);
  }
  throw new Error(
    "Native verification deadline expired; inspect retained outcomes before further dispatch.",
  );
}
try {
  if (phase === "initial") {
    const agents: Entity<"agent">[] = await api("/v1/entities/agent");
    const connections: Entity<"connection">[] = await api("/v1/entities/connection");
    const previous = agents.find(
      (a) =>
        a.harness === "codex" &&
        a.model_id &&
        connections.some(
          (c) =>
            c.id === a.connection_id &&
            c.state === "active" &&
            c.authentication.method === "native_login",
        ),
    );
    assert(previous, "An explicitly provisioned Codex subscription connection is required.");
    // Provision only the already-selected verification key, without exposing its value or duplicating rotating Codex auth.
    const museState = resolve(".dev/nma050/state");
    const db = new Database(join(museState, "ngertiin.sqlite"), { readonly: true });
    const source = db
      .query<{ body: string }, []>(
        "SELECT body FROM entities WHERE kind='connection' AND json_extract(body,'$.id')='dd1a5b4f-065d-4513-8624-65cb20890dfe'",
      )
      .get();
    db.close();
    assert(source);
    const selected = JSON.parse(source.body) as Entity<"connection">;
    assert.equal(selected.authentication.method, "api_key");
    assert(selected.authentication.method === "api_key");
    const credentialRef = crypto.randomUUID();
    const destination = join(directory, "credentials", credentialRef);
    assert(!existsSync(destination));
    copyFileSync(
      join(museState, "credentials", selected.authentication.credential_ref),
      destination,
    );
    chmodSync(destination, 0o600);
    const muse = await api("/v1/connections", {
      harness: "muse",
      authentication: {
        method: "api_key",
        billing_source: "api_key",
        credential_ref: credentialRef,
      },
    });
    const suffix = crypto.randomUUID().slice(0, 8);
    const coordinator = await api("/v1/agents", {
      name: `Coordinator ${suffix}`,
      handle: `coordinator_${suffix}`,
      harness: "codex",
      connection_id: previous.connection_id,
      model_id: previous.model_id,
      reasoning: "medium",
      soul: "Lead analyst who owns calculation, delegation and final reports. Route new requests for a calculation and final report to this agent.",
      instructions:
        "Follow the requested structured collaboration workflow. During continuation, use the bound results and do not repeat handoff or ask for user input again. Never create goals, Routines, external messages or unrelated files.",
    });
    const reviewer = await api("/v1/agents", {
      name: `Reviewer ${suffix}`,
      handle: `reviewer_${suffix}`,
      harness: "muse",
      connection_id: muse.id,
      model_id: "muse-spark-1.3",
      reasoning: "medium",
      soul: "Peer reviewer who independently checks the Coordinator's proposed result after receiving a handoff. The Coordinator owns initial calculation and final reports.",
      instructions:
        "Use structured Ngertiin tools and exact schemas. If asked to check a proposed calculation, independently calculate and use group_ask_user for the requested format review, then end the turn and wait. When a bound user reply is present, finish your review with the checked calculation and chosen format; do not ask again. Do not make goals, Routines, external actions or files.",
    });
    report.coordinator_id = coordinator.id;
    report.reviewer_id = reviewer.id;
    report.connections = {
      codex: await api(`/v1/connections/${coordinator.connection_id}/inspect`, {}),
      muse: await api(`/v1/connections/${muse.id}/inspect`, {}),
    };
    assert.equal(report.connections.codex.effective_billing_source, "subscription");
    assert.equal(report.connections.muse.effective_billing_source, "api_key");
    report.private_canaries = [];
    report.proof_only_cancelled_runs = [];
    for (const agent of [coordinator, reviewer]) {
      const dm = await api(`/v1/agents/${agent.id}/dm`, {});
      const canary = `PRIVATE_DM_${crypto.randomUUID()}`;
      report.private_canaries.push(canary);
      await api("/v1/learning/memories/write", {
        context: { thread_id: dm.id, agent_id: agent.id },
        memory_id: crypto.randomUUID(),
        expected_revision: 0,
        visibility: "dm_private",
        text: canary,
      });
      const queued = await api("/v1/runs", {
        thread_id: dm.id,
        agent_id: agent.id,
        text: `Private transcript canary: ${canary}`,
      });
      const cancelled = await api(`/v1/runs/${queued.run.id}/cancel`, {});
      assert.equal(cancelled.status, "cancelled");
      report.proof_only_cancelled_runs.push(cancelled.id);
    }
    const group = await api("/v1/threads", {
      type: "group",
      member_agent_ids: [coordinator.id, reviewer.id],
    });
    report.group_id = group.id;
    report.handoff_command = crypto.randomUUID();
    report.ask_command = crypto.randomUUID();
    const childInstruction = `Independently review the proposed calculation 18437 + 23569 = 42006. Call ngertiin.list_memories and confirm no private DM fact is available here. Then ask the owner whether the final report should be short or detailed by calling ngertiin.group_ask_user with EXACT arguments ${JSON.stringify({ command_id: report.ask_command, purpose: "review", question: "I checked 18437 + 23569 = 42006. Should the final report be short or detailed?" })}. End the turn and wait after the tool succeeds. On continuation with a bound user reply, report the independent checked sum and chosen format, and do not repeat the question or handoff.`;
    report.handoff_input = {
      command_id: report.handoff_command,
      agent_id: reviewer.id,
      purpose: "review",
      instruction: childInstruction,
    };
    report.send_input = {
      text: `Produce a reviewed final report for the sum 18437 + 23569. The lead Coordinator should calculate it, then invoke ngertiin.group_handoff with EXACT arguments ${JSON.stringify(report.handoff_input)}. End the turn after successful handoff and wait. The Reviewer will check and request my preferred report format. After the review and my reply return through the application's continuation, finish the final report using the checked sum and chosen format; do not delegate again. Use exact schemas from ngertiin.describe_tools. Do not use native file/shell tools or produce pass/skip messages.`,
      router_agent_id: coordinator.id,
    };
    report.send_key = crypto.randomUUID();
    const route = await api(`/v1/groups/${group.id}/messages`, report.send_input, report.send_key);
    report.route_id = route.id;
    await save();
    const snapshot = await wait(
      (s) =>
        s.human_requests.length === 1 &&
        s.runs.every((r: Entity<"run">) => r.status === "succeeded"),
    );
    assert.equal(report.route.selected_agent_id, coordinator.id);
    const request = snapshot.human_requests[0];
    report.request_id = request.id;
    assert.equal(request.agent_id, reviewer.id);
    assert.equal(request.state, "pending");
    assert.equal(snapshot.tasks.find((t: any) => t.id === request.task_id).state, "waiting_user");
    assert.equal(
      snapshot.tasks.find((t: any) => t.id === report.route.task_id).state,
      "waiting_peer",
    );
    const routingPrompt = (await api(`/v1/entities/message/${report.router_run.input_message_id}`))
      .text;
    for (const canary of report.private_canaries) {
      assert(!routingPrompt.includes(canary));
      assert(!JSON.stringify(snapshot).includes(canary));
    }
    assert(
      snapshot.runs.some((r: Entity<"run">) => r.product_tools.includes("ngertiin.group_handoff")),
    );
    assert(
      snapshot.runs.some((r: Entity<"run">) => r.product_tools.includes("ngertiin.group_ask_user")),
    );
    report.checks.push(
      "native_model_routing_selected_coordinator",
      "codex_to_muse_useful_review_and_durable_hitl",
      "private_dm_memory_not_in_group",
      "only_selected_agents_have_runs",
    );
    report.waiting_bindings = snapshot.bindings;
  } else {
    const previous = await Bun.file(".dev/verification/nma-056/native/initial.json").json();
    for (const key of [
      "coordinator_id",
      "reviewer_id",
      "connections",
      "group_id",
      "route_id",
      "request_id",
      "send_key",
      "send_input",
      "private_canaries",
      "waiting_bindings",
      "proof_only_cancelled_runs",
    ])
      report[key] = previous[key];
    const before = await observe();
    const original = await api(
      `/v1/groups/${report.group_id}/messages`,
      report.send_input,
      report.send_key,
    );
    assert.equal(original.id, report.route_id);
    if (before.snapshot.human_requests[0].state === "pending") {
      const input = {
        expected_revision: before.snapshot.human_requests[0].revision,
        text: "Short, please. Include the checked sum and state that it was independently reviewed.",
      };
      const key = crypto.randomUUID();
      const reply = await api(`/v1/human-requests/${report.request_id}/reply`, input, key);
      assert.deepEqual(
        await api(`/v1/human-requests/${report.request_id}/reply`, input, key),
        reply,
      );
      report.reply_retry_verified = true;
    } else {
      assert.equal(before.snapshot.human_requests[0].state, "answered");
      report.already_answered_from_previous_verifier = true;
    }
    const snapshot = await wait((s) => s.tasks.every((t: any) => t.state === "completed"));
    assert.equal(snapshot.tasks.length, 2);
    assert.equal(snapshot.human_requests.length, 1);
    assert(snapshot.tasks.every((t: any) => t.continuation === 1));
    assert.equal(
      snapshot.messages.filter((m: Entity<"message">) => m.purpose === "review").length,
      1,
    );
    assert.equal(
      snapshot.messages.filter((m: Entity<"message">) => m.purpose === "human_reply").length,
      1,
    );
    assert(
      !snapshot.messages.some(
        (m: Entity<"message">) =>
          m.purpose === "continuation" || /^(?:pass|skip|no.response)$/i.test(m.text),
      ),
    );
    for (const binding of report.waiting_bindings)
      assert.equal(
        snapshot.bindings.find(
          (b: Entity<"binding">) => b.agent_id === binding.agent_id && b.active,
        ).native_session_id,
        binding.native_session_id,
      );
    const root = snapshot.tasks.find((t: any) => t.parent_task_id === null);
    const answer = snapshot.messages.find(
      (m: Entity<"message">) => m.id === root.result_message_id,
    );
    assert(/42[,.]?006/.test(answer.text), "Final independently reviewed sum is missing.");
    for (const canary of report.private_canaries)
      assert(!JSON.stringify(snapshot).includes(canary));
    report.checks.push(
      "same_native_sessions_after_restart",
      "bound_human_reply_resumed_child_and_parent_once",
      "handoff_and_reply_retry_no_duplicate_tasks_or_messages",
      "final_independently_reviewed_sum_42006",
      "zero_unselected_or_pass_messages",
    );
  }
  report.passed = report.checks.length;
  report.finished_at = new Date().toISOString();
  await save();
  console.log(JSON.stringify({ output, phase, checks: report.passed }));
} catch (error) {
  report.error = error instanceof Error ? error.message : String(error);
  await save();
  throw error;
}
