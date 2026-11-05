import { accessSync, constants } from "node:fs";
import { homedir } from "node:os";
import { delimiter, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { findExecutable } from "../src/profile";

export const root = fileURLToPath(new URL("../../../", import.meta.url));
export const desktop = join(root, "apps/desktop");
export const native = join(desktop, "src-tauri");
const candidate = findExecutable("cargo") ?? join(homedir(), ".cargo/bin/cargo");
try {
  accessSync(candidate, constants.X_OK);
} catch {
  throw new Error(
    "Rust is required. Install the stable toolchain from https://rustup.rs, then retry.",
  );
}
export const cargo = candidate;
export const toolchainEnv = {
  ...process.env,
  PATH: `${dirname(cargo)}${delimiter}${process.env.PATH ?? ""}`,
  CARGO_BUILD_JOBS: "2",
};

export async function run(args: string[], cwd = root, env = toolchainEnv) {
  const child = Bun.spawn(args, { cwd, env, stdout: "inherit", stderr: "inherit" });
  const code = await child.exited;
  if (code !== 0) throw new Error(`Desktop command failed (${code}): ${args[0]}`);
}
