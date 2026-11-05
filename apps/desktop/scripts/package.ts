import { buildDesktop } from "./build";
import { verifyPackage } from "./verify-package";

await buildDesktop(true);
await verifyPackage();
console.log(
  "Tauri application: apps/desktop/src-tauri/target/release/bundle/macos/Ngertiin Tauri.app",
);
