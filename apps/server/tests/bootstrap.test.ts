import { expect, test } from "bun:test";
import { mkdtempSync, readFileSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { startApplication } from "../src/main";

test("bootstrap exposes discovery, enforces one authority, and preserves state across restart", async () => {
  const stateDir = mkdtempSync(join(tmpdir(), "ngertiin-bootstrap-"));
  const config = {
    owner_id: crypto.randomUUID(),
    token: "c".repeat(64),
    stateDir,
    installationFile: join(stateDir, "installation.json"),
    database: join(stateDir, "ngertiin.sqlite"),
    port: 0,
    groupRouter: "member" as const,
    typesafeApiKey: undefined,
    harnessExecutables: { codex: undefined, muse: undefined },
  };
  let application: ReturnType<typeof startApplication> | undefined;
  try {
    application = startApplication(config);
    const first = JSON.parse(readFileSync(join(stateDir, "runtime.json"), "utf8"));
    expect(first.url).toBe(application.url);
    expect(statSync(join(stateDir, "runtime.json")).mode & 0o077).toBe(0);
    expect(() => startApplication(config)).toThrow("Another application authority");
    const response = await fetch(`${application.url}/health/ready`, {
      headers: { Authorization: `Bearer ${config.token}` },
    });
    expect(response.status).toBe(200);
    const agents = await (
      await fetch(`${application.url}/v1/entities/agent`, {
        headers: { Authorization: `Bearer ${config.token}` },
      })
    ).json();
    await application.stop();
    expect(() => readFileSync(join(stateDir, "runtime.json"))).toThrow();
    application = startApplication(config);
    const second = JSON.parse(readFileSync(join(stateDir, "runtime.json"), "utf8"));
    expect(second.instance_id).not.toBe(first.instance_id);
    expect(
      await (
        await fetch(`${application.url}/v1/entities/agent`, {
          headers: { Authorization: `Bearer ${config.token}` },
        })
      ).json(),
    ).toEqual(agents);
  } finally {
    await application?.stop();
    rmSync(stateDir, { recursive: true, force: true });
  }
});
