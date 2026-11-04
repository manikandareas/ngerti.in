import { mkdir } from "node:fs/promises";
import { createRequire } from "node:module";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { generateIcons } from "./generate-icons";

const desktop = fileURLToPath(new URL("../", import.meta.url));
const require = createRequire(import.meta.url);
try {
  require("electron");
} catch {
  const install = Bun.spawn(["node", require.resolve("electron/install.js")], {
    stdout: "inherit",
    stderr: "inherit",
  });
  if (await install.exited) throw new Error("The pinned Electron binary could not be installed.");
}

await mkdir(join(desktop, "dist"), { recursive: true });
for (const name of ["main", "preload"]) {
  const result = await Bun.build({
    entrypoints: [join(desktop, `src/${name}.ts`)],
    target: "node",
    format: "cjs",
    external: ["electron"],
    outdir: join(desktop, "dist"),
    naming: `${name}.cjs`,
    sourcemap: "external",
  });
  if (!result.success) throw new AggregateError(result.logs, "Desktop build failed");
}
await generateIcons(desktop);
