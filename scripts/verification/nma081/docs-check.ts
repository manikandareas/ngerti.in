import { resolve } from "node:path";

// Retired GPUI guides no longer require a scoped documentation exclusion.
const child = Bun.spawn([process.execPath, resolve(import.meta.dir, "../../check-docs.ts")], {
  cwd: resolve(import.meta.dir, "../../.."),
  stdout: "inherit",
  stderr: "inherit",
});
process.exitCode = await child.exited;
