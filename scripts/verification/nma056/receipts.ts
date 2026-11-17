import assert from "node:assert/strict";
import { join, resolve } from "node:path";
import { Database } from "bun:sqlite";

const base = process.argv[2];
const directory = resolve(process.argv[3]);
assert(base?.startsWith("http://127.0.0.1:"));
const { token } = await Bun.file(join(directory, "installation.json")).json();
const proof = await Bun.file(".dev/verification/nma-056/native/initial.json").json();
async function api(path: string, body?: unknown, key?: string) {
  const response = await fetch(`${base}${path}`, {
    method: body === undefined ? "GET" : "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      ...(key ? { "Idempotency-Key": key } : {}),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  assert.equal(response.status, 200);
  return response.json();
}
const db = new Database(join(directory, "ngertiin.sqlite"), { readonly: true });
const receipt = db
  .query<{ id: string; receipt: string }, [string]>(
    "SELECT id, receipt FROM commands WHERE json_extract(receipt, '$.id')=? AND json_extract(receipt, '$.state')='answered'",
  )
  .get(proof.request_id);
db.close();
assert(receipt);
const before = await api(`/v1/threads/${proof.group_id}/snapshot`);
assert(before.runs.every((r: { status: string }) => r.status === "succeeded"));
const originalRoute = await api(
  `/v1/groups/${proof.group_id}/messages`,
  proof.send_input,
  proof.send_key,
);
assert.equal(originalRoute.id, proof.route_id);
const reply = {
  expected_revision: 1,
  text: "Short, please. Include the checked sum and state that it was independently reviewed.",
};
const originalReply = await api(`/v1/human-requests/${proof.request_id}/reply`, reply, receipt.id);
assert.deepEqual(originalReply, JSON.parse(receipt.receipt));
assert.deepEqual(
  await api(`/v1/human-requests/${proof.request_id}/reply`, reply, receipt.id),
  originalReply,
);
const after = await api(`/v1/threads/${proof.group_id}/snapshot`);
assert.deepEqual(after, before);
const router = await api(`/v1/entities/run/${proof.route.router_run_id}`);
assert.equal(router.status, "succeeded");
assert.equal(router.product_tools.length, 0);
assert.equal(router.native_tools.length, 0);
const report = {
  planned: 4,
  passed: 4,
  failed: 0,
  skipped: 0,
  checks: [
    "original_group_send_receipt_replayed",
    "original_human_reply_receipt_replayed_twice",
    "zero_extra_events_messages_tasks_or_runs",
    "native_router_zero_product_or_native_tools",
  ],
  group_id: proof.group_id,
  cursor: before.cursor,
  native_application_runs: {
    total: after.runs.length + 1,
    succeeded: after.runs.length + 1,
    failed: 0,
    cancelled: 0,
    unknown: 0,
  },
  proof_only_pre_dispatch_cancelled_runs: proof.proof_only_cancelled_runs,
};
await Bun.write(
  ".dev/verification/nma-056/native/receipts.json",
  `${JSON.stringify(report, null, 2)}\n`,
);
console.log(JSON.stringify(report));
