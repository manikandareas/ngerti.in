import { Database } from "bun:sqlite";
import assert from "node:assert/strict";
import { chmodSync, copyFileSync, existsSync, mkdirSync } from "node:fs";
import { join, resolve } from "node:path";
import type { Entity } from "../../../apps/server/src/contracts";

const base = process.argv[2];
const directory = resolve(process.argv[3]);
const phase = process.argv[4];
assert(base?.startsWith("http://127.0.0.1:"));
const output = process.argv[5] ?? `.dev/verification/nma-060/final-cohort/goals/${phase}.json`;
const proofFile = resolve(".dev/nma060-goals-proof.json");
mkdirSync(resolve(".dev/nma057"), { recursive: true, mode: 0o700 });
const proof: any = existsSync(proofFile)
  ? await Bun.file(proofFile).json()
  : { runs: {}, inputs: {}, agents: [], checks: [] };
const { token } = await Bun.file(join(directory, "installation.json")).json();
const report: any = {
  phase,
  started_at: new Date().toISOString(),
  checks: [],
  approvals: [],
  observations: {},
};
let writes = Promise.resolve();
const save = () => {
  const state = JSON.stringify(proof, null, 2);
  const retained = `${JSON.stringify(report, null, 2)}\n`;
  writes = writes.then(async () => {
    await Bun.write(proofFile, state);
    await Bun.write(output, retained);
  });
  return writes;
};
async function cohort(action: (agent: any) => Promise<void>) {
  const selected = phase.endsWith("-codex")
    ? proof.agents.filter((a: any) => a.harness === "codex")
    : phase.endsWith("-muse")
      ? proof.agents.filter((a: any) => a.harness === "muse")
      : proof.agents;
  const results = await Promise.allSettled(selected.map(action));
  const failure = results.find((r) => r.status === "rejected");
  if (failure?.status === "rejected") throw failure.reason;
}
async function api(path: string, body?: unknown, key = crypto.randomUUID()) {
  const r = await fetch(`${base}${path}`, {
    method: body === undefined ? "GET" : "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      "Idempotency-Key": key,
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  const value = await r.json();
  assert.equal(r.status, 200, `${path}: ${value.error?.code}`);
  return value;
}
async function snapshot(agent: any) {
  const s = await api(`/v1/threads/${agent.thread_id}/snapshot`);
  report.observations[agent.harness] = s;
  await save();
  return s;
}
async function approvals(run: any) {
  if (
    run.status !== "running" ||
    !proof.agents.some((a: any) => a.id === run.agent_id && a.harness === "muse")
  )
    return;
  const r = await fetch(`${base}/v1/runs/${run.id}/interactions`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const pending = await r.json();
  if (r.status === 409 && ["NATIVE_REJECTED", "NATIVE_UNKNOWN"].includes(pending.error?.code)) {
    report.interaction_poll_races ??= [];
    report.interaction_poll_races.push({ run_id: run.id, code: pending.error.code });
    return;
  }
  assert.equal(r.status, 200);
  for (const p of pending.approvals ?? []) {
    assert.equal(p.subject.kind, "tool");
    assert(p.availableChoices.some((c: any) => c.choiceId === "allow_once"));
    const answer = await fetch(`${base}/v1/runs/${run.id}/interactions`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        type: "approval",
        request_id: p.approvalId,
        source_index: p.currentRequirementId.sourceIndex,
        choice_id: "allow_once",
      }),
    });
    const response = await answer.json();
    if (
      answer.status === 409 &&
      ["NATIVE_REJECTED", "NATIVE_UNKNOWN"].includes(response.error?.code)
    ) {
      report.obsolete_approvals ??= [];
      report.obsolete_approvals.push({
        run_id: run.id,
        approval_id: p.approvalId,
        code: response.error.code,
      });
      continue;
    }
    assert.equal(answer.status, 200);
    report.approvals.push({ run_id: run.id, approval_id: p.approvalId, choice: "allow_once" });
    await save();
  }
}
async function wait(agent: any, until: (s: any) => boolean) {
  const deadline = Date.now() + 600_000;
  while (Date.now() < deadline) {
    const s = await snapshot(agent);
    for (const run of s.runs) {
      assert(
        !["failed", "unknown"].includes(run.status),
        `${agent.harness}: ${run.id} ${run.status}/${run.diagnostic?.code}`,
      );
      await approvals(run);
    }
    if (until(s)) return s;
    await Bun.sleep(700);
  }
  throw new Error("Native verification deadline expired; do not resubmit unknown work.");
}
async function send(label: string, agent: any, text: string, artifacts: string[] = []) {
  const name = `${agent.harness}:${label}`;
  if (!proof.inputs[name]) {
    proof.inputs[name] = {
      key: crypto.randomUUID(),
      body: { thread_id: agent.thread_id, agent_id: agent.id, text, artifact_ids: artifacts },
    };
    await save();
  }
  const input = proof.inputs[name];
  const receipt = await api("/v1/runs", input.body, input.key);
  proof.runs[name] = receipt.run.id;
  await save();
  return wait(
    agent,
    (s) => s.runs.find((r: any) => r.id === receipt.run.id)?.status === "succeeded",
  );
}
try {
  if (phase === "provision") {
    assert.equal(proof.agents.length, 0, "Provision exactly once.");
    const agents = await api("/v1/entities/agent");
    const connections = await api("/v1/entities/connection");
    const previous = agents.find(
      (a: any) =>
        a.harness === "codex" &&
        a.model_id &&
        connections.some(
          (c: any) =>
            c.id === a.connection_id &&
            c.state === "active" &&
            c.authentication.method === "native_login",
        ),
    );
    assert(
      previous,
      "Existing explicit Codex subscription is required; do not duplicate rotating auth.",
    );
    const cohort = await Bun.file(".dev/nma060-gate-proof.json").json();
    const muse = cohort.connection;
    proof.muse_connection = muse.id;
    for (const harness of ["codex", "muse"]) {
      const a = await api("/v1/agents", {
        name: `Responsibility proof ${harness}`,
        handle: `goals_${harness}_${crypto.randomUUID().slice(0, 8)}`,
        harness,
        connection_id: harness === "codex" ? previous.connection_id : muse.id,
        model_id: harness === "codex" ? previous.model_id : "muse-spark-1.3",
        reasoning: "medium",
        soul: "A careful analyst who tracks real responsibilities, respects corrections, and reports verified results.",
        instructions:
          "Use the existing Ngertiin structured tools for persistent responsibilities and scheduling. Keep multiple responsibilities distinct. Read actual attached files when requested; never invent their contents. Do not send external messages or touch unrelated files. For these local proof tasks prefer scoped product file tools over native shell commands. A missing required input is a wait, not a completed result.",
      });
      const dm = await api(`/v1/agents/${a.id}/dm`, {});
      proof.agents.push({ ...a, thread_id: dm.id });
      report[`${harness}_account`] = await api(`/v1/connections/${a.connection_id}/inspect`, {});
      await save();
    }
    assert.equal(report.codex_account.effective_billing_source, "subscription");
    assert.equal(report.muse_account.effective_billing_source, "api_key");
    report.checks.push("explicit_account_and_billing_inspections");
  } else if (phase === "hypothetical") {
    await cohort(async (a: any) => {
      const s = await send(
        "hypothetical",
        a,
        "If I later asked for two calculation reports, could you prepare them? This is only a hypothetical question; I am not asking you to start or schedule any work.",
      );
      assert.equal(s.goals.length, 0);
      assert.equal(s.routines.length, 0);
      report.checks.push(`${a.harness}_hypothetical_has_no_commitment`);
      const workspace = s.workspaces.find((w: any) => w.agent_id === a.id);
      a.inputs = [];
      for (const [name, text] of [
        ["numbers-a.csv", "amount\n18437\n23569\n"],
        ["numbers-b.csv", "amount\n10007\n20011\n"],
      ]) {
        a.inputs.push(
          await api(`/v1/workspaces/${workspace.id}/uploads`, {
            name,
            media_type: "text/csv",
            content_base64: Buffer.from(text).toString("base64"),
          }),
        );
      }
    });
  } else if (phase === "capture") {
    await cohort(async (a: any) => {
      const s = await send(
        "capture",
        a,
        "Please take responsibility for two separate calculation reports. The first report will use numbers-a.csv and the second will use numbers-b.csv. For now, wait for my START-A or START-B respectively before reading or processing either file. Do not do the calculations yet; keep both responsibilities available for later.",
        a.inputs.map((x: any) => x.id),
      );
      assert.equal(s.goals.length, 2);
      assert(s.goals.every((g: any) => g.state === "active" && g.work_state === "waiting"));
      a.goal_a = s.goals.find((g: any) =>
        /numbers-a|first|report a|laporan pertama/i.test(`${g.objective} ${g.title}`),
      )?.id;
      assert(a.goal_a);
      a.goal_b = s.goals.find((g: any) => g.id !== a.goal_a).id;
      report.checks.push(`${a.harness}_ordinary_chat_captures_two_waiting_goals`);
    });
  } else if (phase === "correct") {
    await cohort(async (a: any) => {
      const s = await send(
        "correct",
        a,
        "Correction to the first report only: after adding the amounts from numbers-a.csv, the final result should be twice that subtotal. Keep this as the same responsibility. Continue waiting for START-A, and leave the second report waiting for START-B.",
      );
      assert.equal(s.goals.length, 2);
      assert(
        s.goals.some(
          (g: any) =>
            g.id === a.goal_a && g.revision > 1 && /twice|double|2|dua/i.test(g.objective),
        ),
      );
      assert.equal(s.goals.find((g: any) => g.id === a.goal_b).work_state, "waiting");
      report.checks.push(`${a.harness}_correction_preserves_goal_identity`);
    });
  } else if (phase === "stage") {
    await cohort(async (a: any) => {
      const s = await send(
        "stage",
        a,
        "START-A. Work on the first report in two stages: now read the actual amounts in the attached numbers-a.csv, calculate their sum and save it as subtotal.txt. Then, approximately five minutes after this stage, continue on your own without another message: read subtotal.txt, double that subtotal, write and publish final.txt, and finish the first responsibility with the verified file as evidence. Keep the second report waiting; do not start it.",
        [a.inputs[0].id],
      );
      const goal = s.goals.find((g: any) => g.id === a.goal_a);
      const wake =
        goal.continuation_at ??
        s.routines.find((r: any) => r.goal_id === goal.id && r.state === "active")?.next_run_at;
      assert(wake);
      assert.equal(goal.state, "active");
      assert.equal(goal.work_state, "ready");
      a.wake_at = wake;
      a.native_session = s.bindings.find(
        (b: any) => b.active && b.agent_id === a.id,
      ).native_session_id;
      report.checks.push(`${a.harness}_first_stage_arms_durable_continuation`);
    });
  } else if (phase === "guarded-muse") {
    await cohort(async (a: any) => {
      const before = await snapshot(a);
      const existing = new Set(before.goals.map((g: any) => g.id));
      const s = await send(
        "guarded-stage",
        a,
        "Please take one new, separate responsibility: prepare a delayed version of the first report. In this turn, read the attached numbers-a.csv and write its sum to guarded-subtotal.txt. Do not write the final report in this turn. Record a next step for approximately five minutes later, then end this turn and wait for the application's next run. In that later run, read guarded-subtotal.txt, double it and write and publish guarded-final.txt as the completion evidence. Leave the earlier completed report alone and keep report B waiting.",
        [a.inputs[0].id],
      );
      const goal = s.goals.find((g: any) => !existing.has(g.id));
      assert(goal);
      assert.equal(goal.state, "active");
      assert.equal(goal.work_state, "ready");
      assert(!s.artifacts.some((x: any) => x.name === "guarded-final.txt"));
      const wake =
        goal.continuation_at ??
        s.routines.find((r: any) => r.goal_id === goal.id && r.state === "active")?.next_run_at;
      assert(wake);
      a.original_goal_a = a.goal_a;
      a.goal_a = goal.id;
      a.wake_at = wake;
      a.final_name = "guarded-final.txt";
      a.native_session = s.bindings.find(
        (b: any) => b.active && b.agent_id === a.id,
      ).native_session_id;
      report.checks.push("muse_delayed_stage_ends_before_the_future_step");
    });
  } else if (phase === "resume" || phase === "resume-codex" || phase === "resume-muse") {
    await cohort(async (a: any) => {
      if (!a.native_session) {
        const baseline = await Bun.file(".dev/verification/nma-060/final-cohort/goals/correct.json").json();
        a.native_session = baseline.observations[a.harness].bindings.find(
          (b: any) => b.active && b.agent_id === a.id,
        ).native_session_id;
      }
      const s = await wait(
        a,
        (snapshot) => snapshot.goals.find((g: any) => g.id === a.goal_a)?.state === "completed",
      );
      const goal = s.goals.find((g: any) => g.id === a.goal_a);
      assert(goal.evidence_artifact_ids.length);
      const artifact = s.artifacts.find(
        (x: any) =>
          goal.evidence_artifact_ids.includes(x.id) && x.name === (a.final_name ?? "final.txt"),
      );
      assert(artifact);
      const response = await fetch(
        `${base}/v1/artifacts/${artifact.id}/content?workspace_id=${artifact.workspace_id}`,
        { headers: { Authorization: `Bearer ${token}` } },
      );
      assert.equal(response.status, 200);
      const text = await response.text();
      assert(/84012|84,012/.test(text));
      report[`${a.harness}_final_bytes`] = text;
      assert.equal(
        s.bindings.find((b: any) => b.active && b.agent_id === a.id).native_session_id,
        a.native_session,
      );
      assert.equal(s.goals.find((g: any) => g.id === a.goal_b).work_state, "waiting");
      assert.equal(s.runs.filter((r: any) => r.goal_id === a.goal_a).length, 1);
      report.checks.push(
        `${a.harness}_restart_background_continuation_completes_with_verified_bytes`,
      );
    });
  } else if (phase === "routines") {
    await cohort(async (a: any) => {
      const before = await snapshot(a);
      const workspace = before.workspaces.find((w: any) => w.agent_id === a.id);
      a.monitor_inputs ??= [];
      if (!a.monitor_inputs.length) {
        for (const [name, text] of [
          ["watch.txt", "waiting"],
          ["reminder.txt", "Remember the verified report review: checklist 27."],
        ])
          a.monitor_inputs.push(
            await api(`/v1/workspaces/${workspace.id}/uploads`, {
              name,
              media_type: "text/plain",
              content_base64: Buffer.from(text).toString("base64"),
            }),
          );
        await save();
      }
      const heartbeatAt = new Date(Date.now() + 480_000).toISOString();
      const reminderAt = new Date(Date.now() + 540_000).toISOString();
      const s = await send(
        "routines",
        a,
        `Change the still-waiting second-report responsibility into ongoing checks of the attached watch.txt every six hours, first at ${heartbeatAt}, using timezone Asia/Makassar. On each check, only notify me if the file says changed; if it says waiting, there is no relevant update and I want no chat message. Separately, take a new one-time responsibility at ${reminderAt}: read the attached reminder.txt and write and publish reminder-result.txt with its actual content, then finish that reminder responsibility. Record the schedules now and end this turn. Do not perform either future check in this turn.`,
        a.monitor_inputs.map((x: any) => x.id),
      );
      const heartbeat = s.routines.find(
        (r: any) =>
          r.goal_id === a.goal_b &&
          r.state === "active" &&
          ["heartbeat", "interval"].includes(r.schedule.type),
      );
      const reminder = s.routines.find(
        (r: any) =>
          r.state === "active" && r.schedule.type === "once" && /reminder/i.test(r.instruction),
      );
      assert(heartbeat);
      assert(reminder);
      assert.equal(heartbeat.timezone, "Asia/Makassar");
      a.native_periodic_type = heartbeat.schedule.type;
      a.heartbeat_id = heartbeat.id;
      a.reminder_id = reminder.id;
      a.reminder_goal = reminder.goal_id;
      a.initial_routine_generations = {
        heartbeat: heartbeat.generation,
        reminder: reminder.generation,
      };
      assert(!s.artifacts.some((x: any) => x.name === "reminder-result.txt"));
      report.checks.push(`${a.harness}_ordinary_chat_creates_one_shot_and_heartbeat`);
    });
  } else if (phase === "revise-routines") {
    await cohort(async (a: any) => {
      const heartbeatAt = new Date(Date.now() + 180_000).toISOString();
      const reminderAt = new Date(Date.now() + 210_000).toISOString();
      const s = await send(
        "revise-routines",
        a,
        `Revise the two existing schedules, preserving their identities and responsibilities: the periodic watch.txt check should use a heartbeat Routine every twelve hours instead, first at ${heartbeatAt}; the one-time reminder should move to ${reminderAt}. Keep timezone Asia/Makassar and all original quiet/result instructions. End this turn after recording those changes; do not execute the checks early.`,
      );
      const heartbeat = s.routines.find((r: any) => r.id === a.heartbeat_id);
      const reminder = s.routines.find((r: any) => r.id === a.reminder_id);
      assert.equal(heartbeat.schedule.every_ms, 43_200_000);
      assert.equal(heartbeat.schedule.type, "heartbeat");
      assert(heartbeat.generation > a.initial_routine_generations.heartbeat);
      assert(reminder.generation > a.initial_routine_generations.reminder);
      assert.equal(reminder.schedule.type, "once");
      a.edited_routines = { heartbeat, reminder };
      report.checks.push(`${a.harness}_conversation_edits_existing_routine_generations`);
    });
  } else if (phase === "ticks") {
    await cohort(async (a: any) => {
      const s = await wait(a, (snapshot) => {
        const occurrences = snapshot.occurrences.filter((o: any) =>
          [a.heartbeat_id, a.reminder_id].includes(o.routine_id),
        );
        return (
          occurrences.length === 2 &&
          occurrences.every(
            (o: any) => snapshot.runs.find((r: any) => r.id === o.run_id)?.status === "succeeded",
          ) &&
          (!a.reminder_goal ||
            snapshot.goals.find((g: any) => g.id === a.reminder_goal)?.state === "completed")
        );
      });
      const occurrences = s.occurrences.filter((o: any) =>
        [a.heartbeat_id, a.reminder_id].includes(o.routine_id),
      );
      assert.equal(occurrences.length, 2);
      const quietOccurrence = occurrences.find((o: any) => o.routine_id === a.heartbeat_id);
      const quiet = s.runs.find((r: any) => r.id === quietOccurrence.run_id);
      assert.equal(quiet.publication, "quiet");
      assert(quiet.product_tools.includes("ngertiin.routine_no_update"));
      assert(!s.messages.some((m: any) => m.run_id === quiet.id));
      const reminder = s.runs.find(
        (r: any) => r.id === occurrences.find((o: any) => o.routine_id === a.reminder_id).run_id,
      );
      const artifact = s.artifacts.find(
        (x: any) => x.run_id === reminder.id && x.name === "reminder-result.txt",
      );
      assert(artifact);
      const response = await fetch(
        `${base}/v1/artifacts/${artifact.id}/content?workspace_id=${artifact.workspace_id}`,
        { headers: { Authorization: `Bearer ${token}` } },
      );
      assert.equal(response.status, 200);
      assert((await response.text()).includes("checklist 27"));
      report.checks.push(
        `${a.harness}_restart_runs_edited_occurrences_once_and_suppresses_quiet_tick`,
      );
    });
  } else if (phase === "stop-goals") {
    await cohort(async (a: any) => {
      const s = await send(
        "stop-goals",
        a,
        "Stop the ongoing watch.txt responsibility entirely, including all of its future checks. Do not merely stop a single run. Keep the completed report and reminder evidence.",
      );
      assert.equal(s.goals.find((g: any) => g.id === a.goal_b).state, "stopped");
      assert.equal(s.routines.find((r: any) => r.id === a.heartbeat_id).state, "stopped");
      report.checks.push(`${a.harness}_conversational_goal_stop_disables_future_occurrences`);
    });
  } else throw new Error("Unknown phase.");
  report.status = "pass";
} catch (error) {
  report.status = "fail";
  report.error = error instanceof Error ? error.message : "Unknown error";
  process.exitCode = 1;
}
report.finished_at = new Date().toISOString();
await save();
console.log(
  JSON.stringify({ phase, status: report.status, checks: report.checks, error: report.error }),
);
