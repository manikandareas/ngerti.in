import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { z } from "zod";
import { id } from "./contracts";

const installationSchema = z.strictObject({
  owner_id: id,
  token: z.string().regex(/^[a-f0-9]{64}$/),
});
export function developmentConfig() {
  if ((process.env.APP_ENV ?? "development") !== "development")
    throw new Error("This bootstrap supports development only.");
  const root = fileURLToPath(new URL("../../../", import.meta.url));
  const stateDir = resolve(root, process.env.NGERTIIN_STATE_DIR || ".dev/harness-first");
  mkdirSync(stateDir, { recursive: true, mode: 0o700 });
  const installationFile = resolve(stateDir, "installation.json");
  try {
    writeFileSync(
      installationFile,
      JSON.stringify({
        owner_id: crypto.randomUUID(),
        token: crypto.randomUUID().replaceAll("-", "") + crypto.randomUUID().replaceAll("-", ""),
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
    database: resolve(stateDir, "ngertiin.sqlite"),
    port,
  };
}
