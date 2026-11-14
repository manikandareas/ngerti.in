import { mkdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";

const root = resolve(import.meta.dir, "../../..");
const directory = join(root, "docs/verification/nma-079");
mkdirSync(directory, { recursive: true });
async function run(name: string, args: string[]) {
  mkdirSync(dirname(join(directory, name)), { recursive: true });
  const log = Bun.file(join(directory, name)).writer();
  const child = Bun.spawn([process.execPath, ...args], { cwd: root,
    env: { ...process.env, NGERTIIN_NMA079_REPORT_DIR: directory }, stdout: "pipe", stderr: "pipe" });
  const copy = async (stream: ReadableStream<Uint8Array>) => {
    for await (const chunk of stream) { log.write(chunk); await Bun.stdout.write(chunk); }
  };
  try {
    await Promise.all([copy(child.stdout), copy(child.stderr)]);
    if (await child.exited) throw new Error(`Verification failed; see ${name}.`);
  } finally { await log.end(); }
}
const runner = "scripts/verification/nma072/run-tests.ts";
await run("regression.log", [runner, "--preload", "../../scripts/verification/nma079/observe.ts"]);
if (process.argv.includes("--native")) {
  await run("cua/run.log", [runner, "../../scripts/verification/nma079/cua.test.ts"]);
  process.env.NGERTIIN_NMA079_NATIVE = "1";
  await run("native/run.log", [runner, "../../scripts/verification/nma079/native.test.ts"]);
}
await run("gate.log", ["scripts/verification/nma079/report.ts"]);
