import { createHash } from "node:crypto";
import { cp, mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { directory, run, target } from "./cargo";

if (process.platform !== "darwin" || process.arch !== "arm64") {
  throw new Error("The current development bundle targets macOS ARM64.");
}
const inputs = [
  "Cargo.toml",
  "Cargo.lock",
  "scripts/bundle.ts",
  "../../docs/contracts/1.31.0.json",
];
for (const pattern of [
  "crates/**/*",
  "assets/**/*",
  "verification/nma-067/**/*.json",
  "verification/nma-067/**/*.pdf",
])
  for await (const path of new Bun.Glob(pattern).scan({ cwd: directory, onlyFiles: true }))
    inputs.push(path);
const hash = (bytes: Uint8Array) => createHash("sha256").update(bytes).digest("hex");
const before = Object.fromEntries(
  await Promise.all(
    [...new Set(inputs)]
      .sort()
      .map(async (path) => [path, hash(await readFile(resolve(directory, path)))]),
  ),
);
await run(["build", "--locked", "-p", "ngertiin-desktop", "-j", "2"]);
for (const [path, expected] of Object.entries(before))
  if (hash(await readFile(resolve(directory, path))) !== expected)
    throw new Error(`Build input changed during compilation: ${path}`);
const bundle = resolve(directory, "dist/Ngertiin Rust Development.app");
await mkdir(resolve(bundle, "Contents/MacOS"), { recursive: true });
const executable = resolve(bundle, "Contents/MacOS/ngertiin-desktop");
const temporaryExecutable = resolve(bundle, "Contents/MacOS/.ngertiin-desktop-next");
await cp(resolve(target, "debug/ngertiin-desktop"), temporaryExecutable);
await rename(temporaryExecutable, executable);
await cp(resolve(directory, "assets"), resolve(bundle, "Contents/Resources/assets"), {
  recursive: true,
});
await writeFile(
  resolve(bundle, "Contents/Info.plist"),
  `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
<key>CFBundleExecutable</key><string>ngertiin-desktop</string>
<key>CFBundleIdentifier</key><string>in.ngertiin.desktop.rust.development</string>
<key>CFBundleName</key><string>Ngertiin Rust Development</string>
<key>CFBundlePackageType</key><string>APPL</string>
<key>CFBundleShortVersionString</key><string>0.1.0</string>
<key>NSHighResolutionCapable</key><true/>
<key>LSMinimumSystemVersion</key><string>14.0</string>
</dict></plist>`,
);
await writeFile(
  resolve(bundle, "Contents/Resources/build-manifest.json"),
  JSON.stringify(
    {
      version: 1,
      profile: "development with the Cargo.toml renderer optimization overrides",
      target: "macOS ARM64",
      built_at: new Date().toISOString(),
      inputs: before,
      binary_sha256: hash(await readFile(resolve(bundle, "Contents/MacOS/ngertiin-desktop"))),
    },
    null,
    2,
  ),
);
console.log(bundle);
