import { mkdir, cp, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { cargo, directory, target, prepare, run } from "./toolchain";

if (!process.argv.includes("--skip-prepare")) await prepare();
await run([cargo, "build", "--locked", "--target-dir", target, "-j", "2"]);
const app = resolve(directory, "dist/Ngertiin GPUI Experiment.app");
await mkdir(resolve(app, "Contents/MacOS"), { recursive: true });
await mkdir(resolve(app, "Contents/Resources"), { recursive: true });
await cp(
  resolve(target, "debug/ngertiin-gpui-experiment"),
  resolve(app, "Contents/MacOS/ngertiin-gpui-experiment"),
);
await cp(resolve(directory, "assets"), resolve(app, "Contents/Resources/assets"), {
  recursive: true,
});
await writeFile(
  resolve(app, "Contents/Info.plist"),
  `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
<key>CFBundleExecutable</key><string>ngertiin-gpui-experiment</string>
<key>CFBundleIdentifier</key><string>in.ngertiin.gpui.experiment</string>
<key>CFBundleName</key><string>Ngertiin GPUI Experiment</string>
<key>CFBundleDisplayName</key><string>Ngertiin GPUI Experiment</string>
<key>CFBundlePackageType</key><string>APPL</string>
<key>CFBundleShortVersionString</key><string>0.1.0</string>
<key>NSHighResolutionCapable</key><true/>
<key>LSMinimumSystemVersion</key><string>14.0</string>
</dict></plist>`,
);
console.log(`App ready: ${app}`);
