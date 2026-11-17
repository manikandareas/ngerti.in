import { Database } from "bun:sqlite";
import { expect, test } from "bun:test";
import { createHash } from "node:crypto";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  backupSQLite,
  inspectSQLite,
  restoreSQLiteBackup,
  verifyBackup,
} from "../../src/persistence/sqlite-import";

test("WAL backup retains uncheckpointed commits and restores as a standalone read-only SQLite file", () => {
  const root = mkdtempSync(join(tmpdir(), "ngertiin-wal-backup-"));
  const source = join(root, "legacy.sqlite"),
    backup = `${root}-backup`,
    restored = `${root}-restored`;
  const database = new Database(source, { create: true });
  const hash = (value: Uint8Array) => createHash("sha256").update(value).digest("hex");
  try {
    database.exec(`
      PRAGMA journal_mode=WAL; PRAGMA wal_autocheckpoint=0;
      PRAGMA application_id=1313294385; PRAGMA user_version=1;
      CREATE TABLE installation(id INTEGER PRIMARY KEY,owner_id TEXT);
      CREATE TABLE entities(seq INTEGER PRIMARY KEY,kind TEXT,id TEXT,body TEXT);
      CREATE TABLE events(cursor INTEGER PRIMARY KEY,body TEXT);
      CREATE TABLE commands(id TEXT PRIMARY KEY,fingerprint TEXT,receipt TEXT);
    `);
    database.query("INSERT INTO installation VALUES(1,?)").run(crypto.randomUUID());
    database
      .query("INSERT INTO commands VALUES(?,?,?)")
      .run("wal-tail", "fixture", '{"committed":true}');
    expect(readFileSync(`${source}-wal`).length).toBeGreaterThan(32);
    const original = readFileSync(source);
    expect(original[18]).toBe(2);
    const snapshot = inspectSQLite(source);
    new Database(`${source}.authority`, { create: true }).close();
    const manifest = backupSQLite(source, root, backup, true);
    expect(manifest.files.some((file) => file.path.startsWith("legacy.sqlite.authority"))).toBe(
      false,
    );
    expect(verifyBackup(backup)).toEqual(manifest);
    restoreSQLiteBackup(backup, restored);
    const restoredPath = join(restored, "legacy.sqlite");
    expect(existsSync(`${restoredPath}-wal`)).toBe(false);
    expect(readFileSync(restoredPath)[18]).toBe(1);
    expect(hash(readFileSync(source))).toBe(hash(original));
    const readOnly = new Database(restoredPath, { readonly: true });
    try {
      expect(readOnly.query("PRAGMA integrity_check").get()).toEqual({ integrity_check: "ok" });
      expect(readOnly.query("SELECT receipt FROM commands WHERE id='wal-tail'").get()).toEqual({
        receipt: '{"committed":true}',
      });
    } finally {
      readOnly.close();
    }
    expect(inspectSQLite(restoredPath).source_sha256).toBe(snapshot.source_sha256);
    expect(inspectSQLite(restoredPath).tables.commands).toEqual(snapshot.tables.commands);
  } finally {
    database.close();
    for (const directory of [root, backup, restored])
      rmSync(directory, { recursive: true, force: true });
  }
});
