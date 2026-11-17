import { randomBytes } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parseEnv } from "node:util";
import { z } from "zod";
import { authenticationConfig } from "./auth/config";
import { id } from "./contracts";
import type { HarnessId } from "./harness/availability";

const installationSchema = z.object({
  owner_id: id,
});
export function developmentConfig() {
  const environment = process.env.APP_ENV ?? "development";
  if (!["development", "production"].includes(environment))
    throw new Error("Unsupported application environment.");
  const root = resolve(
    process.env.NGERTIIN_PROJECT_ROOT ?? fileURLToPath(new URL("../../../", import.meta.url)),
  );
  let rootEnvironment: Record<string, string | undefined> = {};
  try {
    rootEnvironment = parseEnv(
      readFileSync(process.env.NGERTIIN_CONFIG_FILE ?? resolve(root, ".env"), "utf8"),
    );
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }
  const executableOverride = (name: string) =>
    (process.env[name] ?? rootEnvironment[name])?.trim() || undefined;
  const typesafeApiKey = process.env.TYPESAFE_API_KEY ?? rootEnvironment.TYPESAFE_API_KEY;
  const groupRouter = z
    .enum(["jev", "member"])
    .parse(process.env.NGERTIIN_GROUP_ROUTER ?? (typesafeApiKey ? "jev" : "member"));
  if (groupRouter === "jev" && !typesafeApiKey)
    throw new Error("TYPESAFE_API_KEY is required for Jev group routing.");
  const stateDir = resolve(
    root,
    process.env.NGERTIIN_STATE_DIR || rootEnvironment.NGERTIIN_STATE_DIR || ".dev/harness-first",
  );
  mkdirSync(stateDir, { recursive: true, mode: 0o700 });
  const authentication = authenticationConfig({ ...rootEnvironment, ...process.env }, stateDir);
  let providerMasterKeyFile =
    process.env.NGERTIIN_PROVIDER_MASTER_KEY_FILE ??
    rootEnvironment.NGERTIIN_PROVIDER_MASTER_KEY_FILE;
  if (!providerMasterKeyFile && environment === "development") {
    providerMasterKeyFile = resolve(stateDir, "provider-master-key");
    try {
      writeFileSync(providerMasterKeyFile, randomBytes(32), { mode: 0o600, flag: "wx" });
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
    }
  }
  if (environment === "production") {
    if (authentication.allowInsecureLoopback)
      throw new Error("Server deployment requires certificate-validated account authentication.");
    if (!process.env.NGERTIIN_STATE_DIR?.startsWith("/"))
      throw new Error("Server deployment requires an absolute private state directory.");
    if (!process.env.NGERTIIN_DATABASE_URL)
      throw new Error("Server deployment requires an explicit PostgreSQL connection.");
  }
  const installationFile = resolve(stateDir, "installation.json");
  try {
    writeFileSync(
      installationFile,
      JSON.stringify({
        owner_id: crypto.randomUUID(),
      }),
      { mode: 0o600, flag: "wx" },
    );
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
  }
  const installation = installationSchema.parse(JSON.parse(readFileSync(installationFile, "utf8")));
  const port = z.coerce
    .number()
    .int()
    .min(0)
    .max(65535)
    .parse(process.env.NGERTIIN_PORT ?? "8000");
  return {
    ...installation,
    stateDir,
    installationFile,
    database: resolve(stateDir, "ngertiin.postgres"),
    databaseUrl: process.env.NGERTIIN_DATABASE_URL ?? rootEnvironment.NGERTIIN_DATABASE_URL,
    databaseSchema:
      process.env.NGERTIIN_DATABASE_SCHEMA ??
      rootEnvironment.NGERTIIN_DATABASE_SCHEMA ??
      "ngertiin_app",
    port,
    groupRouter,
    typesafeApiKey,
    ...(providerMasterKeyFile ? { providerMasterKeyFile } : {}),
    authentication,
    nativeCodexExecutable: executableOverride("NGERTIIN_CODEX_EXECUTABLE"),
    harnessExecutables: {
      codex: executableOverride("NGERTIIN_CODEX_ACP_EXECUTABLE"),
      muse: executableOverride("NGERTIIN_MUSE_EXECUTABLE"),
      claude: executableOverride("NGERTIIN_CLAUDE_ACP_EXECUTABLE"),
      opencode: executableOverride("NGERTIIN_OPENCODE_EXECUTABLE"),
      pi: executableOverride("NGERTIIN_PI_ACP_EXECUTABLE"),
    } as Partial<Record<HarnessId, string>>,
  };
}
