import { Database } from "bun:sqlite";
import { createHash } from "node:crypto";
import {
  chmodSync,
  existsSync,
  lstatSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { basename, dirname, join, relative, resolve } from "node:path";
import { canonical, Store, type StoreOptions } from "../store";

const digest = (bytes: Uint8Array | string) => createHash("sha256").update(bytes).digest("hex");
const tables = [
  "entities",
  "events",
  "commands",
  "routing_traces",
  "conversation_parts",
  "conversation_projection",
] as const;
type Table = (typeof tables)[number];
type Row = Record<string, unknown>;
export type ImportSnapshot = {
  owner_id: string;
  source_sha256: string;
  sqlite: string;
  tables: Record<Table, Row[]>;
  native_bindings: {
    id: unknown;
    connection_id: unknown;
    native_session_id: unknown;
    treatment: string;
  }[];
};

/** A read-only, transaction-consistent legacy snapshot. No credential or live configuration writes. */
export function inspectSQLite(source: string): ImportSnapshot {
  const sqlite = resolve(source);
  if (!lstatSync(sqlite).isFile() || lstatSync(sqlite).isSymbolicLink())
    throw new Error("A regular SQLite source file is required.");
  const db = new Database(sqlite, { readonly: true, strict: true });
  try {
    db.exec("BEGIN");
    const app = db.query<{ application_id: number }, []>("PRAGMA application_id").get();
    const version = db.query<{ user_version: number }, []>("PRAGMA user_version").get();
    if (app?.application_id !== 0x4e474831 || version?.user_version !== 1)
      throw new Error("Unsupported legacy database.");
    const owner = db
      .query<{ owner_id: string }, []>("SELECT owner_id FROM installation WHERE id=1")
      .get();
    if (!owner) throw new Error("Missing legacy owner identity.");
    const present = new Set(
      db
        .query<{ name: string }, []>("SELECT name FROM sqlite_master WHERE type='table'")
        .all()
        .map((row) => row.name),
    );
    const data = Object.fromEntries(
      tables.map((table) => [
        table,
        present.has(table)
          ? (db
              .query(
                `SELECT * FROM ${table} ORDER BY ${table === "events" ? "cursor" : table === "conversation_parts" ? "sequence" : table === "commands" ? "id" : table === "conversation_projection" ? "id" : "seq"}`,
              )
              .all() as Row[])
          : [],
      ]),
    ) as Record<Table, Row[]>;
    const bytes = db.serialize();
    return {
      owner_id: owner.owner_id,
      source_sha256: digest(bytes),
      sqlite,
      tables: data,
      native_bindings: data.entities
        .filter((row) => row.kind === "binding")
        .map((row) => {
          const body = JSON.parse(String(row.body));
          return {
            id: row.id,
            connection_id: body.connection_id,
            native_session_id: body.native_session_id,
            treatment:
              "Retain legacy owner and binding identity; no credential copying or native resume during import.",
          };
        }),
    };
  } finally {
    db.close();
  }
}

export type BackupManifest = {
  version: 1;
  owner_id: string;
  database: string;
  files: { path: string; sha256: string; mode: number }[];
  external_private_files: { path: string; sha256: string }[];
};
/** Offline backup. Private stores are copied only with the explicit includePrivateState option. */
export function backupSQLite(
  source: string,
  stateDir: string,
  destination: string,
  includePrivateState = false,
): BackupManifest {
  const sourceRoot = resolve(stateDir),
    target = resolve(destination),
    sqlite = resolve(source);
  if (target === sourceRoot || target.startsWith(`${sourceRoot}/`))
    throw new Error("Backup destination must be outside the source state directory.");
  if (existsSync(target)) throw new Error("Backup destination must not exist.");
  const guard = existsSync(`${sqlite}.authority`)
    ? new Database(`${sqlite}.authority`, { strict: true })
    : null;
  try {
    guard?.exec("PRAGMA busy_timeout=0; BEGIN EXCLUSIVE");
    const snapshot = inspectSQLite(sqlite);
    mkdirSync(target, { recursive: true, mode: 0o700 });
    const manifest: BackupManifest = {
      version: 1,
      owner_id: snapshot.owner_id,
      database: basename(sqlite),
      files: [],
      external_private_files: [],
    };
    const walk = (directory: string) => {
      for (const name of readdirSync(directory)) {
        const file = join(directory, name),
          rel = relative(sourceRoot, file),
          stat = lstatSync(file);
        if (stat.isSymbolicLink()) throw new Error("Backup refuses symbolic links.");
        if (
          [sqlite, `${sqlite}-wal`, `${sqlite}-shm`, `${sqlite}.authority`].includes(file) ||
          ["runtime.json", "runtime.lock"].includes(rel)
        )
          continue;
        if (stat.isDirectory()) {
          walk(file);
          continue;
        }
        if (!stat.isFile()) throw new Error("Backup refuses special files.");
        const bytes = readFileSync(file);
        if (
          !includePrivateState &&
          (["credentials", "connections", "harnesses", "native", "provider", "providers"].includes(
            rel.split("/")[0],
          ) ||
            rel === "installation.json")
        ) {
          manifest.external_private_files.push({ path: rel, sha256: digest(bytes) });
          continue;
        }
        const mode = stat.mode & 0o100 ? 0o700 : 0o600;
        const output = join(target, rel);
        mkdirSync(resolve(output, ".."), { recursive: true, mode: 0o700 });
        writeFileSync(output, bytes, { mode, flag: "wx" });
        manifest.files.push({ path: rel, sha256: digest(bytes), mode });
      }
    };
    walk(sourceRoot);
    const db = new Database(sqlite, { readonly: true });
    try {
      const bytes = db.serialize();
      writeFileSync(join(target, manifest.database), bytes, { mode: 0o600, flag: "wx" });
      manifest.files.push({ path: manifest.database, sha256: digest(bytes), mode: 0o600 });
    } finally {
      db.close();
    }
    writeFileSync(join(target, "backup-manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`, {
      mode: 0o600,
      flag: "wx",
    });
    verifyBackup(target);
    return manifest;
  } finally {
    guard?.close();
  }
}
export function verifyBackup(directory: string): BackupManifest {
  const root = resolve(directory);
  const manifest = JSON.parse(
    readFileSync(join(root, "backup-manifest.json"), "utf8"),
  ) as BackupManifest;
  if (manifest.version !== 1) throw new Error("Unsupported backup manifest.");
  for (const file of manifest.files) {
    const path = resolve(root, file.path);
    if (
      !path.startsWith(`${root}/`) ||
      lstatSync(path).isSymbolicLink() ||
      digest(readFileSync(path)) !== file.sha256
    )
      throw new Error("Backup hash verification failed.");
  }
  return manifest;
}
/** Restore to a new directory. An operator switches authority separately; divergent writers never merge. */
export function restoreSQLiteBackup(backup: string, destination: string, privateSource?: string) {
  const manifest = verifyBackup(backup),
    target = resolve(destination);
  if (existsSync(target)) throw new Error("Restore destination must not exist.");
  if (manifest.external_private_files.length && !privateSource)
    throw new Error(
      "Restore requires the unchanged private store or an explicit private-state backup.",
    );
  for (const file of manifest.external_private_files) {
    const source = resolve(privateSource as string, file.path);
    if (
      !source.startsWith(`${resolve(privateSource as string)}/`) ||
      lstatSync(source).isSymbolicLink() ||
      digest(readFileSync(source)) !== file.sha256
    )
      throw new Error("Private-state reference changed; restore cannot proceed.");
  }
  mkdirSync(target, { recursive: true, mode: 0o700 });
  for (const file of manifest.files) {
    const output = join(target, file.path);
    mkdirSync(resolve(output, ".."), { recursive: true, mode: 0o700 });
    writeFileSync(output, readFileSync(join(backup, file.path)), { mode: 0o600, flag: "wx" });
    chmodSync(output, file.mode & 0o100 ? 0o700 : 0o600);
  }
  return {
    owner_id: manifest.owner_id,
    restored_files: manifest.files.length,
    external_private_files: manifest.external_private_files,
  };
}

function rowsFor(snapshot: ImportSnapshot, table: Table): Row[] {
  return snapshot.tables[table].map((row) => {
    if (table === "entities")
      return {
        ...row,
        owner_id: snapshot.owner_id,
        organization_id: null,
        actor_id: null,
        body: JSON.parse(String(row.body)),
      };
    if (table === "events")
      return {
        ...row,
        owner_id: snapshot.owner_id,
        organization_id: null,
        actor_id: null,
        body: JSON.parse(String(row.body)),
      };
    if (table === "commands")
      return {
        ...row,
        scope: canonical([snapshot.owner_id, null, snapshot.owner_id, null, null]),
        membership_generation: null,
        receipt: JSON.parse(String(row.receipt)),
      };
    if (table === "routing_traces" || table === "conversation_parts")
      return { ...row, organization_id: null, actor_id: null, body: JSON.parse(String(row.body)) };
    return row;
  });
}
export async function reconcileImport(store: Store, snapshot: ImportSnapshot) {
  const comparison: Record<string, { expected: number; actual: number; equal: boolean }> = {};
  for (const table of tables) {
    const expected = rowsFor(snapshot, table),
      actual = (await store.query(`SELECT * FROM ${table}`)).rows;
    const normalize = (rows: Row[]) =>
      rows
        .map((row) =>
          Object.fromEntries(
            Object.entries(row).map(([key, value]) => [
              key,
              ["seq", "cursor", "sequence"].includes(key) ? Number(value) : value,
            ]),
          ),
        )
        .map(canonical)
        .sort();
    comparison[table] = {
      expected: expected.length,
      actual: actual.length,
      equal: canonical(normalize(expected)) === canonical(normalize(actual)),
    };
  }
  return { equal: Object.values(comparison).every((row) => row.equal), tables: comparison };
}
export function verifyArtifactBytes(snapshot: ImportSnapshot, stateDir: string) {
  return snapshot.tables.entities
    .filter((row) => row.kind === "artifact")
    .map((row) => {
      const artifact = JSON.parse(String(row.body)) as {
        id: string;
        storage_key: string;
        sha256: string;
        size_bytes?: number;
      };
      if (!/^[a-zA-Z0-9_-]+$/.test(artifact.storage_key))
        throw new Error("Invalid legacy artifact key.");
      const root = join(resolve(stateDir), "artifact-bytes");
      if (lstatSync(root).isSymbolicLink())
        throw new Error("Artifact root must not be a symbolic link.");
      const file = join(root, artifact.storage_key),
        stat = lstatSync(file);
      if (!stat.isFile() || stat.isSymbolicLink() || stat.nlink !== 1)
        throw new Error("Artifact bytes must be immutable regular files.");
      const bytes = readFileSync(file);
      if (
        digest(bytes) !== artifact.sha256 ||
        (artifact.size_bytes !== undefined && artifact.size_bytes !== bytes.length)
      )
        throw new Error("Legacy artifact hash mismatch.");
      return {
        id: artifact.id,
        storage_key: artifact.storage_key,
        sha256: artifact.sha256,
        size_bytes: bytes.length,
      };
    });
}

export async function importSQLite(
  source: string,
  statePath: string,
  options: StoreOptions,
  apply = false,
) {
  const snapshot = inspectSQLite(source);
  const artifacts = verifyArtifactBytes(snapshot, dirname(source));
  const report = {
    artifacts,
    legacy_owner_id: snapshot.owner_id,
    source_sha256: snapshot.source_sha256,
    counts: Object.fromEntries(tables.map((table) => [table, snapshot.tables[table].length])),
    native_bindings: snapshot.native_bindings,
    mapping: {
      legacy_owner_id: snapshot.owner_id,
      user_id: null,
      organization_id: null,
      binding_milestones: ["NMA-073", "NMA-074", "NMA-075"],
      multi_user_enabled: false,
    },
    credentials_copied: false,
  };
  if (!apply) return { ...report, applied: false };
  const guard = existsSync(`${source}.authority`)
    ? new Database(`${source}.authority`, { strict: true })
    : null;
  let store: Store | undefined;
  try {
    guard?.exec("PRAGMA busy_timeout=0; BEGIN EXCLUSIVE");
    if (inspectSQLite(source).source_sha256 !== snapshot.source_sha256)
      throw new Error("SQLite changed after inspection; repeat the import.");
    verifyArtifactBytes(snapshot, dirname(statePath));
    store = await Store.open(statePath, snapshot.owner_id, options);
    const target = store;
    const comparison = await target.transaction(async () => {
      await target.assertEmptyImportTarget();
      await target.query("DELETE FROM conversation_projection");
      for (const table of tables)
        for (const row of rowsFor(snapshot, table)) {
          if (Object.keys(row).some((column) => !/^[a-z_]+$/.test(column)))
            throw new Error("Unsupported legacy table columns.");
          const columns = Object.keys(row),
            values = Object.values(row).map((value) =>
              value && typeof value === "object" ? JSON.stringify(value) : value,
            );
          await target.query(
            `INSERT INTO ${table}(${columns.join(",")}) VALUES(${values.map((_, index) => `$${index + 1}`).join(",")})`,
            values,
          );
        }
      await target.restoreLegacySequences();
      await target.query(
        "UPDATE installation SET event_clock=(SELECT COALESCE(MAX(cursor),0) FROM events) WHERE id=1",
      );
      const result = await reconcileImport(target, snapshot);
      if (!result.equal) throw new Error("Import reconciliation failed.");
      return result;
    });
    return { ...report, applied: true, comparison };
  } finally {
    await store?.close();
    guard?.close();
  }
}
