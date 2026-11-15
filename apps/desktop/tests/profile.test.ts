import { expect, test } from "bun:test";
import { chmodSync, mkdirSync, mkdtempSync, rmSync, symlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { loadProfile, type Profile, privateJson, writePrivate } from "../scripts/profile";

test("private desktop profile validation rejects unsafe files", () => {
  const home = mkdtempSync(join(tmpdir(), "ngertiin-desktop-profile-"));
  const profile: Profile = {
    version: 2,
    managerId: crypto.randomUUID(),
    serverOrigin: "https://workspace.example.test",
    projectRoot: home,
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

test("remote profiles validate the selected HTTPS origin without any local runtime paths", () => {
  const home = mkdtempSync(join(tmpdir(), "ngertiin-remote-profile-"));
  const path = join(home, "profile.json");
  const profile = {
    version: 2,
    managerId: crypto.randomUUID(),
    serverOrigin: "https://workspace.example.test",
    projectRoot: home,
    uiPort: 4312,
  };
  try {
    writePrivate(path, profile);
    expect(loadProfile(home).serverOrigin).toBe(profile.serverOrigin);
    for (const serverOrigin of [
      "http://workspace.example.test",
      "https://workspace.example.test/",
      "https://workspace.example.test/path",
      "https://user:secret@workspace.example.test",
      "https://workspace.example.test#fragment",
    ]) {
      writePrivate(path, { ...profile, serverOrigin });
      expect(() => loadProfile(home)).toThrow();
    }
    writePrivate(path, { ...profile, mode: "automatic" });
    expect(() => loadProfile(home)).toThrow();
    writePrivate(path, { ...profile, mode: "local-development" });
    expect(() => loadProfile(home)).toThrow();
    writePrivate(path, { ...profile, initialPath: "//foreign.invalid/path" });
    expect(() => loadProfile(home)).toThrow();
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
});
