import { expect, test } from "bun:test";
import { chmodSync, readFileSync, symlinkSync } from "node:fs";
import { join } from "node:path";
import { createLog } from "../src/log";
import { loadProfile, privateJson, writePrivate } from "../src/profile";
import { fixture } from "./fixtures";

test("private profile validation rejects unsafe files and logs redact secrets", async () => {
  const f = await fixture();
  try {
    const path = join(f.home, "profile.json");
    writePrivate(path, f.profile);
    expect(loadProfile(f.home)).toEqual(f.profile);
    chmodSync(path, 0o644);
    expect(() => loadProfile(f.home)).toThrow();
    chmodSync(path, 0o600);
    symlinkSync(path, join(f.home, "link.json"));
    expect(() => privateJson(join(f.home, "link.json"))).toThrow();
    const log = createLog(f.home, ["private-installation-token"]);
    log("test", { token: "another-secret", output: "private-installation-token Bearer foo-bar" });
    const output = readFileSync(join(f.home, "desktop.log"), "utf8");
    expect(output).not.toContain("private-installation-token");
    expect(output).not.toContain("another-secret");
    expect(output).not.toContain("foo-bar");
  } finally {
    f.close();
  }
});
