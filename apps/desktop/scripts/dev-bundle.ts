import { cp, mkdir, rename, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { desktop, native } from "./toolchain";

/** Give the debug client its own macOS application identity without bundling a server. */
export async function developmentExecutable() {
  const executable = join(native, "target/debug/ngertiin-desktop");
  if (process.platform !== "darwin") return executable;
  const contents = join(native, "target/debug/Ngertiin Development.app/Contents");
  await mkdir(join(contents, "MacOS"), { recursive: true });
  await mkdir(join(contents, "Resources"), { recursive: true });
  const target = join(contents, "MacOS/ngertiin-desktop");
  const temporary = `${target}.${crypto.randomUUID()}`;
  await cp(executable, temporary);
  await rename(temporary, target);
  await cp(join(desktop, "dist/app.icns"), join(contents, "Resources/app.icns"));
  await writeFile(
    join(contents, "Info.plist"),
    `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
<key>CFBundleExecutable</key><string>ngertiin-desktop</string>
<key>CFBundleIdentifier</key><string>in.ngertiin.desktop.development</string>
<key>CFBundleName</key><string>Ngertiin Development</string>
<key>CFBundleDisplayName</key><string>Ngertiin Development</string>
<key>CFBundlePackageType</key><string>APPL</string>
<key>CFBundleVersion</key><string>0.2.0</string>
<key>CFBundleIconFile</key><string>app.icns</string>
<key>LSMinimumSystemVersion</key><string>14.0</string>
<key>NSHighResolutionCapable</key><true/>
</dict></plist>`,
  );
  return target;
}
