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
  version: 1;
  managerId: string;
  stateDirectory: string;
  projectRoot: string;
  configFile: string;
  bunExecutable: string;
  codexExecutable?: string;
  museExecutable?: string;
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
  if (
    profile.version !== 1 ||
    !/^[a-f0-9-]{36}$/.test(profile.managerId) ||
    ![profile.stateDirectory, profile.projectRoot, profile.configFile, profile.bunExecutable].every(
      (value) => typeof value === "string" && isAbsolute(value),
    ) ||
    !Number.isInteger(profile.uiPort) ||
    profile.uiPort < 1024 ||
    profile.uiPort > 65535 ||
    [profile.codexExecutable, profile.museExecutable].some(
      (value) => value !== undefined && (typeof value !== "string" || !isAbsolute(value)),
    )
  )
    throw new Error("The desktop profile is invalid. Run setup:desktop again.");
  return profile;
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
