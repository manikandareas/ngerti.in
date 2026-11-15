import { existsSync } from "node:fs";
import { createServer } from "node:net";
import { join, resolve } from "node:path";
import {
  desktopHome,
  loadProfile,
  type Profile,
  prepareHome,
  validateServerOrigin,
  writePrivate,
} from "./profile";

export async function setupDesktop(
  serverOrigin: string,
  home = desktopHome(),
  certificate?: string,
  invitation?: string,
): Promise<Profile> {
  validateServerOrigin(serverOrigin);
  prepareHome(home);
  if (existsSync(join(home, "profile.json"))) {
    const profile = loadProfile(home);
    if (profile.serverOrigin !== serverOrigin || profile.serverCertificate !== certificate)
      throw new Error("This profile selects another server. Use a separate NGERTIIN_DESKTOP_HOME.");
    return profile;
  }
  const probe = createServer();
  const uiPort = await new Promise<number>((accept, reject) => {
    probe.once("error", reject);
    probe.listen(0, "127.0.0.1", () => {
      const address = probe.address();
      if (!address || typeof address === "string")
        return reject(new Error("No desktop port was allocated."));
      const port = address.port;
      probe.close((error) => (error ? reject(error) : accept(port)));
    });
  });
  let initialPath: string | undefined;
  if (invitation) {
    const url = new URL(invitation);
    if (
      url.origin !== serverOrigin ||
      !/^\/invitations\/[a-f0-9-]{36}$/.test(url.pathname) ||
      url.search ||
      url.hash ||
      url.username ||
      url.password
    )
      throw new Error("Select an invitation on this server.");
    initialPath = url.pathname;
  }
  const profile: Profile = {
    version: 2,
    managerId: crypto.randomUUID(),
    serverOrigin,
    projectRoot: resolve(import.meta.dir, "../../.."),
    uiPort,
    ...(certificate ? { serverCertificate: certificate } : {}),
    ...(initialPath ? { initialPath } : {}),
  };
  writePrivate(join(home, "profile.json"), profile);
  return profile;
}
if (import.meta.main) {
  const args = process.argv.slice(2).filter((value) => value !== "--");
  const option = (name: string) => {
    const index = args.indexOf(name);
    return index < 0 ? undefined : args[index + 1];
  };
  const origin = option("--server") ?? process.env.NGERTIIN_AUTH_URL ?? "http://127.0.0.1:3001";
  await setupDesktop(origin, desktopHome(), option("--certificate"), option("--invitation"));
  console.log("Account-authenticated desktop profile ready.");
}
