import { afterEach, expect, test } from "bun:test";
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { Client } from "pg";
import { createApi } from "../../src/api";
import { Artifacts } from "../../src/artifacts";
import { Background } from "../../src/background";
import {
  backupSQLite,
  importSQLite,
  inspectSQLite,
  reconcileImport,
  restoreSQLiteBackup,
  verifyBackup,
} from "../../src/persistence/sqlite-import";
import { Store } from "../../src/store";
import { Workspaces } from "../../src/workspaces/service";
import { fixture } from "../helpers";
import { exportLegacyFixture } from "./legacy-fixture";

let f: Awaited<ReturnType<typeof fixture>>;
afterEach(async () => {
  await f?.close();
});

test("nested failure restores its savepoint while an outer command commits one receipt", async () => {
  f = await fixture();
  const id = crypto.randomUUID();
  const before = await f.store.cursor;
  const result = await f.store.command(id, {}, async () => {
    const first = await f.admit("Retain outer work");
    await expect(
      f.store.transaction(async () => {
        await f.admit("Discard nested work");
        throw new Error("nested");
      }),
    ).rejects.toThrow("nested");
    return first;
  });
  expect((await f.store.list("message")).map((row) => row.text)).toEqual(["Retain outer work"]);
  expect(
    await f.store.command<typeof result>(id, {}, () => {
      throw new Error("replayed");
    }),
  ).toEqual(result);
  expect(
    (await f.store.events(before)).filter((row) => row.entity_kind === "message"),
  ).toHaveLength(1);
});

test("concurrent duplicate commands and lost acknowledgements retain one admission", async () => {
  f = await fixture();
  const id = crypto.randomUUID();
  const results = await Promise.all(
    Array.from({ length: 8 }, () =>
      f.store.command(id, { operation: "admit" }, () => f.admit("Once")),
    ),
  );
  expect(new Set(results.map((row) => row.run.id)).size).toBe(1);
  await f.restart();
  expect(
    await f.store.command<(typeof results)[0]>(id, { operation: "admit" }, () => {
      throw new Error("duplicate");
    }),
  ).toEqual(results[0]);
  expect(await f.store.list("run")).toHaveLength(1);
});

test("commit-ordered clocks prevent a blocked lower cursor from disappearing behind replay", async () => {
  f = await fixture();
  const before = await f.store.cursor;
  const entered = Promise.withResolvers<void>();
  const release = Promise.withResolvers<void>();
  const first = f.store.transaction(async () => {
    await f.admit("First commit");
    entered.resolve();
    await release.promise;
  });
  await entered.promise;
  let secondCommitted = false;
  const second = f.store
    .transaction(async () => {
      await f.admit("Second commit");
    })
    .then(() => {
      secondCommitted = true;
    });
  await Bun.sleep(20);
  expect(secondCommitted).toBe(false);
  expect(await f.store.events(before)).toEqual([]);
  release.resolve();
  await first;
  const page = await f.store.events(before, 1);
  await second;
  const rest = await f.store.events(page[0].cursor, 1000);
  const events = [...page, ...rest];
  expect(events.map((row) => row.cursor)).toEqual(
    events.map((row) => row.cursor).toSorted((a, b) => a - b),
  );
  expect(
    events
      .filter((row) => row.entity_kind === "message")
      .map((row) => (row.data as { text: string }).text),
  ).toEqual(["First commit", "Second commit"]);
  const snapshot = await f.store.transaction(async () => ({
    cursor: await f.store.cursor,
    events: await f.store.events(before, 1000),
    runs: await f.store.list("run"),
  }));
  expect(snapshot.events.at(-1)?.cursor).toBe(snapshot.cursor);
  expect(snapshot.runs).toHaveLength(2);
});

test("authority session loss fences an in-flight publication and a pooled reconnect never owns its lock", async () => {
  f = await fixture();
  const before = await f.store.cursor;
  const entered = Promise.withResolvers<void>();
  const release = Promise.withResolvers<void>();
  const pending = f.store.transaction(async () => {
    await f.admit("Must roll back");
    entered.resolve();
    await release.promise;
  });
  const rejected = pending.catch((error) => error);
  await entered.promise;
  await f.store.query("SELECT pg_terminate_backend($1)", [f.store.authorityPid]);
  release.resolve();
  expect((await rejected)?.message).toBe("STALE_DISPATCH");
  expect(await f.store.cursor).toBe(before);
  expect(f.store.signal.aborted).toBe(true);
  await expect(f.admit("Must remain fenced")).rejects.toThrow("STALE_DISPATCH");
  const epoch = f.store.epoch;
  await f.restart();
  expect(f.store.epoch).toBeGreaterThan(epoch);
  expect(await f.store.list("run")).toEqual([]);
});

