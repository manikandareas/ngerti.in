import assert from "node:assert/strict";
import { readdirSync, unlinkSync } from "node:fs";
import { join, resolve } from "node:path";

const base = process.argv[2];
const directory = resolve(process.argv[3]);
assert(base?.startsWith("http://127.0.0.1:"));
const { token } = await Bun.file(join(directory, "installation.json")).json();
const proof = await Bun.file(".dev/verification/nma-056/native/initial.json").json();
const get = async (path: string) => {
  const r = await fetch(`${base}${path}`, { headers: { Authorization: `Bearer ${token}` } });
  assert.equal(r.status, 200);
  return r.json();
};
const ids = new Set([proof.group_id, proof.router_run.thread_id]);
const runs = (await get("/v1/entities/run")).filter((r: { thread_id: string }) =>
  ids.has(r.thread_id),
);
assert.equal(runs.length, 5);
assert(runs.every((r: { status: string }) => r.status === "succeeded"));
for (const kind of ["goal", "routine"])
  assert.equal(
    (await get(`/v1/entities/${kind}`)).filter((x: { thread_id: string }) => ids.has(x.thread_id))
      .length,
    0,
  );
const connection = proof.connections.muse;
const revoked = await fetch(`${base}/v1/connections/${connection.id}/revoke`, {
  method: "POST",
  headers: { Authorization: `Bearer ${token}`, "Idempotency-Key": crypto.randomUUID() },
});
assert.equal(revoked.status, 200);
unlinkSync(join(directory, "credentials", connection.authentication.credential_ref));
const unused = readdirSync(join(directory, "credentials")).filter((name) =>
  /^nma056-[a-f0-9-]{36}$/.test(name),
);
assert.equal(
  unused.length,
  1,
  "Only the failed first provisioning attempt is eligible for removal.",
);
unlinkSync(join(directory, "credentials", unused[0]));
const report = {
  proof_runs: 5,
  succeeded: 5,
  active: 0,
  unknown: 0,
  proof_goals: 0,
  proof_routines: 0,
  generated_muse_connection: "revoked",
  task_generated_credential_copies_removed: 2,
  original_credentials: "preserved",
  codex_connection: "preserved",
  user_data_reset: false,
};
await Bun.write(
  ".dev/verification/nma-056/native/cleanup.json",
  `${JSON.stringify(report, null, 2)}\n`,
);
console.log(JSON.stringify(report));
