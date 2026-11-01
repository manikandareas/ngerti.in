import assert from "node:assert/strict";
import { copyFileSync, mkdirSync, writeFileSync } from "node:fs";
import type { Entity } from "../../../apps/server/src/contracts";

const state = ".dev/nma062-native";
const { token } = await Bun.file(`${state}/installation.json`).json();
async function api<T>(path: string, body?: unknown): Promise<T> {
  const response = await fetch(`http://127.0.0.1:8322${path}`, {
    method: body === undefined ? "GET" : "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      "Idempotency-Key": crypto.randomUUID(),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  assert(response.ok, `${path}: ${response.status}`);
  return response.json();
}
assert(
  !(await Bun.file(`${state}/proof.json`).exists()),
  "Use a fresh proof state; never replace a previous cohort.",
);
assert(process.env.MUSE_API_KEY, "Explicit Muse developer-credit key unavailable.");
const proof: Record<string, unknown> = {};
const source = (await Bun.file(".dev/nma060-gate-proof.json").json()).lanes.codex.input
  .connection_id;
const codex = await api<Entity<"connection">>("/v1/connections", {
  harness: "codex",
  authentication: { method: "native_login", billing_source: "subscription" },
});
mkdirSync(`${state}/connections/${codex.id}/codex`, { recursive: true, mode: 0o700 });
copyFileSync(
  `.dev/nma049-native/connections/${source}/codex/auth.json`,
  `${state}/connections/${codex.id}/codex/auth.json`,
);
const ref = crypto.randomUUID();
mkdirSync(`${state}/credentials`, { recursive: true, mode: 0o700 });
writeFileSync(`${state}/credentials/${ref}`, process.env.MUSE_API_KEY, { mode: 0o600, flag: "wx" });
const muse = await api<Entity<"connection">>("/v1/connections", {
  harness: "muse",
  authentication: { method: "api_key", billing_source: "api_key", credential_ref: ref },
});
for (const connection of [codex, muse]) {
  const inspected = await api<Entity<"connection">>(`/v1/connections/${connection.id}/inspect`, {});
  assert.equal(inspected.login, "authenticated");
  const agent = await api<Entity<"agent">>("/v1/agents", {
    name: `NMA062 ${connection.harness}`,
    handle: `proof062_${connection.harness}`,
    harness: connection.harness,
    connection_id: connection.id,
    model_id: connection.harness === "codex" ? "gpt-6.1-sol" : "muse-spark-1.3",
    billing_source: connection.authentication.billing_source,
    instructions:
      "Follow the user's requested verification precisely. Use only scoped Ngertiin tools for requested work. Do not contact people or alter unrelated resources.",
  });
  proof[connection.harness] = { connection: inspected, agent };
}
await Bun.write(`${state}/proof.json`, JSON.stringify({ ...proof, credential_ref: ref }));
console.log("Both isolated native connections authenticated; billing selections retained.");
