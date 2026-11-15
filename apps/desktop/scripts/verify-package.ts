import { access, readdir } from "node:fs/promises";
import { join } from "node:path";
import { native } from "./toolchain";

export async function verifyPackage() {
  const bundle = join(native, "target/release/bundle/macos/Ngertiin Tauri.app/Contents");
  await access(join(bundle, "Resources/web/index.html"));
  const resources = await readdir(join(bundle, "Resources"));
  const binaries = await readdir(join(bundle, "MacOS"));
  if (resources.includes("runtime") || binaries.includes("bun"))
    throw new Error(
      "The client bundle contains a retired backend runtime. Clean the bundle and rebuild.",
    );
  console.log("Packaged account client contains UI assets without a backend runtime.");
}
if (import.meta.main) await verifyPackage();
