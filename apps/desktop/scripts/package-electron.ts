import { chmod, cp, mkdir, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../../../", import.meta.url));
const desktop = join(root, "apps/desktop");
const stage = join(root, ".dev/desktop-stage");
async function run(args: string[], cwd = root) {
  const child = Bun.spawn(args, { cwd, stdout: "inherit", stderr: "inherit" });
  if (await child.exited) throw new Error(`Packaging step failed: ${args[1] ?? args[0]}`);
}
await run([process.execPath, join(desktop, "scripts/build-electron.ts")]);
await run([process.execPath, "run", "build:web-client"]);
await rm(stage, { recursive: true, force: true });
const runtime = join(stage, "runtime");
await mkdir(join(runtime, "bin"), { recursive: true });
for (const directory of ["apps/server", "packages/avatar"]) {
  await mkdir(join(runtime, directory), { recursive: true });
  await cp(join(root, directory, "src"), join(runtime, directory, "src"), { recursive: true });
  await cp(join(root, directory, "package.json"), join(runtime, directory, "package.json"));
}
await mkdir(join(runtime, "infra"), { recursive: true });
await cp(join(root, "infra/machine"), join(runtime, "infra/machine"), {
  recursive: true,
  filter: (source) => !source.endsWith(".env"),
});
await cp(process.execPath, join(runtime, "bin/bun"));
await chmod(join(runtime, "bin/bun"), 0o755);
// Preserve the workspace lock graph, but install only the backend production closure.
await cp(join(root, "package.json"), join(runtime, "package.json"));
await cp(join(root, "bun.lock"), join(runtime, "bun.lock"));
const manifest = await Bun.file(join(root, "package.json")).json();
for (const workspace of manifest.workspaces as string[]) {
  await mkdir(join(runtime, workspace), { recursive: true });
  await cp(join(root, workspace, "package.json"), join(runtime, workspace, "package.json"));
}
await run(
  [
    process.execPath,
    "install",
    "--production",
    "--frozen-lockfile",
    "--ignore-scripts",
    "--filter",
    "@ngertiin/server",
    "--filter",
    "@ngertiin/avatar",
  ],
  runtime,
);
await cp(join(root, "apps/web-client/dist"), join(stage, "web"), { recursive: true });
await writeFile(
  join(runtime, "build.json"),
  JSON.stringify({
    built_at: new Date().toISOString(),
    bun: Bun.version,
    platform: process.platform,
    architecture: process.arch,
  }),
);
await run(
  ["node", join(desktop, "node_modules/@electron-forge/cli/dist/electron-forge.js"), "package"],
  desktop,
);
console.log(
  "Development application packaged in apps/desktop/out. No user state or credentials were bundled.",
);
