import { Database } from "bun:sqlite";
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { Artifacts } from "../../../apps/server/src/artifacts";
import {
  backupSQLite,
  importSQLite,
  inspectSQLite,
  restoreSQLiteBackup,
  verifyArtifactBytes,
  verifyBackup,
} from "../../../apps/server/src/persistence/sqlite-import";
import { Workspaces } from "../../../apps/server/src/workspaces/service";
import { fixture } from "../../../apps/server/tests/helpers";
import { exportLegacyFixture } from "../../../apps/server/tests/persistence/legacy-fixture";

const f = await fixture();
const source = join(f.dir, "legacy.sqlite"),
  backup = `${f.dir}-backup`,
  restored = `${f.dir}-restored`;
const hash = (bytes: Uint8Array) => createHash("sha256").update(bytes).digest("hex");
const check = (value: boolean, message: string) => {
  if (!value) throw new Error(message);
  return true;
};
try {
  await f.bind();
  await f.store.command(crypto.randomUUID(), {}, () => f.admit("Disposable migration history"));
  await f.store.recordRoutingTrace({
    route_id: crypto.randomUUID(),
    attempt_id: crypto.randomUUID(),
    policy_version: "disposable-import-fixture",
    events: [],
  });
  const workspace = await new Workspaces(f.lifecycle).ensure(f.thread.id, f.agent.id);
  const artifact = await new Artifacts(f.lifecycle).upload(workspace.id, crypto.randomUUID(), {
    name: "retained.txt",
    media_type: "text/plain",
    content_base64: Buffer.from("Disposable immutable migration bytes").toString("base64"),
  });
  await exportLegacyFixture(f.store, source);
  mkdirSync(join(f.dir, "credentials"));
  writeFileSync(join(f.dir, "credentials", "fixture-key"), "disposable-private-fixture", {
    mode: 0o600,
  });
  const snapshot = inspectSQLite(source);
  const targetOptions = {
    ...f.options,
    schema: `import_${crypto.randomUUID().replaceAll("-", "")}`,
  };
  // Use the fixture's connection for cleanup without opening another lifecycle authority.
  try {
    const dry = await importSQLite(source, join(f.dir, "target.postgres"), targetOptions);
    const guard = new Database(`${source}.authority`, { create: true });
    let backupBlocked = false,
      importBlocked = false;
    try {
      guard.exec("BEGIN EXCLUSIVE");
      try {
        backupSQLite(source, f.dir, backup, true);
      } catch {
        backupBlocked = true;
      }
      try {
        await importSQLite(source, join(f.dir, "target.postgres"), targetOptions, true);
      } catch {
        importBlocked = true;
      }
    } finally {
      guard.close();
    }
    check(
      backupBlocked && importBlocked,
      "A live legacy authority must prevent backup and import.",
    );
    const manifest = backupSQLite(source, f.dir, backup, true);
    verifyBackup(backup);
    const applied = await importSQLite(source, join(f.dir, "target.postgres"), targetOptions, true);
    const restore = restoreSQLiteBackup(backup, restored);
    const restoredSnapshot = inspectSQLite(join(restored, "legacy.sqlite"));
    const checks = {
      dry_run_no_apply: check(!dry.applied, "Dry run applied changes."),
      live_authority_backup_refused: backupBlocked,
      live_authority_import_refused: importBlocked,
      all_tables_equal: check(
        "comparison" in applied && applied.comparison.equal,
        "Imported tables differ.",
      ),
      restored_database_bytes: check(
        hash(readFileSync(source)) === hash(readFileSync(join(restored, "legacy.sqlite"))),
        "Restored SQLite bytes differ.",
      ),
      restored_snapshot: check(
        snapshot.source_sha256 === restoredSnapshot.source_sha256,
        "Restored SQLite snapshot differs.",
      ),
      restored_artifact_hash: check(
        verifyArtifactBytes(restoredSnapshot, restored)[0]?.sha256 === artifact.sha256,
        "Restored artifact hash differs.",
      ),
      explicit_private_state_restore: check(
        hash(readFileSync(join(restored, "credentials", "fixture-key"))) ===
          hash(readFileSync(join(f.dir, "credentials", "fixture-key"))),
        "Explicit private-state restore differs.",
      ),
      legacy_owner_unbound: check(
        applied.mapping.legacy_owner_id === f.owner && !applied.mapping.multi_user_enabled,
        "The legacy owner mapping changed.",
      ),
    };
    console.log(
      JSON.stringify(
        {
          verified_at: new Date().toISOString(),
          bun: Bun.version,
          postgres: (await f.store.query("SHOW server_version")).rows[0].server_version,
          fixture: "Synthetic PostgreSQL domain exported into the legacy SQLite schema",
          dry_run: dry,
          import: applied,
          backup: manifest,
          restore,
          checks,
          pass: Object.values(checks).length,
          fail: 0,
          limitations: [
            "Disposable history and private-state fixture only; no retained installation or real credentials used.",
            "No live cutover, provider refresh-state restore, PostgreSQL backup restore or deployment claim.",
          ],
        },
        null,
        2,
      ),
    );
  } finally {
    await f.store.query(`DROP SCHEMA IF EXISTS "${targetOptions.schema}" CASCADE`);
  }
} finally {
  await f.close();
  rmSync(backup, { recursive: true, force: true });
  rmSync(restored, { recursive: true, force: true });
}
