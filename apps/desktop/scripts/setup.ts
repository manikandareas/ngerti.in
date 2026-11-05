import { existsSync, readFileSync } from "node:fs";
import { createServer } from "node:net";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parseEnv } from "node:util";
import {
  findExecutable,
  loadProfile,
  type Profile,
  prepareHome,
  tauriHome,
  writePrivate,
} from "../src/profile";

const root = fileURLToPath(new URL("../../../", import.meta.url));
const home = prepareHome(tauriHome());
if (existsSync(join(home, "profile.json"))) {
  loadProfile(home);
  console.log("Desktop profile already exists. Existing data and credentials were preserved.");
} else {
  let saved: Record<string, string | undefined> = {};
  try {
    saved = parseEnv(readFileSync(join(root, ".env"), "utf8"));
  } catch {
    /* Configuration is optional. */
  }
  const server = createServer();
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("Could not reserve a desktop port.");
  const uiPort = address.port;
  await new Promise<void>((resolve) => server.close(() => resolve()));
  const executable = (value: string) =>
    findExecutable(value.includes("/") ? resolve(root, value) : value);
  const profile: Profile = {
    version: 1,
    managerId: crypto.randomUUID(),
    projectRoot: root,
    stateDirectory: resolve(root, process.env.NGERTIIN_STATE_DIR ?? ".dev/harness-first"),
    configFile: join(root, ".env"),
    bunExecutable: process.execPath,
    uiPort,
    codexExecutable: executable(
      process.env.NGERTIIN_CODEX_EXECUTABLE ?? saved.NGERTIIN_CODEX_EXECUTABLE ?? "codex",
    ),
    museExecutable: executable(
      process.env.NGERTIIN_MUSE_EXECUTABLE ??
        saved.NGERTIIN_MUSE_EXECUTABLE ??
        (existsSync(join(root, ".dev/nma050/muse")) ? join(root, ".dev/nma050/muse") : "muse"),
    ),
  };
  writePrivate(join(home, "profile.json"), profile);
  console.log(
    "Desktop profile created. It references the selected development state without copying credentials.",
  );
}
console.log(`Profile: ${join(home, "profile.json")}`);
