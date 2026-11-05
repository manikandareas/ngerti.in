import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { native } from "./toolchain";

/** Exercise the shipped dependency layout and Bun executable, without user data or credentials. */
export async function verifyPackage() {
  const bundle = join(native, "target/release/bundle/macos/Ngertiin Tauri.app/Contents");
  const runtime = join(bundle, "Resources/runtime");
  const directory = await mkdtemp(join(tmpdir(), "ngertiin-tauri-package-"));
  const child = Bun.spawn([join(bundle, "MacOS/bun"), join(runtime, "apps/server/src/main.ts")], {
    cwd: runtime,
    env: {
      PATH: "/usr/bin:/bin:/usr/sbin:/sbin",
      HOME: directory,
      APP_ENV: "development",
      NGERTIIN_PROJECT_ROOT: runtime,
      NGERTIIN_STATE_DIR: directory,
      NGERTIIN_CONFIG_FILE: join(directory, "absent.env"),
      NGERTIIN_PORT: "0",
    },
    stdin: "ignore",
    stdout: "ignore",
    stderr: "pipe",
  });
  let stderr = "";
  const drained = (async () => {
    for await (const bytes of child.stderr) {
      if (stderr.length < 8000)
        stderr += new TextDecoder().decode(bytes).slice(0, 8000 - stderr.length);
    }
  })();
  try {
    let ready = false;
    const deadline = Date.now() + 15_000;
    while (Date.now() < deadline && child.exitCode === null) {
      try {
        const record = JSON.parse(await readFile(join(directory, "runtime.json"), "utf8"));
        const installation = JSON.parse(
          await readFile(join(directory, "installation.json"), "utf8"),
        );
        const response = await fetch(`${record.url}/health/ready`, {
          headers: { Authorization: `Bearer ${installation.token}` },
          signal: AbortSignal.timeout(1000),
        });
        if (response.ok && (await response.json()).api_readiness_gate === "ready") {
          ready = true;
          break;
        }
      } catch {
        // Startup has not yet published its private record.
      }
      await Bun.sleep(100);
    }
    if (!ready) throw new Error(`The packaged backend did not start. ${stderr}`);
    console.log("Packaged Bun/backend smoke test passed with isolated state and no credentials.");
  } finally {
    if (child.exitCode === null) child.kill("SIGTERM");
    let timer: ReturnType<typeof setTimeout> | undefined;
    await Promise.race([
      child.exited,
      new Promise<void>((resolve) => {
        timer = setTimeout(() => {
          if (child.exitCode === null) child.kill("SIGKILL");
          resolve();
        }, 5000);
      }),
    ]);
    clearTimeout(timer);
    await child.exited;
    await drained;
    await rm(directory, { recursive: true, force: true });
  }
}

if (import.meta.main) await verifyPackage();