test("receipt replay reauthorizes, and interrupted external reservations retain unknown identity", async () => {
  f = await fixture();
  const id = crypto.randomUUID();
  let allowed = true;
  const authorize = () => {
    if (!allowed) throw new Error("revoked");
  };
  await f.store.command(id, {}, () => ({ ok: true }), authorize);
  allowed = false;
  await expect(f.store.command(id, {}, () => ({ ok: false }), authorize)).rejects.toThrow(
    "revoked",
  );
  await expect(f.store.receipt(id, null, authorize)).rejects.toThrow("revoked");
  const external = crypto.randomUUID();
  let effects = 0;
  await expect(
    f.store.asyncCommand(
      external,
      {},
      async () => {
        effects++;
        throw new Error("lost acknowledgement");
      },
      () => ({ ok: true }),
    ),
  ).rejects.toThrow("lost acknowledgement");
  await f.restart();
  await expect(
    f.store.asyncCommand(
      external,
      {},
      async () => {
        effects++;
        return true;
      },
      () => ({ ok: true }),
    ),
  ).rejects.toThrow("RECONCILIATION_REQUIRED");
  expect(effects).toBe(1);
});

test("bounded indexed reads retain keyset order across pages", async () => {
  f = await fixture();
  for (let i = 0; i < 4; i++) await f.admit(`Page ${i}`);
  const first = await f.store.page("message", { thread_id: f.thread.id, limit: 2 });
  const next = await f.store.page("message", {
    thread_id: f.thread.id,
    limit: 2,
    after: first.next_after as number,
  });
  expect([...first.items, ...next.items].map((row) => row.text)).toEqual([
    "Page 0",
    "Page 1",
    "Page 2",
    "Page 3",
  ]);
  expect(next.next_after).toBeNull();
});

test("offline import reconciles IDs, events, receipts and native bindings and rehearses verified rollback", async () => {
  f = await fixture();
  await f.bind();
  await f.store.command(crypto.randomUUID(), {}, () => f.admit("Legacy history"));
  const workspace = await new Workspaces(f.lifecycle).ensure(f.thread.id, f.agent.id);
  const artifact = await new Artifacts(f.lifecycle).upload(workspace.id, crypto.randomUUID(), {
    name: "legacy.txt",
    media_type: "text/plain",
    content_base64: Buffer.from("Retained immutable bytes").toString("base64"),
  });
  const source = join(f.dir, "legacy.sqlite");
  await exportLegacyFixture(f.store, source);
  const privateDir = join(f.dir, "credentials");
  mkdirSync(privateDir);
  writeFileSync(join(privateDir, "fixture-key"), "disposable-private-state", { mode: 0o600 });
  const backup = `${f.dir}-backup`,
    restored = `${f.dir}-restored`,
    targetOptions = { ...f.options, schema: `import_${crypto.randomUUID().replaceAll("-", "")}` };
  try {
    const snapshot = inspectSQLite(source);
    const dry = await importSQLite(source, join(f.dir, "target.postgres"), targetOptions);
    expect(dry.applied).toBe(false);
    expect(dry.artifacts[0].sha256).toBe(artifact.sha256);
    expect(dry.mapping.multi_user_enabled).toBe(false);
    const manifest = backupSQLite(source, f.dir, backup, true);
    expect(verifyBackup(backup)).toEqual(manifest);
    const applied = await importSQLite(source, join(f.dir, "target.postgres"), targetOptions, true);
    expect(applied.applied).toBe(true);
    expect("comparison" in applied && applied.comparison.equal).toBe(true);
    const target = await Store.open(join(f.dir, "target.postgres"), f.owner, targetOptions);
    try {
      expect((await reconcileImport(target, snapshot)).equal).toBe(true);
      expect((await target.list("binding"))[0].id).toBe(String(snapshot.native_bindings[0].id));
    } finally {
      await target.close();
    }
    restoreSQLiteBackup(backup, restored);
    expect(inspectSQLite(join(restored, "legacy.sqlite")).source_sha256).toBe(
      snapshot.source_sha256,
    );
    expect(readFileSync(join(restored, "credentials", "fixture-key"), "utf8")).toBe(
      "disposable-private-state",
    );
    const digest = (value: Uint8Array) => createHash("sha256").update(value).digest("hex");
    expect(digest(readFileSync(source))).toBe(
      digest(readFileSync(join(restored, "legacy.sqlite"))),
    );
    expect(
      createHash("sha256")
        .update(readFileSync(join(restored, "artifact-bytes", artifact.storage_key)))
        .digest("hex"),
    ).toBe(artifact.sha256);
    writeFileSync(join(f.dir, "artifact-bytes", artifact.storage_key), "corrupted");
    await expect(
      importSQLite(source, join(f.dir, "target.postgres"), targetOptions),
    ).rejects.toThrow("hash mismatch");
    writeFileSync(join(backup, "legacy.sqlite"), "corrupted");
    expect(() => verifyBackup(backup)).toThrow("hash verification");
  } finally {
    const client = new Client({ connectionString: targetOptions.connectionString });
    await client.connect();
    try {
      await client.query(`DROP SCHEMA IF EXISTS "${targetOptions.schema}" CASCADE`);
    } finally {
      await client.end();
    }
    rmSync(backup, { recursive: true, force: true });
    rmSync(restored, { recursive: true, force: true });
  }
});

