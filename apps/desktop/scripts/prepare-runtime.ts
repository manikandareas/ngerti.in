import { cp, mkdir, rm } from "node:fs/promises";
import { join } from "node:path";
import { generateIcons } from "./generate-icons";
import { desktop, root } from "./toolchain";

export async function prepareRuntime() {
  await mkdir(join(desktop, "dist"), { recursive: true });
  await generateIcons(desktop);
  const stage = join(root, ".dev/tauri-stage");
  await mkdir(stage, { recursive: true });
  await rm(join(stage, "runtime"), { recursive: true, force: true });
  await rm(join(desktop, "src-tauri/binaries"), { recursive: true, force: true });
  await cp(join(root, "apps/web-client/dist"), join(stage, "web"), { recursive: true });
}
