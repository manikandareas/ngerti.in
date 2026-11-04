import { expect, test } from "bun:test";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { Supervisor } from "../src/supervisor";
import { fixture, root } from "./fixtures";

const wait = (ms: number) => new Promise<void>((ok) => setTimeout(ok, ms));

test("managed backend survives UI disconnect, crash recovery preserves state, and Quit stops only owned services", async () => {
  const f = await fixture();
  const options = {
    profile: f.profile,
    bun: process.execPath,
    serverEntry: join(root, "apps/server/src/main.ts"),
    root,
    log: () => {},
    legacyUrl: false as const,
  };
  const a = new Supervisor(options);
  const observer = new Supervisor({
    ...options,
    profile: { ...f.profile, managerId: crypto.randomUUID() },
  });
  try {
    await a.start();
    expect(a.status.state).toBe("ready");
    expect(a.status.ownership).toBe("managed");
    const first = JSON.parse(readFileSync(join(f.profile.stateDirectory, "runtime.json"), "utf8"));
    const agents = await (
      await fetch(`${a.backend}/v1/entities/agent`, {
        headers: { Authorization: `Bearer ${a.token()}` },
      })
    ).json();
    await observer.start();
    expect(observer.status.ownership).toBe("external");
    await observer.stop();
    expect((await fetch(`${a.backend}/health/live`)).ok).toBe(true);
    process.kill(first.pid, "SIGKILL");
    await wait(250);
    await a.check();
    expect(a.status.state).toBe("ready");
    const second = JSON.parse(readFileSync(join(f.profile.stateDirectory, "runtime.json"), "utf8"));
    expect(second.instance_id).not.toBe(first.instance_id);
    expect(
      await (
        await fetch(`${a.backend}/v1/entities/agent`, {
          headers: { Authorization: `Bearer ${a.token()}` },
        })
      ).json(),
    ).toEqual(agents);
    await a.stop();
    expect(() => readFileSync(join(f.profile.stateDirectory, "runtime.json"))).toThrow();
  } finally {
    await a.stop();
    await observer.stop();
    f.close();
  }
}, 30000);

test("concurrent startup shares an attempt and immediate shutdown leaves no authority behind", async () => {
  const f = await fixture();
  const options = {
    profile: f.profile,
    bun: process.execPath,
    serverEntry: join(root, "apps/server/src/main.ts"),
    root,
    log: () => {},
    legacyUrl: false as const,
  };
  const a = new Supervisor(options);
  try {
    const start = a.start();
    expect(a.start()).toBe(start);
    await a.stop();
    expect(a.status.state).toBe("stopped");
    await wait(300);
    const b = new Supervisor(options);
    try {
      await b.start();
      expect(b.status.state).toBe("ready");
    } finally {
      await b.stop();
    }
  } finally {
    await a.stop();
    f.close();
  }
}, 30000);

test("hidden desktop releases only its own current human control revision", async () => {
  const f = await fixture();
  writeFileSync(
    join(f.profile.stateDirectory, "installation.json"),
    JSON.stringify({ token: "a".repeat(64) }),
    { mode: 0o600 },
  );
  let releases = 0;
  const server = Bun.serve({
    hostname: "127.0.0.1",
    port: 0,
    fetch(request) {
      if (request.method === "POST") {
        releases++;
        return Response.json({ released: true });
      }
      return Response.json({ lease: { holder: "human", state: "active", revision: 12 } });
    },
  });
  const supervisor = new Supervisor({
    profile: f.profile,
    bun: process.execPath,
    serverEntry: "unused",
    root,
    log: () => {},
    legacyUrl: false,
  });
  supervisor.backend = server.url.origin;
  try {
    await supervisor.releaseHuman();
    await supervisor.releaseHuman(11);
    expect(releases).toBe(0);
    await supervisor.releaseHuman(12);
    expect(releases).toBe(1);
  } finally {
    await server.stop(true);
    f.close();
  }
});
