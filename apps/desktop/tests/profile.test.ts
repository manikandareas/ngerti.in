import { expect, test } from "bun:test";
import { chmodSync, mkdirSync, mkdtempSync, rmSync, symlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { loadProfile, type Profile, privateJson, writePrivate } from "../scripts/profile";

test("private desktop profile validation rejects unsafe files", () => {
  const home = mkdtempSync(join(tmpdir(), "ngertiin-desktop-profile-"));
  const profile: Profile = {
    version: 1,
    managerId: crypto.randomUUID(),
    stateDirectory: join(home, "state"),
    projectRoot: home,
    configFile: join(home, "empty.env"),
    bunExecutable: process.execPath,
    uiPort: 4311,
  };
  try {
    const path = join(home, "profile.json");
    writePrivate(path, profile);
    expect(loadProfile(home)).toEqual(profile);
    chmodSync(path, 0o644);
    expect(() => loadProfile(home)).toThrow("Private configuration");
    chmodSync(path, 0o600);
    symlinkSync(path, join(home, "link.json"));
    expect(() => privateJson(join(home, "link.json"))).toThrow();
    mkdirSync(join(home, "directory"), { mode: 0o700 });
    expect(() => privateJson(join(home, "directory"))).toThrow();
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
});
