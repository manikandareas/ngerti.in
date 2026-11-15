import { createHash, randomUUID } from "node:crypto";
import {
  closeSync,
  constants,
  fsyncSync,
  linkSync,
  lstatSync,
  openSync,
  readFileSync,
  readSync,
  realpathSync,
  renameSync,
  rmSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { dirname, isAbsolute, resolve } from "node:path";
import { parseEnv } from "node:util";
import { z } from "zod";

const absolute = z.string().refine(isAbsolute);
export const operationsConfig = z.strictObject({
  version: z.literal(1),
  environment_file: absolute,
  state_dir: absolute,
  trust_dir: absolute,
  backup_key_file: absolute,
  database_container: z.string().regex(/^[a-zA-Z0-9][a-zA-Z0-9_.-]{0,100}$/),
  database_name: z.string().regex(/^[a-z][a-z0-9_]{0,62}$/),
  database_user: z.string().regex(/^[a-z][a-z0-9_]{0,62}$/),
  service: z.string().regex(/^ngertiin(?:-[a-z0-9-]+)?\.service$/),
  service_user: z.string().regex(/^[a-z_][a-z0-9_-]{0,31}$/),
});
export type OperationsConfig = z.infer<typeof operationsConfig>;

export function privateFile(path: string, size?: number) {
  const info = lstatSync(path);
  if (!info.isFile() || info.isSymbolicLink() || info.mode & 0o077 || (size && info.size !== size))
    throw new Error("Operator files must be private regular files with the expected size.");
  return readFileSync(path);
}
export function privateDirectory(path: string) {
  const info = lstatSync(path);
  if (
    !info.isDirectory() ||
    info.isSymbolicLink() ||
    info.mode & 0o077 ||
    realpathSync(path) !== path
  )
    throw new Error("Operator storage must be a private real directory without symlink parents.");
}
export function loadOperations(path: string) {
  const config = operationsConfig.parse(JSON.parse(privateFile(path).toString()));
  const env = z
    .record(z.string(), z.string())
    .parse(parseEnv(privateFile(config.environment_file).toString()));
  if (resolve(env.NGERTIIN_STATE_DIR ?? ".") !== config.state_dir)
    throw new Error("Operator and application state directories must agree.");
  if (
    config.state_dir === config.trust_dir ||
    config.trust_dir.startsWith(`${config.state_dir}/`) ||
    config.state_dir.startsWith(`${config.trust_dir}/`) ||
    config.backup_key_file.startsWith(`${config.trust_dir}/`) ||
    config.backup_key_file.startsWith(`${config.state_dir}/`) ||
    config.environment_file.startsWith(`${config.state_dir}/`) ||
    config.environment_file.startsWith(`${config.trust_dir}/`)
  )
    throw new Error("State, trust, environment and offline backup key must have separate roots.");
  if (
    env.NGERTIIN_PROVIDER_MASTER_KEY_FILE !== `${config.trust_dir}/provider.key` ||
    env.NGERTIIN_PROVIDER_REVOCATIONS_DIR !== `${config.trust_dir}/revocations`
  )
    throw new Error("Provider trust paths must match the operator configuration.");
  const database = new URL(env.NGERTIIN_DATABASE_URL ?? "invalid:");
  if (
    !["postgres:", "postgresql:"].includes(database.protocol) ||
    database.pathname !== `/${config.database_name}` ||
    decodeURIComponent(database.username) !== config.database_user
  )
    throw new Error("The backup database must match the configured application database.");
  return { config, env };
}
export async function run(
  args: string[],
  options: { output?: string; input?: string; stage?: string } = {},
) {
  const child = Bun.spawn(args, {
    stdin: options.input ? Bun.file(options.input) : "ignore",
    stdout: options.output ? Bun.file(options.output) : "pipe",
    stderr: "ignore",
    // Never log child diagnostics: Docker, pg_dump and native tools can include credentials.
  });
  const output =
    options.output || typeof child.stdout === "number"
      ? ""
      : await new Response(child.stdout).text();
  const code = await child.exited;
  if (code !== 0)
    throw new Error(
      `Operator command failed: ${options.stage ?? `${args[0]} ${args[1] ?? ""}`} (exit ${code}).`,
    );
  return output.trim();
}
export function syncDirectory(path: string) {
  const fd = openSync(path, constants.O_RDONLY | constants.O_DIRECTORY | constants.O_NOFOLLOW);
  try {
    fsyncSync(fd);
  } finally {
    closeSync(fd);
  }
}

/** Durable private metadata; exclusive publication preserves another operator's existing file. */
export function writeOperatorFile(path: string, contents: string, exclusive = false) {
  const temporary = `${path}.${randomUUID()}.pending`;
  const fd = openSync(
    temporary,
    constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW,
    0o600,
  );
  try {
    try {
      writeFileSync(fd, contents);
      fsyncSync(fd);
    } finally {
      closeSync(fd);
    }
    if (exclusive) {
      linkSync(temporary, path);
      unlinkSync(temporary);
    } else renameSync(temporary, path);
    syncDirectory(dirname(path));
  } finally {
    rmSync(temporary, { force: true });
  }
}

export function sha256(path: string) {
  const hash = createHash("sha256");
  const buffer = Buffer.alloc(65536);
  const fd = openSync(path, "r");
  try {
    while (true) {
      const size = readSync(fd, buffer);
      if (!size) break;
      hash.update(buffer.subarray(0, size));
    }
    return hash.digest("hex");
  } finally {
    closeSync(fd);
  }
}
