/** Backend-only resource closure adapted from the Tauri development packager. */
import { chmod, cp, mkdir, rm, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { repository } from "./cargo";

export async function stageBackend(contents: string) {
  const runtime = join(contents, "Resources/runtime");
  await rm(runtime, { recursive: true, force: true });
  await mkdir(runtime, { recursive: true });
  const bun = join(contents, "MacOS/bun");
  await cp(process.execPath, bun);
  await chmod(bun, 0o755);
  for (const directory of ["apps/server", "packages/avatar"]) {
    await mkdir(join(runtime, directory), { recursive: true });
    await cp(join(repository, directory, "src"), join(runtime, directory, "src"), {
      recursive: true,
    });
    await cp(join(repository, directory, "package.json"), join(runtime, directory, "package.json"));
  }
  await mkdir(join(runtime, "infra"), { recursive: true });
  await cp(join(repository, "infra/machine"), join(runtime, "infra/machine"), {
    recursive: true,
    filter: (path) => !path.endsWith(".env"),
  });
  for (const name of ["package.json", "bun.lock"])
    await cp(join(repository, name), join(runtime, name));
  const manifest = await Bun.file(join(repository, "package.json")).json();
  for (const workspace of manifest.workspaces as string[]) {
    await mkdir(join(runtime, workspace), { recursive: true });
    await cp(join(repository, workspace, "package.json"), join(runtime, workspace, "package.json"));
  }
  const install = Bun.spawn(
    [
      bun,
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
    { cwd: runtime, stdout: "inherit", stderr: "inherit" },
  );
  if (await install.exited) throw new Error("The bundled backend dependency installation failed.");
  const avatar = join(runtime, "node_modules/@ngertiin/avatar");
  await rm(avatar, { recursive: true, force: true });
  await mkdir(dirname(avatar), { recursive: true });
  await cp(join(runtime, "packages/avatar"), avatar, { recursive: true, dereference: true });
  await writeFile(
    join(runtime, "build.json"),
    JSON.stringify(
      {
        bun: Bun.version,
        platform: process.platform,
        architecture: process.arch,
        application_ui: "Rust + GPUI",
        backend_entry: "apps/server/src/main.ts",
      },
      null,
      2,
    ),
  );
}
