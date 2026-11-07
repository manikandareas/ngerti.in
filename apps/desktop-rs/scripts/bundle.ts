import { cp, mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { directory, run, target } from "./cargo";

if (process.platform !== "darwin" || process.arch !== "arm64") {
  throw new Error("The current development bundle targets macOS ARM64.");
}
await run(["build", "--locked", "-p", "ngertiin-desktop", "-j", "2"]);
const bundle = resolve(directory, "dist/Ngertiin Rust Development.app");
await mkdir(resolve(bundle, "Contents/MacOS"), { recursive: true });
await cp(
  resolve(target, "debug/ngertiin-desktop"),
  resolve(bundle, "Contents/MacOS/ngertiin-desktop"),
);
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
console.log(bundle);
