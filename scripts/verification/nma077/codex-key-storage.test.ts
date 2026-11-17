import { expect, test } from "bun:test";
import { existsSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { connection, unknownCapabilities } from "../../../apps/server/src/harness/contracts";
import { CredentialContexts } from "../../../apps/server/src/harness/context";
import { CodexAuthority } from "../../../apps/server/src/harness/codex/authority";

test.skipIf(process.env.NGERTIIN_NMA077_CODEX_STORAGE_PROBE !== "1")("native API-key account inspection never persists a duplicate plaintext auth file", async () => {
  const root = mkdtempSync(join(tmpdir(), "ngertiin-native-key-"));
  const now = new Date().toISOString();
  const selected = connection.parse({
    id: crypto.randomUUID(), owner_id: crypto.randomUUID(), kind: "connection", revision: 1,
    created_at: now, updated_at: now, harness: "codex", state: "active", grant_revision: 1,
    authentication: { method: "api_key", billing_source: "api_key", credential_ref: crypto.randomUUID() },
    account_id: null, login: "unknown", discovery: "not_attempted", models: [], inference: "not_attempted", capabilities: unknownCapabilities,
  });
  // Deliberately invalid fixture key: account/read is local, and no catalog or inference request is made.
  const context = new CredentialContexts(root, () => "sk-nma077-fixture-not-a-provider-credential").create(selected);
  const client = new CodexAuthority(Bun.which("codex") as string, context);
  try {
    expect(context.ephemeralAuth).toBe(true);
    await client.initialize();
    expect(await client.inspect()).toMatchObject({ login: "authenticated", auth_method: "api_key", billing_source: "api_key" });
    await client.close();
    expect(existsSync(join(context.env.CODEX_HOME, "auth.json"))).toBe(false);
    const report = { version: "0.169.0", mode: "native_local_account_protocol_with_invalid_fixture_key", provider_inference: "not_attempted", ephemeral_authority: true, native_auth_file_present: false };
    if (process.env.NGERTIIN_NMA077_CODEX_STORAGE_REPORT) writeFileSync(process.env.NGERTIIN_NMA077_CODEX_STORAGE_REPORT, `${JSON.stringify(report, null, 2)}\n`);
  } finally { await client.close(); rmSync(root, { recursive: true, force: true }); }
});
