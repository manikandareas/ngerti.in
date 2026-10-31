import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { resolve } from "node:path";
import { CodexAdapter } from "../../../apps/server/src/harness/codex/adapter";
import { CredentialContexts } from "../../../apps/server/src/harness/context";
import { MuseAdapter } from "../../../apps/server/src/harness/muse/adapter";

const base = process.argv[2];
const directory = resolve(process.argv[3]);
const harness = process.argv[4];
assert(harness === "codex" || harness === "muse");
const { token } = await Bun.file(resolve(directory, "installation.json")).json();
async function api(path: string) {
  const response = await fetch(`${base}${path}`, { headers: { Authorization: `Bearer ${token}` } });
  assert.equal(response.status, 200);
  return response.json();
}
const previous = await Bun.file(`docs/verification/nma-053/native-${harness}.json`).json();
const proof = previous.results.find(
  (item: any) => item.case === "conversational_stop_native_confirmation",
);
const run = await api(`/v1/entities/run/${proof.run_id}`);
const binding = await api(`/v1/entities/binding/${run.binding_id}`);
const connection = await api(`/v1/entities/connection/${binding.connection_id}`);
const launch = new CredentialContexts(directory).create(connection);
const adapter =
  harness === "codex"
    ? new CodexAdapter(() => "http://127.0.0.1:1/unused")
    : new MuseAdapter(() => "http://127.0.0.1:1/unused");
const executable = Bun.which(harness);
assert(executable);
const client = await adapter.connect({
  ...launch,
  executable,
  connection_id: connection.id,
  agent_id: run.agent_id,
  thread_id: run.thread_id,
  model_id: run.agent_snapshot.model_id,
});
try {
  const observed = await client.inspect();
  assert.equal(observed.account_id, connection.account_id);
  assert.equal(observed.billing_source, connection.authentication.billing_source);
  const receipt = await client.reconcile(
    { native_session_id: binding.native_session_id },
    run.native_run_id,
  );
  assert.equal(receipt.native_run_id, run.native_run_id);
  assert.equal(receipt.native_session_id, binding.native_session_id);
  assert.equal(receipt.status, "cancelled");
  const report = {
    evidence: "native_read_only_receipt",
    harness,
    native_run_id: receipt.native_run_id,
    native_session_id: receipt.native_session_id,
    status: receipt.status,
    text_length: receipt.text.length,
    text_sha256: createHash("sha256").update(launch.redactor.text(receipt.text)).digest("hex"),
    prompt_submissions: 0,
    session_resumes: 0,
  };
  await Bun.write(
    `docs/verification/nma-053/receipt-${harness}.json`,
    `${JSON.stringify(report, null, 2)}\n`,
  );
  console.log(JSON.stringify(report));
} finally {
  await client.close();
}
