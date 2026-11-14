import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { readFileSync, readdirSync } from "node:fs";
import { join, resolve } from "node:path";
import { CONTRACT_VERSION } from "../../../apps/server/src/contracts";

export function captureSource() {
  const root = resolve(import.meta.dir, "../../..");
  const paths = ["package.json", "apps/server/package.json", "bun.lock",
    ...readdirSync(join(root, "apps/server/src"), { recursive: true }).filter(path => typeof path === "string" && path.endsWith(".ts")).map(path => `apps/server/src/${path}`),
    ...readdirSync(join(root, "apps/server/tests"), { recursive: true }).filter(path => typeof path === "string" && path.endsWith(".ts")).map(path => `apps/server/tests/${path}`),
    ...readdirSync(import.meta.dir).filter(path => path.endsWith(".ts")).map(path => `scripts/verification/nma079/${path}`),
  ];
  return { captured_at: new Date().toISOString(), git_base: execFileSync("git", ["rev-parse", "HEAD"], { cwd: root, encoding: "utf8" }).trim(),
    contract: CONTRACT_VERSION, bun: Bun.version, platform: process.platform, architecture: process.arch,
    dependencies: JSON.parse(readFileSync(join(root, "apps/server/package.json"), "utf8")).dependencies,
    sha256: Object.fromEntries(paths.sort().map(path => [path, createHash("sha256").update(readFileSync(join(root, path))).digest("hex")])),
  };
}
