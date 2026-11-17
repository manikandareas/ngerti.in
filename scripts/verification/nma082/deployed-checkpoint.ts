import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

if (process.env.NGERTIIN_NMA082_DEPLOYED !== "demo.ngerti.in")
  throw new Error("Select the explicitly authorized NMA-082 deployment.");
process.umask(0o077);
const release = "/opt/ngertiin/current";
const { loadOperations } = await import(`${release}/apps/server/src/operations/files.ts`);
const { offlineDatabase } = await import(`${release}/apps/server/src/operations/database.ts`);
const { CredentialStorage } = await import(`${release}/apps/server/src/harness/credential-storage.ts`);
const { CredentialContexts } = await import(`${release}/apps/server/src/harness/context.ts`);
const { CodexAuthority } = await import(`${release}/apps/server/src/harness/codex/authority.ts`);
const { config, env } = loadOperations("/etc/ngertiin/operations.json");
Object.assign(process.env, env);
const action = process.argv[2];
if (!["capture", "audit", "revoke", "refresh"].includes(action)) throw new Error("Choose an explicit checkpoint action.");
const providers = JSON.parse(readFileSync("/srv/ngertiin/operator-secrets/provider-target.json", "utf8"));
const fixture = JSON.parse(readFileSync("/srv/ngertiin/operator-secrets/isolation.json", "utf8"));
const path = "/srv/ngertiin/operator-secrets/recovery-checkpoint.json";
const hash = (value: any) => createHash("sha256").update(typeof value === "string" || Buffer.isBuffer(value) ? value : JSON.stringify(value)).digest("hex");
const database = await offlineDatabase(env);
try {
  const owner = (await database.query('SELECT b.user_id,u.email,u."emailVerified" FROM ngertiin_auth.ngertiin_owner_binding b JOIN ngertiin_auth."user" u ON u.id=b.user_id WHERE b.id=1')).rows;
  if (owner.length !== 1 || owner[0].email !== "vitoandareas15@gmail.com" || !owner[0].emailVerified)
    throw new Error("The intended verified Owner binding is required.");
  const roster = (await database.query('SELECT id,"userId","organizationId",role FROM ngertiin_auth.member ORDER BY id')).rows;
  const responsibilities = (await database.query("SELECT kind,count(*)::int AS count FROM ngertiin_app.entities WHERE kind IN ('goal','routine') GROUP BY kind ORDER BY kind")).rows;
  const pending = Number((await database.query("SELECT count(*) FROM ngertiin_app.entities WHERE kind='run' AND body->>'status' NOT IN ('succeeded','failed','cancelled')")).rows[0].count);
  if (responsibilities.length || pending) throw new Error("Resolve active work before this bounded recovery rehearsal.");
  const connection = (await database.query("SELECT body FROM ngertiin_app.entities WHERE kind='connection' AND id=$1", [providers.codex.id])).rows[0]?.body;
  if (!connection || connection.authentication.method !== "native_login" || connection.authentication.billing_source !== "subscription")
    throw new Error("The selected Codex subscription authority is required.");
  const authPath = join(config.state_dir, "connections", connection.id, "codex", "auth.json");
  const authority = JSON.parse(readFileSync(authPath, "utf8"));
  const current = { owner, roster, responsibilities, pending, installation: JSON.parse(readFileSync(join(config.state_dir, "installation.json"), "utf8")).owner_id, provider_key_sha256: hash(readFileSync(join(config.trust_dir, "provider.key"))), codex_auth_sha256: hash(readFileSync(authPath)), codex_connection_id: connection.id };
  if (action === "capture") {
    if (existsSync(path)) throw new Error("Preserve the original checkpoint before repeating capture.");
    writeFileSync(path, JSON.stringify(current, null, 2), { mode: 0o600, flag: "wx" });
    console.log(JSON.stringify({ checkpoint: "captured", owner_verified: true, memberships: roster.length, pending_runs: pending, goals: 0, routines: 0 }));
  } else if (action === "audit") {
    const saved = JSON.parse(readFileSync(path, "utf8"));
    if (JSON.stringify(current) !== JSON.stringify(saved)) throw new Error("Offline owner/roster/provider checkpoint differs after restore.");
    const storage = new CredentialStorage(config.state_dir);
    let denied = false;
    try { storage.assertActive(fixture.synthetic_connection_id); } catch { denied = true; }
    if (!denied) throw new Error("The independently retained newer provider revocation was resurrected.");
    console.log(JSON.stringify({ checkpoint: "reconciled-before-start", owner_binding: true, memberships: roster.length, provider_identity_and_refresh_bytes: true, latest_revocation: true, pending_runs: 0, goals: 0, routines: 0 }));
  } else if (action === "revoke") {
    new CredentialStorage(config.state_dir).retire(fixture.synthetic_connection_id, fixture.synthetic_credential_ref);
    const latest = "/srv/ngertiin/operator-secrets/latest-revocations";
    mkdirSync(latest, { recursive: true, mode: 0o700 });
    writeFileSync(join(latest, fixture.synthetic_connection_id), "revoked\n", { mode: 0o600 });
    console.log(JSON.stringify({ synthetic_connection_revoked_after_snapshot: true, real_providers_unchanged: true }));
  } else {
    const context = new CredentialContexts(config.state_dir).create(connection);
    const client = new CodexAuthority("/opt/ngertiin/bin/codex", context);
    try {
      await client.initialize();
      await client.rpc.request("account/read", { refreshToken: true });
      const inspection = await client.inspect();
      const refreshed = JSON.parse(readFileSync(authPath, "utf8"));
      if (inspection.login !== "authenticated" || inspection.account_id !== connection.account_id || inspection.billing_source !== "subscription")
        throw new Error("Codex refresh changed the selected account or billing.");
      const report = { refresh_requested: true, account_unchanged: true, billing: inspection.billing_source, access_token_rotated: authority.tokens.access_token !== refreshed.tokens.access_token, refresh_token_rotated: authority.tokens.refresh_token !== refreshed.tokens.refresh_token, native_last_refresh_changed: authority.last_refresh !== refreshed.last_refresh };
      writeFileSync("/srv/ngertiin/operator-secrets/refresh-report.json", JSON.stringify(report), { mode: 0o600 });
      console.log(JSON.stringify(report));
    } finally { await client.close(); }
  }
} finally { await database.end(); }
