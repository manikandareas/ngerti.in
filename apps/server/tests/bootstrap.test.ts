import { expect, test } from "bun:test";
import { mkdtempSync, readFileSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Client } from "pg";
import { startApplication } from "../src/main";

test("bootstrap exposes discovery, enforces one authority, and preserves state across restart", async () => {
  const stateDir = mkdtempSync(join(tmpdir(), "ngertiin-bootstrap-"));
  const config = {
    owner_id: crypto.randomUUID(),
    token: "c".repeat(64),
    stateDir,
    installationFile: join(stateDir, "installation.json"),
    database: join(stateDir, "ngertiin.postgres"),
    databaseUrl: process.env.NGERTIIN_TEST_DATABASE_URL,
    databaseSchema: `test_${crypto.randomUUID().replaceAll("-", "")}`,
    port: 0,
    groupRouter: "member" as const,
    typesafeApiKey: undefined,
    harnessExecutables: { codex: undefined, muse: undefined },
  };
  let application: Awaited<ReturnType<typeof startApplication>> | undefined;
  try {
    const occupied = Bun.serve({
      hostname: "127.0.0.1",
      port: 0,
      fetch: () => new Response("occupied"),
    });
    try {
      await expect(
        startApplication({ ...config, port: occupied.port as number }),
      ).rejects.toThrow();
    } finally {
      await occupied.stop(true);
    }
    application = await startApplication(config);
    const first = JSON.parse(readFileSync(join(stateDir, "runtime.json"), "utf8"));
    expect(first.url).toBe(application.url);
    expect(statSync(join(stateDir, "runtime.json")).mode & 0o077).toBe(0);
    await expect((async () => startApplication(config))()).rejects.toThrow(
      "Another application authority",
    );
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
    application = await startApplication(config);
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
    const client = new Client({ connectionString: config.databaseUrl });
    await client.connect();
    try {
      await client.query(`DROP SCHEMA IF EXISTS "${config.databaseSchema}" CASCADE`);
    } finally {
      await client.end();
    }
    rmSync(stateDir, { recursive: true, force: true });
  }
});
