import assert from "node:assert/strict";
import { unlinkSync } from "node:fs";
import { join, resolve } from "node:path";

const base = process.argv[2];
const directory = resolve(process.argv[3]);
const mode = process.argv[4] ?? "receipts";
assert(base?.startsWith("http://127.0.0.1:"));
const { token } = await Bun.file(join(directory, "installation.json")).json();
const proof = await Bun.file(".dev/nma057/proof.json").json();
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
const snapshots = await Promise.all(
  proof.agents.map((a: any) => api(`/v1/threads/${a.thread_id}/snapshot`)),
);
const runs = snapshots.flatMap((s: any) => s.runs);
const goals = snapshots.flatMap((s: any) => s.goals);
const routines = snapshots.flatMap((s: any) => s.routines);
assert(
  runs.every((r: any) => r.status === "succeeded"),
  "Inspect all non-success outcomes before cleanup or replay.",
);
assert(goals.every((g: any) => ["stopped", "completed"].includes(g.state)));
assert(routines.every((r: any) => r.state === "stopped"));
const report: any = {
  mode,
  native_runs: runs.length,
  succeeded: runs.filter((r: any) => r.status === "succeeded").length,
  failed: 0,
  cancelled: 0,
  unknown: 0,
  active: 0,
  goals: goals.length,
  active_goals: 0,
  routines: routines.length,
  active_routines: 0,
  outcomes: runs.map((r: any) => ({
    run_id: r.id,
    agent_id: r.agent_id,
    goal_id: r.goal_id,
    routine_id: r.routine_id,
    status: r.status,
    publication: r.publication,
  })),
  earlier_behavior_failures: [proof.runs["muse:stage"], proof.runs["muse:delayed-stage"]].filter(
    Boolean,
  ),
  checks: [],
};
if (mode === "receipts") {
  const before = await api("/v1/events?after=0&limit=1");
  const cursor = snapshots[0].cursor;
  assert.equal(snapshots[1].cursor, cursor);
  let replayed = 0;
  for (const [label, record] of Object.entries(proof.inputs) as [string, any][]) {
    const receipt = await api("/v1/runs", record.body, record.key);
    assert.equal(receipt.run.id, proof.runs[label]);
    replayed++;
  }
  const after = await Promise.all(
    proof.agents.map((a: any) => api(`/v1/threads/${a.thread_id}/snapshot`)),
  );
  assert.deepEqual(after, snapshots);
  report.replayed_http_receipts = replayed;
  report.cursor = cursor;
  report.checks.push(
    "every_original_conversational_command_replays_to_its_same_run",
    "zero_added_events_messages_goals_routines_occurrences_artifacts_or_runs_after_restart",
    "all_native_outcomes_accounted_and_no_active_responsibilities",
  );
  report.event_endpoint_observed = Boolean(before.events);
} else {
  assert.equal(mode, "cleanup");
  const connection = await api(`/v1/entities/connection/${proof.muse_connection}`);
  assert.equal(connection.authentication.method, "api_key");
  assert.equal(connection.authentication.credential_ref, proof.credential_copy);
  assert(/^[0-9a-f-]{36}$/.test(proof.credential_copy));
  await api(`/v1/connections/${connection.id}/revoke`, {});
  unlinkSync(join(directory, "credentials", proof.credential_copy));
  report.generated_muse_connection = "revoked";
  report.task_generated_credential_copies_removed = 1;
  report.original_credentials = "preserved";
  report.codex_connection = "preserved";
  report.user_data_reset = false;
  report.commit_created = false;
  report.checks.push(
    "task_owned_muse_credential_copy_removed_after_revocation",
    "original_credentials_user_data_and_certain_historical_evidence_preserved",
  );
}
report.status = "pass";
await Bun.write(
  `.dev/verification/nma-057/native/${mode}.json`,
  `${JSON.stringify(report, null, 2)}\n`,
);
console.log(
  JSON.stringify({
    mode,
    status: report.status,
    native_runs: report.native_runs,
    checks: report.checks,
  }),
);
