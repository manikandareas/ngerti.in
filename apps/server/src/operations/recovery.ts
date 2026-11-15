import { randomUUID } from "node:crypto";
import {
  chmodSync,
  copyFileSync,
  existsSync,
  linkSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  renameSync,
  rmSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { dirname, join, resolve } from "node:path";
import { z } from "zod";
import { databaseFingerprint, sqlName } from "./database";
import { decryptBackup, encryptBackup } from "./encryption";
import {
  loadOperations,
  privateDirectory,
  privateFile,
  run,
  sha256,
  syncDirectory,
  writeOperatorFile,
} from "./files";
import { maintenance, retainedDomains } from "./maintenance";

const fingerprint = z.record(z.string(), z.strictObject({ count: z.string(), digest: z.string() }));
const manifestSchema = z.strictObject({
  version: z.literal(1),
  installation: z.uuid(),
  snapshot_at: z.string().datetime(),
  schemas: z.array(sqlName).length(2),
  domains: z.array(z.uuid()),
  files: z.record(
    z
      .string()
      .regex(/^(?:database\.dump|state\.tar|trust\.tar|environment|domain-[a-f0-9-]{36}\.tar)$/),
    z.string().regex(/^[a-f0-9]{64}$/),
  ),
  database: fingerprint,
  release: z.string(),
});

function schemas(env: Record<string, string>) {
  return [
    sqlName.parse(env.NGERTIIN_DATABASE_SCHEMA ?? "ngertiin_app"),
    sqlName.parse(env.NGERTIIN_AUTH_SCHEMA ?? "ngertiin_auth"),
  ];
}

export async function backup(configPath: string, destination: string, keepStopped = false) {
  const { config, env } = loadOperations(configPath);
  destination = resolve(destination);
  privateDirectory(dirname(destination));
  if (existsSync(destination) || existsSync(`${destination}.partial`))
    throw new Error("Backup destination already exists.");
  privateDirectory(config.trust_dir);
  const active = (await import("./maintenance")).serviceActive;
  const resume = await active(config);
  return maintenance(config, env, async (database) => {
    const started = Date.now();
    const stage = mkdtempSync(join(dirname(config.state_dir), ".backup-"));
    try {
      const domains = await retainedDomains(config, env.NGERTIIN_MACHINE_ASSETS_DIR);
      for (const id of domains.running)
        await run(["docker", "stop", "--time", "60", `ngertiin-domain-${id}`]);
      const snapshotAt = new Date().toISOString();
      await run([
        "tar",
        "-cpf",
        join(stage, "state.tar"),
        "--exclude=./runtime.json",
        "-C",
        config.state_dir,
        ".",
      ]);
      await run(["tar", "-cpf", join(stage, "trust.tar"), "-C", config.trust_dir, "."]);
      copyFileSync(config.environment_file, join(stage, "environment"));
      chmodSync(join(stage, "environment"), 0o600);
      const names = schemas(env);
      await run(
        [
          "docker",
          "exec",
          config.database_container,
          "pg_dump",
          "-U",
          config.database_user,
          "-d",
          config.database_name,
          "-Fc",
          ...names.flatMap((name) => ["--schema", name]),
        ],
        { output: join(stage, "database.dump") },
      );
      const versions = JSON.parse(
        readFileSync(new URL("../../../../infra/server/versions.json", import.meta.url), "utf8"),
      );
      for (const id of domains.ids) {
        await run(
          [
            "docker",
            "run",
            "--rm",
            "--network",
            "none",
            "--read-only",
            "--cap-drop",
            "ALL",
            "--cap-add",
            "DAC_READ_SEARCH",
            "--mount",
            `type=volume,src=ngertiin-domain-${id}-home,dst=/volume,readonly`,
            "--entrypoint",
            "tar",
            versions.postgres,
            "-cpf",
            "-",
            "-C",
            "/volume",
            ".",
          ],
          { output: join(stage, `domain-${id}.tar`) },
        );
      }
      const files = Object.fromEntries(
        readdirSync(stage)
          .sort()
          .map((file) => [file, sha256(join(stage, file))]),
      );
      const manifest = manifestSchema.parse({
        version: 1,
        installation: domains.installation,
        snapshot_at: snapshotAt,
        schemas: names,
        domains: domains.ids,
        files,
        database: await databaseFingerprint(database, names),
        release: env.NGERTIIN_PROJECT_ROOT ?? "unknown",
      });
      writeFileSync(join(stage, "manifest.json"), JSON.stringify(manifest), { mode: 0o600 });
      const bundle = join(stage, "bundle.tar");
      await run(["tar", "-cpf", bundle, "-C", stage, ...readdirSync(stage).sort()]);
      await encryptBackup(bundle, `${destination}.partial`, config.backup_key_file);
      linkSync(`${destination}.partial`, destination);
      unlinkSync(`${destination}.partial`);
      syncDirectory(dirname(destination));
      const report = {
        version: 1,
        snapshot_at: snapshotAt,
        backup_sha256: sha256(destination),
        domains: domains.ids.length,
        tables: Object.keys(manifest.database).length,
        stopped_ms: Date.now() - started,
      };
      writeOperatorFile(`${destination}.json`, JSON.stringify(report), true);
      // Release the offline authority before systemd is allowed to start another lifecycle.
      await database.end();
      if (!keepStopped) {
        for (const id of domains.running) await run(["docker", "start", `ngertiin-domain-${id}`]);
        if (resume) await run(["systemctl", "start", config.service]);
      }
      return report;
    } finally {
      rmSync(stage, { recursive: true, force: true });
    }
  });
}

async function unpack(backupPath: string, key: string, stage: string) {
  const bundle = join(stage, "bundle.tar");
  await decryptBackup(backupPath, bundle, key);
  const members = (await run(["tar", "-tf", bundle])).split("\n");
  if (
    members.length > 105 ||
    new Set(members).size !== members.length ||
    members.some(
      (name) =>
        !/^(?:manifest\.json|database\.dump|state\.tar|trust\.tar|environment|domain-[a-f0-9-]{36}\.tar)$/.test(
          name,
        ),
    )
  )
    throw new Error("Invalid backup archive inventory.");
  if ((await run(["tar", "-tvf", bundle])).split("\n").some((line) => !line.startsWith("-")))
    throw new Error("Backup members must be regular files.");
  const contents = join(stage, "contents");
  mkdirSync(contents, { mode: 0o700 });
  await run(["tar", "-xpf", bundle, "--no-same-owner", "-C", contents]);
  for (const file of readdirSync(contents))
    if (!lstatSync(join(contents, file)).isFile()) throw new Error("Invalid backup member type.");
  const manifest = manifestSchema.parse(
    JSON.parse(readFileSync(join(contents, "manifest.json"), "utf8")),
  );
  const expected = [
    "database.dump",
    "environment",
    "state.tar",
    "trust.tar",
    ...manifest.domains.map((id) => `domain-${id}.tar`),
  ].sort();
  if (
    JSON.stringify(Object.keys(manifest.files).sort()) !== JSON.stringify(expected) ||
    members.length !== expected.length + 1
  )
    throw new Error("Incomplete backup inventory.");
  for (const [file, hash] of Object.entries(manifest.files))
    if (sha256(join(contents, file)) !== hash) throw new Error("Backup digest mismatch.");
  return { contents, manifest };
}

export async function verifyBackup(configPath: string, source: string) {
  const { config } = loadOperations(configPath);
  privateDirectory(dirname(config.state_dir));
  const stage = mkdtempSync(join(dirname(config.state_dir), ".verify-"));
  try {
    const { manifest } = await unpack(source, config.backup_key_file, stage);
    return {
      version: 1,
      snapshot_at: manifest.snapshot_at,
      backup_sha256: sha256(source),
      domains: manifest.domains.length,
      tables: Object.keys(manifest.database).length,
    };
  } finally {
    rmSync(stage, { recursive: true, force: true });
  }
}

/** Restore only into an empty database/state and absent domain resources. Never overwrite an installation. */
export async function restore(configPath: string, source: string, latestRevocations: string) {
  const { config, env } = loadOperations(configPath);
  privateDirectory(dirname(config.state_dir));
  privateDirectory(latestRevocations);
  const stage = mkdtempSync(join(dirname(config.state_dir), ".restore-"));
  const started = Date.now();
  try {
    const { contents, manifest } = await unpack(source, config.backup_key_file, stage);
    if (JSON.stringify(manifest.schemas) !== JSON.stringify(schemas(env)))
      throw new Error("Restore schema selection differs from the snapshot.");
    if (existsSync(config.state_dir) && readdirSync(config.state_dir).length)
      throw new Error("Restore requires an empty state destination.");
    if (existsSync(config.state_dir)) privateDirectory(config.state_dir);
    if (existsSync(config.trust_dir)) privateDirectory(config.trust_dir);
    const restoredState = join(stage, "state");
    const restoredTrust = join(stage, "trust");
    for (const [target, file] of [
      [restoredState, "state.tar"],
      [restoredTrust, "trust.tar"],
    ]) {
      mkdirSync(target as string, { mode: 0o700 });
      await run([
        "tar",
        "-xpf",
        join(contents, file as string),
        "--no-same-owner",
        "-C",
        target as string,
      ]);
    }
    const installation = JSON.parse(
      privateFile(join(restoredState, "installation.json")).toString(),
    );
    if (installation.owner_id !== manifest.installation)
      throw new Error("Restore installation mismatch.");
    const savedEnvironment = (await import("node:util")).parseEnv(
      privateFile(join(contents, "environment")).toString(),
    );
    if (savedEnvironment.NGERTIIN_AUTH_URL !== env.NGERTIIN_AUTH_URL)
      throw new Error("Server identity changes require an explicit authentication migration.");
    // The independently retained newest ledger is mandatory; a snapshot alone may resurrect revocations.
    const ledger = join(restoredTrust, "revocations");
    mkdirSync(ledger, { recursive: true, mode: 0o700 });
    for (const directory of [latestRevocations, join(config.trust_dir, "revocations")]) {
      if (!existsSync(directory)) continue;
      privateDirectory(directory);
      for (const id of readdirSync(directory)) {
        z.uuid().parse(id);
        privateFile(join(directory, id));
        writeFileSync(join(ledger, id), "revoked\n", { mode: 0o600 });
      }
    }
    const restoredKey = privateFile(join(restoredTrust, "provider.key"), 32);
    if (
      existsSync(join(config.trust_dir, "provider.key")) &&
      !restoredKey.equals(privateFile(join(config.trust_dir, "provider.key"), 32))
    )
      throw new Error("Provider master-key identity differs from the snapshot.");
    for (const id of manifest.domains) {
      for (const resource of [
        ["container", `ngertiin-domain-${id}`],
        ["volume", `ngertiin-domain-${id}-home`],
        ["network", `ngertiin-domain-${id}-network`],
      ]) {
        if (
          await run([
            "docker",
            resource[0] as string,
            "ls",
            "--format",
            resource[0] === "container" ? "{{.Names}}" : "{{.Name}}",
            "--filter",
            `name=^${resource[1]}$`,
          ])
        )
          throw new Error(
            "Restore domain resources already exist; use a fresh host or reconcile named retired resources.",
          );
      }
      const path = join(restoredState, "execution-domains", `${id}.json`);
      const value = JSON.parse(privateFile(path).toString());
      if (value.id !== id || value.phase !== "retained")
        throw new Error("Invalid retained domain identity.");
      writeFileSync(path, JSON.stringify({ ...value, phase: "new", container_id: null }), {
        mode: 0o600,
      });
    }
    const intent = `${config.state_dir}.restore-intent.json`;
    if (existsSync(intent))
      throw new Error("Reconcile the previous restore intent before retrying.");
    return await maintenance(config, env, async (database) => {
      if (existsSync(config.state_dir) && readdirSync(config.state_dir).length)
        throw new Error("Restore state changed before the offline authority was acquired.");
      if (Object.keys(await databaseFingerprint(database, manifest.schemas)).length)
        throw new Error("Restore requires empty application/authentication schemas.");
      writeOperatorFile(
        intent,
        JSON.stringify({
          backup_sha256: sha256(source),
          domains: manifest.domains,
          database: config.database_name,
          phase: "restoring",
        }),
        true,
      );
      const versions = JSON.parse(
        readFileSync(new URL("../../../../infra/server/versions.json", import.meta.url), "utf8"),
      );
      for (const id of manifest.domains) {
        await run([
          "docker",
          "volume",
          "create",
          "--label",
          `io.ngertiin.domain=${id}`,
          `ngertiin-domain-${id}-home`,
        ]);
        await run(
          [
            "docker",
            "run",
            "--rm",
            "--network",
            "none",
            "--cap-drop",
            "ALL",
            "--cap-add",
            "CHOWN",
            "--cap-add",
            "FOWNER",
            "--cap-add",
            "DAC_OVERRIDE",
            "--mount",
            `type=volume,src=ngertiin-domain-${id}-home,dst=/volume`,
            "-i",
            "--entrypoint",
            "tar",
            versions.postgres,
            "-xpf",
            "-",
            "-C",
            "/volume",
          ],
          { input: join(contents, `domain-${id}.tar`) },
        );
      }
      // Existing unrelated databases are never dropped. PostgreSQL restore is one transaction.
      await run(
        [
          "docker",
          "exec",
          "-i",
          config.database_container,
          "pg_restore",
          "-U",
          config.database_user,
          "-d",
          config.database_name,
          "--single-transaction",
          "--exit-on-error",
          "--no-owner",
        ],
        { input: join(contents, "database.dump") },
      );
      if (
        JSON.stringify(await databaseFingerprint(database, manifest.schemas)) !==
        JSON.stringify(manifest.database)
      )
        throw new Error("Restored database fingerprint differs from the snapshot.");
      if (existsSync(config.state_dir)) rmSync(config.state_dir, { recursive: true });
      renameSync(restoredState, config.state_dir);
      // Preserve the current trust directory as an additional private recovery copy.
      if (existsSync(config.trust_dir))
        renameSync(config.trust_dir, `${config.trust_dir}.before-${randomUUID()}`);
      renameSync(restoredTrust, config.trust_dir);
      const restoredEnvironment = {
        ...savedEnvironment,
        ...Object.fromEntries(
          Object.entries(env).filter(([name]) =>
            [
              "NGERTIIN_DATABASE_URL",
              "NGERTIIN_APPLICATION_DATABASE_URL",
              "NGERTIIN_STATE_DIR",
              "NGERTIIN_PROJECT_ROOT",
              "NGERTIIN_CONFIG_FILE",
              "NGERTIIN_CODEX_EXECUTABLE",
              "NGERTIIN_MUSE_EXECUTABLE",
              "NGERTIIN_MACHINE_ASSETS_DIR",
              "NGERTIIN_PROVIDER_MASTER_KEY_FILE",
              "NGERTIIN_PROVIDER_REVOCATIONS_DIR",
            ].includes(name),
          ),
        ),
      };
      copyFileSync(config.environment_file, `${config.environment_file}.before-${randomUUID()}`);
      writeOperatorFile(
        config.environment_file,
        `${Object.entries(restoredEnvironment)
          .map(([name, value]) => `${name}=${JSON.stringify(value)}`)
          .join("\n")}\n`,
      );
      await run([
        "chown",
        "-hR",
        config.service_user,
        config.state_dir,
        config.trust_dir,
        config.environment_file,
      ]);
      // Commit restored files/volumes/configuration before clearing the durable startup fence.
      await run(["sync"], { stage: "restore durability barrier" });
      rmSync(intent);
      syncDirectory(dirname(intent));
      return {
        version: 1,
        snapshot_at: manifest.snapshot_at,
        domains: manifest.domains.length,
        tables: Object.keys(manifest.database).length,
        restore_ms: Date.now() - started,
        service_started: false,
      };
    });
  } finally {
    rmSync(stage, { recursive: true, force: true });
  }
}
