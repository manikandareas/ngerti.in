import { join } from "node:path";
import { desktop, run } from "./toolchain";

await run(
  [
    process.execPath,
    join(desktop, "node_modules/@tauri-apps/cli/tauri.js"),
    ...process.argv.slice(2),
  ],
  desktop,
);