test("filtered replay advances through hidden events and retains a consistent high watermark", async () => {
  f = await fixture();
  const before = await f.store.cursor;
  await f.admit("Visible first");
  const hidden = await f.lifecycle.create("thread", {
    type: "group",
    member_agent_ids: [f.agent.id],
  });
  await f.admit("Visible second");
  const high = await f.store.cursor;
  let cursor = before;
  const collected = [];
  while (cursor < high) {
    const page = await f.store.replay(cursor, { thread_id: f.thread.id, limit: 1 });
    expect(page.next_cursor).toBeGreaterThan(cursor);
    collected.push(...page.events);
    cursor = page.next_cursor;
  }
  expect(cursor).toBe(high);
  expect(collected.some((event) => event.entity_id === hidden.id)).toBe(false);
  expect(
    collected
      .filter((event) => event.entity_kind === "message")
      .map((event) => (event.data as { text: string }).text),
  ).toEqual(["Visible first", "Visible second"]);
  await expect(f.store.replay(before, { thread_id: crypto.randomUUID() })).rejects.toThrow(
    "NOT_FOUND",
  );
});

test("a killed authority releases its session and restart preserves unknown native work without dispatching it twice", async () => {
  f = await fixture();
  await f.bind();
  const admitted = await f.admit("Survive process death");
  await f.store.close();
  const child = Bun.spawn([process.execPath, join(import.meta.dir, "authority-child.ts")], {
    env: {
      PATH: process.env.PATH ?? "",
      NGERTIIN_TEST_DATABASE_URL: f.options.connectionString as string,
      PROBE_STATE: f.store.path,
      PROBE_OWNER: f.owner,
      PROBE_SCHEMA: f.options.schema,
      PROBE_THREAD: f.thread.id,
      PROBE_AGENT: f.agent.id,
    },
    stdout: "pipe",
    stderr: "pipe",
  });
  try {
    const reader = child.stdout.getReader();
    const ready = await reader.read();
    reader.releaseLock();
    expect(new TextDecoder().decode(ready.value)).toBe("ready\n");
    child.kill("SIGKILL");
    await child.exited;
    await f.restart();
    expect(await f.store.get("run", admitted.run.id)).toMatchObject({
      status: "unknown",
      native_run_id: "crash-native",
    });
    await f.admit("Remain queued behind unknown work");
    expect(await f.lifecycle.claimNext(f.thread.id, f.agent.id)).toBeNull();
    expect(
      (await f.store.list("run")).filter((run) => run.native_run_id === "crash-native"),
    ).toHaveLength(1);
  } finally {
    if (child.exitCode === null) {
      child.kill("SIGKILL");
      await child.exited;
    }
  }
});

test("loss of the authority session aborts active native work and leaves recovery unknown", async () => {
  f = await fixture();
  await f.bind();
  const admitted = await f.admit("Authority-bound execution");
  const entered = Promise.withResolvers<void>(),
    aborted = Promise.withResolvers<void>();
  let stops = 0;
  const background = new Background(f.lifecycle, {
    codex: {
      async execute(_run, context) {
        context.signal.addEventListener(
          "abort",
          () => {
            stops++;
            aborted.resolve();
          },
          { once: true },
        );
        await context.started("authority-loss-native");
        entered.resolve();
        await aborted.promise;
        return "cancelled";
      },
    },
  });
  try {
    const api = await createApi(f.lifecycle, background, "authority-test-".repeat(4));
    await background.tick();
    await entered.promise;
    await f.store.query("SELECT pg_terminate_backend($1)", [f.store.authorityPid]);
    await aborted.promise;
    expect(
      (
        await api.handle(
          new Request("http://localhost/health/ready", {
            headers: { Authorization: `Bearer ${"authority-test-".repeat(4)}` },
          }),
        )
      ).status,
    ).toBe(503);
    await background.idle();
    expect(stops).toBe(1);
    await background.stop();
    await f.restart();
    expect((await f.store.get("run", admitted.run.id)).status).toBe("unknown");
  } finally {
    await background.stop();
  }
});

test("a changed applied migration refuses startup without changing domain history or retaining its authority lock", async () => {
  f = await fixture();
  const before = await f.store.cursor;
  const checksum = String(
    (await f.store.query("SELECT sha256 FROM schema_migrations WHERE version=1")).rows[0].sha256,
  );
  await f.store.query("UPDATE schema_migrations SET sha256='modified'");
  await f.store.close();
  await expect(Store.open(f.store.path, f.owner, f.options)).rejects.toThrow(
    "modified database migration",
  );
  const client = new Client({ connectionString: f.options.connectionString });
  await client.connect();
  try {
    await client.query(`UPDATE "${f.options.schema}".schema_migrations SET sha256=$1`, [checksum]);
  } finally {
    await client.end();
  }
  await f.restart();
  expect(await f.store.cursor).toBe(before);
});
