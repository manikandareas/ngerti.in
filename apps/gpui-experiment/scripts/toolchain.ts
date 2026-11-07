import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { resolve } from "node:path";

export const directory = resolve(import.meta.dir, "..");
export const repository = resolve(directory, "../..");
export const cargo = process.env.CARGO ?? resolve(homedir(), ".cargo/bin/cargo");
export const target = resolve(repository, ".dev/gpui-experiment-target");
export async function run(command: string[], cwd = directory) {
  const process = Bun.spawn(command, {
    cwd,
    stdout: "inherit",
    stderr: "inherit",
    env: {
      ...Bun.env,
      PATH: `${resolve(homedir(), ".cargo/bin")}:${resolve(homedir(), ".local/bin")}:${Bun.env.PATH}`,
    },
  });
  const code = await process.exited;
  if (code !== 0) throw new Error(`Command failed (${code}): ${command[0]}`);
}
export async function prepare() {
  await run(["bun", "scripts/prepare-assets.ts"]);
  const uv = existsSync(resolve(homedir(), ".local/bin/uv"))
    ? resolve(homedir(), ".local/bin/uv")
    : "uv";
  await run([
    uv,
    "run",
    "--with",
    "fonttools==4.68.0",
    "--with",
    "brotli==1.2.1",
    "python",
    "scripts/convert-fonts.py",
  ]);
  await run([
    "bun",
    "../web-client/node_modules/vite/bin/vite.js",
    "build",
    "--config",
    "reference/vite.config.ts",
  ]);
}
