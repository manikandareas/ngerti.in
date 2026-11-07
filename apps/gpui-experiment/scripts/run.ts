import { cargo, directory, target, prepare, run } from "./toolchain";
import { existsSync } from "node:fs";
import { resolve } from "node:path";

if (
  !existsSync(resolve(directory, "assets/reference/index.html")) ||
  !existsSync(resolve(directory, "assets/fonts/Geist.ttf"))
)
  await prepare();
await run([cargo, "run", "--locked", "--target-dir", target, "-j", "2"]);
