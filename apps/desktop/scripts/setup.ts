import { existsSync, readFileSync } from "node:fs";
import { createServer } from "node:net";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs, parseEnv } from "node:util";
import {
  findExecutable,
  loadProfile,
  type Profile,
  prepareHome,
  validateServerOrigin,
  writePrivate,
} from "./profile";

const root = fileURLToPath(new URL("../../../", import.meta.url));
const home = prepareHome();
const { values } = parseArgs({
  args: process.argv.slice(2).filter((arg) => arg !== "--"),
  options: {
    remote: { type: "string" },
    certificate: { type: "string" },
    invitation: { type: "string" },
  },
});
if (!values.remote && (values.certificate || values.invitation))
  throw new Error("Certificate and invitation options require --remote.");
if (existsSync(join(home, "profile.json"))) {
  const current = loadProfile(home);
  if (values.remote && (current.mode !== "remote" || current.serverOrigin !== values.remote))
    throw new Error(
      "This profile already selects another server or mode. Select a separate NGERTIIN_DESKTOP_HOME.",
    );
  console.log("Desktop profile already exists. Existing data and credentials were preserved.");
} else {
  let saved: Record<string, string | undefined> = {};
  try {
    if (!values.remote) saved = parseEnv(readFileSync(join(root, ".env"), "utf8"));
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
  let profile: Profile;
  if (values.remote) {
    const serverOrigin = validateServerOrigin(values.remote);
    let initialPath: string | undefined;
    if (values.invitation) {
      const invitation = new URL(values.invitation);
      if (
        invitation.origin !== serverOrigin ||
        !/^\/invitations\/[a-f0-9-]{36}$/.test(invitation.pathname) ||
        invitation.search ||
        invitation.hash ||
        invitation.username ||
        invitation.password
      )
        throw new Error("The invitation must belong to the selected server.");
      initialPath = invitation.pathname;
    }
    profile = {
      version: 1,
      mode: "remote",
      managerId: crypto.randomUUID(),
      serverOrigin,
      serverCertificate: values.certificate ? resolve(values.certificate) : undefined,
      projectRoot: root,
      uiPort,
      initialPath,
    };
  } else
    profile = {
      version: 1,
      mode: "local-development",
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
  loadProfile(home);
  console.log(
    "Desktop profile created. It references the selected development state without copying credentials.",
  );
}
console.log(`Profile: ${join(home, "profile.json")}`);
