import { homedir } from "node:os";
import { resolve } from "node:path";

export const directory = resolve(import.meta.dir, "..");
export const repository = resolve(directory, "../..");
export const target =
  process.env.NGERTIIN_RS_TARGET_DIR ?? resolve(repository, ".dev/desktop-rs-target");
export const cargo = process.env.CARGO ?? resolve(homedir(), ".cargo/bin/cargo");
export async function run(args: string[]) {
  const [command, ...rest] = args;
  const child = Bun.spawn([cargo, command, "--target-dir", target, ...rest], {
    cwd: directory,
    stdout: "inherit",
    stderr: "inherit",
    env: process.env,
  });
  const code = await child.exited;
  if (code) throw new Error(`Cargo failed with exit status ${code}`);
}
if (import.meta.main) {
  const [command = "run", ...args] = process.argv.slice(2);
  if (command === "fmt") {
    const child = Bun.spawn([cargo, "fmt", "--all", ...args], {
      cwd: directory,
      stdout: "inherit",
      stderr: "inherit",
    });
    process.exitCode = await child.exited;
  } else {
    await run([command, "--locked", ...args]);
  }
}
