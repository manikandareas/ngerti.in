import { chmod, cp, mkdir, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { generateIcons } from "./generate-icons";
import { cargo, desktop, native, root, run } from "./toolchain";

export async function prepareRuntime() {
  await mkdir(join(desktop, "dist"), { recursive: true });
  await generateIcons(desktop);
  const info = await Bun.$`${cargo} -vV`.text();
  const target = info.match(/^host: (.+)$/m)?.[1];
  if (!target) throw new Error("The Rust host target is unavailable.");
  await mkdir(join(native, "binaries"), { recursive: true });
  const bun = join(
    native,
    "binaries",
    `bun-${target}${process.platform === "win32" ? ".exe" : ""}`,
  );
  await cp(process.execPath, bun);
  await chmod(bun, 0o755);
  const stage = join(root, ".dev/tauri-stage");
  await rm(stage, { recursive: true, force: true });
  const runtime = join(stage, "runtime");
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
      "--linker",
      "hoisted",
      "--filter",
      "@ngertiin/server",
      "--filter",
      "@ngertiin/avatar",
    ],
    runtime,
  );
  // Tauri skips directory symlinks while collecting resources. Materialize the runtime's
  // workspace dependency so its package exports resolve inside the shipped application.
  const avatar = join(runtime, "node_modules/@ngertiin/avatar");
  await rm(avatar, { recursive: true, force: true });
  await cp(join(runtime, "packages/avatar"), avatar, { recursive: true, dereference: true });
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
}
