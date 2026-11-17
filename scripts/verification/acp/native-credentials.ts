import { lstatSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { homedir } from "node:os";
import { join, resolve } from "node:path";
import { parseEnv } from "node:util";
import { developmentConfig } from "../../../apps/server/src/config";
import { piProviderConfiguration } from "../../../apps/server/src/harness/native-configuration";

const root = resolve(import.meta.dir, "../../..");
const { z } = createRequire(join(root, "apps/server/package.json"))("zod");
/** Read only the project's retained authority. Never copy refresh tokens or consult global CLI state. */
export async function retainedCodex() {
  const config = developmentConfig();
  const { Client } = createRequire(join(root, "apps/server/package.json"))("pg");
  const source = new Client({ connectionString: config.databaseUrl });
  await source.connect();
  try {
    const table = `"${config.databaseSchema.replaceAll('"', '""')}".entities`;
    let rows = (
      await source.query(
        `SELECT id, body FROM ${table} WHERE kind='connection' AND body->>'harness'='codex' AND body->>'state'='active' AND body->>'login'='authenticated' AND body->'authentication'->>'method'='native_login'`,
      )
    ).rows;
    if (rows.length > 1) {
      const selections = (
        await source.query(
          `SELECT body->'selection'->>'connection_id' AS id FROM ${table} WHERE kind='ai_selection' AND body->>'scope'='user' AND body->>'harness'='codex'`,
        )
      ).rows;
      const selected = new Set(selections.map((selection: { id: string }) => selection.id));
      rows = rows.filter((row: { id: string }) => selected.has(row.id));
    }
    if (rows.length !== 1)
      throw new Error(
        `A unique selected retained Codex authority is required; ${rows.length} eligible connections found.`,
      );
    const file = join(config.stateDir, "connections", rows[0].id, "codex/auth.json");
    const stat = lstatSync(file);
    if (!stat.isFile() || stat.isSymbolicLink() || (stat.mode & 0o077) !== 0)
      throw new Error("The retained authority is not a private regular file.");
    const data = z
      .object({
        tokens: z.object({ access_token: z.string().min(1), account_id: z.string().min(1) }),
      })
      .parse(JSON.parse(readFileSync(file, "utf8")));
    const expiry =
      z
        .object({ exp: z.number() })
        .parse(
          JSON.parse(Buffer.from(data.tokens.access_token.split(".")[1], "base64url").toString()),
        ).exp * 1000;
    if (expiry < Date.now() + 240_000)
      throw new Error("The retained short-lived token needs renewal by its existing authority.");
    return {
      accessToken: data.tokens.access_token,
      chatgptAccountId: data.tokens.account_id,
      ...(rows[0].body.account_plan
        ? { chatgptPlanType: rows[0].body.account_plan as string }
        : {}),
    };
  } finally {
    await source.end();
  }
}

export function selectedProbeKey(provider: "openai" | "anthropic") {
  let env: Record<string, string | undefined> = {};
  try {
    env = parseEnv(readFileSync(join(root, ".env"), "utf8"));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }
  // Verification explicitly selects these project credentials. Ambient process/global keys are excluded.
  return env[provider === "openai" ? "OPENAI_API_KEY" : "ANTHROPIC_API_KEY"];
}

/** Owner-selected native Pi configuration only; never inherit its defaults, auth catalog or code. */
export function selectedPiSumopod() {
  const directory = process.env.PI_CODING_AGENT_DIR ?? join(homedir(), ".pi/agent");
  const file = join(directory, "models.json");
  const info = lstatSync(file);
  if (!info.isFile() || info.isSymbolicLink() || info.size > 262144)
    throw new Error("The selected Pi provider configuration is unavailable.");
  try {
    const selected = JSON.parse(readFileSync(file, "utf8")).providers.sumopod;
    return piProviderConfiguration.parse({
      ...selected,
      models: selected.models.filter((model: { id: string }) => /deepseek/i.test(model.id)),
    });
  } catch {
    throw new Error("The selected native Sumopod configuration is unsupported.");
  }
}
