/** Current retained-machine ticket lifecycle; no provider inference or foreground input. */
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

const repository = resolve(import.meta.dir, "../../../..");
const state = resolve(repository, ".dev/harness-first");
const runtime = JSON.parse(await readFile(resolve(state, "runtime.json"), "utf8"));
const installation = JSON.parse(await readFile(resolve(state, "installation.json"), "utf8"));
const origin = new URL(runtime.url);
assert.equal(origin.hostname, "127.0.0.1");
const call = (path: string, method = "GET", body?: unknown, authenticated = true) =>
  fetch(new URL(path, origin), {
    method,
    redirect: "error",
    headers: {
      ...(authenticated ? { Authorization: `Bearer ${installation.token}` } : {}),
      ...(body === undefined ? {} : { "Content-Type": "application/json" }),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
const before = await (await call("/v1/machine")).json();
assert.equal(before.state, "ready");
let view:
  | { viewer_id: string; viewer_url: string; expires_at: string; interactive: boolean }
  | undefined;
const results: Record<string, unknown> = {};
try {
  const created = await call("/v1/machine/view", "POST", { interactive: false });
  assert.equal(created.status, 200);
  view = await created.json();
  assert(view && !view.interactive);
  const html = await call(view.viewer_url, "GET", undefined, false);
  assert.equal(html.status, 200);
  const content = await html.text();
  assert(
    !content.includes(installation.token),
    "Viewer content must never receive the installation token",
  );
  const renewed = await call(`/v1/machine/views/${view.viewer_id}/renew`, "POST", {});
  assert.equal(renewed.status, 200);
  const renewal = await renewed.json();
  assert(Date.parse(renewal.expires_at) >= Date.parse(view.expires_at));
  const removed = await call(`/v1/machine/views/${view.viewer_id}`, "DELETE");
  assert.equal(removed.status, 200);
  assert.equal((await removed.json()).revoked, true);
  const retired = await call(view.viewer_url, "GET", undefined, false);
  assert.equal(retired.status, 401);
  const retiredRenewal = await call(`/v1/machine/views/${view.viewer_id}/renew`, "POST", {});
  assert.equal(retiredRenewal.status, 401);
  const unauthenticated = await call("/v1/machine", "GET", undefined, false);
  assert.equal(unauthenticated.status, 401);
  results.ticket = {
    id_sha256: createHash("sha256").update(view.viewer_id).digest("hex"),
    readonly: true,
    html_status: html.status,
    renewed_status: renewed.status,
    revoked_status: removed.status,
    retired_html_status: retired.status,
    retired_renewal_status: retiredRenewal.status,
    unauthenticated_machine_status: unauthenticated.status,
    installation_token_in_html: false,
  };
} finally {
  if (view) await call(`/v1/machine/views/${view.viewer_id}`, "DELETE");
}
const after = await (await call("/v1/machine")).json();
assert.equal(after.id, before.id);
assert.deepEqual(after.lease, before.lease);
await writeFile(
  resolve(repository, "docs/verification/nma-070/viewer-api.json"),
  `${JSON.stringify(
    {
      captured_at: new Date().toISOString(),
      contract_version: runtime.contract_version,
      machine_id: before.id,
      executed: 8,
      passed: 8,
      foreground_input: 0,
      results,
    },
    null,
    2,
  )}\n`,
);
console.log("8/8 current ticket lifecycle checks passed; no foreground input or inference.");
