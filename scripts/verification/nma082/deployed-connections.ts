import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { parseEnv } from "node:util";

if (process.env.NGERTIIN_NMA082_DEPLOYED !== "demo.ngerti.in")
  throw new Error("Select the explicitly authorized NMA-082 deployment.");
process.umask(0o077);
const workspace = JSON.parse(readFileSync(".dev/nma082-live/workspace.json", "utf8"));
const source = JSON.parse(readFileSync(".dev/nma082-live/provider-source.json", "utf8"));
const retained = source.connections.filter((v: any) => v.harness === "codex" && v.state === "active" && v.method === "native_login");
if (retained.length !== 1) throw new Error("Exactly one selected local Codex authority is required.");
const selected = retained[0];
const key = parseEnv(readFileSync(".env", "utf8")).MUSE_API_KEY;
if (!key) throw new Error("The explicitly selected Muse API key is unavailable.");
const target: Record<string, any> = {};
const save = () => writeFileSync(".dev/nma082-live/provider-target.json", JSON.stringify(target, null, 2), { mode: 0o600 });
async function request(path: string, body?: unknown) {
  const response = await fetch(`${workspace.gateway_origin}${path}`, {
    method: body === undefined ? "GET" : "POST",
    headers: {
      Origin: workspace.gateway_origin,
      "X-Ngertiin-Organization": workspace.organization_id,
      ...(body === undefined ? {} : { "Content-Type": "application/json", "Idempotency-Key": crypto.randomUUID() }),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(90000),
  });
  if (!response.ok) throw new Error(`Provider setup request failed: ${path} (${response.status}).`);
  return response.json();
}
const session = await request("/v1/auth/session");
if (session.authentication !== "native" || session.user.id !== workspace.actor_id)
  throw new Error("The intended native Owner session is required.");
const existing = await request("/v1/entities/connection");
if (existing.length > 1 || existing.some((v: any) => v.harness !== "codex" || v.authentication.method !== "native_login" || v.state !== "active" || v.login !== "unknown" || v.discovery !== "not_attempted" || v.models.length))
  throw new Error("Existing configured connections require reconciliation before this one-time setup.");
// Conversations.setup creates this empty private Codex connection with the default agent.
const codex = existing[0] ?? await request("/v1/connections", {
  harness: "codex", authentication: { method: "native_login", billing_source: "subscription" },
});
target.codex = { id: codex.id, stage: "created" }; save();
if (!/^[a-f0-9-]{36}$/.test(codex.id)) throw new Error("Invalid managed connection identity.");
const home = `/srv/ngertiin/state/connections/${codex.id}/codex`;
const child = Bun.spawn(["/usr/bin/ssh", "-o", "BatchMode=yes", "mamvps", `set -e
umask 077
install -d -m 700 -o ngertiin -g ngertiin /srv/ngertiin/state/connections /srv/ngertiin/state/connections/${codex.id} ${home}
set -o noclobber
cat > ${home}/auth.json
chown ngertiin:ngertiin ${home}/auth.json
chmod 600 ${home}/auth.json`], {
  stdin: Bun.file(join(source.state, "connections", selected.id, "codex/auth.json")),
  stdout: "ignore", stderr: "ignore",
});
if (await child.exited !== 0) throw new Error("Private selected Codex authority transfer failed.");
target.codex.stage = "authority_transferred"; save();
const muse = await request("/v1/connections/api-key", { harness: "muse", api_key: key });
target.muse = { id: muse.id, stage: "created" }; save();
for (const harness of ["codex", "muse"] as const) {
  const value = await request(`/v1/connections/${target[harness].id}/inspect`, {});
  const billing = harness === "codex" ? "subscription" : "api_key";
  if (value.login !== "authenticated" || value.discovery !== "succeeded" || value.effective_billing_source !== billing)
    throw new Error(`Selected ${harness} inspection did not establish the intended login/catalog/billing.`);
  const preferred = harness === "codex" ? "gpt-6.1-sol" : "muse-spark-1.3";
  const model = value.models.find((v: any) => v.id === preferred);
  if (!model) throw new Error(`The declared ${harness} verification model is unavailable.`);
  const reasoning = model.reasoning.includes("medium") ? "medium" : null;
  target[harness] = {
    id: value.id, stage: "inspected", model_id: model.id, reasoning,
    billing_source: billing, connection_generation: value.grant_revision,
    account_fingerprint: createHash("sha256").update(value.account_id ?? "").digest("hex").slice(0, 12),
    catalog_count: value.models.length,
  }; save();
  await request("/v1/ai/selections", {
    scope: "user", harness, selection: { connection_id: value.id, model_id: model.id, reasoning },
  });
}
console.log(JSON.stringify({
  completed: true, codex: { login: true, catalog: target.codex.catalog_count, billing: "subscription" },
  muse: { login: true, catalog: target.muse.catalog_count, billing: "api_key" },
  boundary: "Actual selected native account/catalog inspection. Useful inference and product tools are verified separately.",
}));
