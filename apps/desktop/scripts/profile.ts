import {
  accessSync,
  constants,
  lstatSync,
  mkdirSync,
  readFileSync,
  renameSync,
  writeFileSync,
} from "node:fs";
import { homedir } from "node:os";
import { delimiter, isAbsolute, join, resolve } from "node:path";

export type Profile = {
  version: 2;
  managerId: string;
  serverOrigin: string;
  serverCertificate?: string;
  initialPath?: string;
  projectRoot: string;
  uiPort: number;
};
export function desktopHome(): string {
  return resolve(
    process.env.NGERTIIN_DESKTOP_HOME ??
      join(homedir(), "Library/Application Support/Ngertiin Tauri"),
  );
}
export function privateJson<T>(path: string): T {
  const info = lstatSync(path);
  if (!info.isFile() || info.isSymbolicLink() || (info.mode & 0o077) !== 0 || info.size > 65536)
    throw new Error("Private configuration has invalid permissions or format.");
  return JSON.parse(readFileSync(path, "utf8"));
}
export function writePrivate(path: string, value: unknown): void {
  const temporary = `${path}.${crypto.randomUUID()}`;
  writeFileSync(temporary, JSON.stringify(value, null, 2), { mode: 0o600, flag: "wx" });
  renameSync(temporary, path);
}
export function loadProfile(home = desktopHome()): Profile {
  const profile = privateJson<Profile>(join(home, "profile.json"));
  const allowed = [
    "version",
    "managerId",
    "serverOrigin",
    "serverCertificate",
    "initialPath",
    "projectRoot",
    "uiPort",
  ];
  if (
    profile.version !== 2 ||
    !/^[a-f0-9-]{36}$/.test(profile.managerId) ||
    Object.keys(profile).some((key) => !allowed.includes(key)) ||
    !Number.isInteger(profile.uiPort) ||
    profile.uiPort < 1024 ||
    profile.uiPort > 65535 ||
    !isAbsolute(profile.projectRoot) ||
    (profile.serverCertificate && !isAbsolute(profile.serverCertificate)) ||
    (profile.initialPath && !/^\/invitations\/[a-f0-9-]{36}$/.test(profile.initialPath))
  )
    throw new Error(
      "The desktop profile is invalid. Run setup:desktop with an account-authenticated server.",
    );
  validateServerOrigin(profile.serverOrigin);
  return profile;
}
export function validateServerOrigin(value: string) {
  const url = new URL(value);
  const loopback =
    process.env.APP_ENV !== "production" &&
    url.protocol === "http:" &&
    url.hostname === "127.0.0.1" &&
    !!url.port;
  if (
    (url.protocol !== "https:" && !loopback) ||
    url.origin !== value ||
    url.username ||
    url.password
  )
    throw new Error(
      "Select one canonical HTTPS origin; development also supports IPv4 loopback HTTP.",
    );
  return value;
}
export function findExecutable(command: string | undefined): string | undefined {
  if (!command) return undefined;
  const candidates = isAbsolute(command)
    ? [command]
    : [
        ...(process.env.PATH ?? "").split(delimiter),
        "/opt/homebrew/bin",
        "/usr/local/bin",
        join(homedir(), ".bun/bin"),
        "/usr/bin",
        "/bin",
      ].map((p) => join(p, command));
  return candidates.find((p) => {
    try {
      accessSync(p, constants.X_OK);
      return true;
    } catch {
      return false;
    }
  });
}
export function prepareHome(home = desktopHome()): string {
  mkdirSync(home, { recursive: true, mode: 0o700 });
  const info = lstatSync(home);
  if (!info.isDirectory() || info.isSymbolicLink() || (info.mode & 0o077) !== 0)
    throw new Error("The desktop data directory must be private (0700).");
  return home;
}
