import { join } from "node:path";
import { prepareRuntime } from "./prepare-runtime";
import { desktop, root, run } from "./toolchain";

export async function buildDesktop(bundle: boolean) {
  await run([process.execPath, "run", "build:web-client"], root);
  await prepareRuntime();
  await run(
    [
      process.execPath,
      join(desktop, "node_modules/@tauri-apps/cli/tauri.js"),
      "build",
      ...(bundle ? ["--bundles", "app"] : ["--no-bundle"]),
    ],
    desktop,
  );
}
if (import.meta.main) await buildDesktop(false);
