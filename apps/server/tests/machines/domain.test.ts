import { afterEach, expect, test } from "bun:test";
import type { Entity } from "../../src/contracts";
import { Connections } from "../../src/harness/connections";
import { ProductTools } from "../../src/harness/tools";
import type { MachineConfiguration } from "../../src/machines/config";
import { CuaMachine, type DriverResult } from "../../src/machines/cua";
import { MachineOperations } from "../../src/machines/operations";
import { Machines } from "../../src/machines/service";
import { Workspaces } from "../../src/workspaces/service";
import { fixture } from "../helpers";

let f: Awaited<ReturnType<typeof fixture>>;
let machines: Machines;
afterEach(async () => {
  await machines?.close();
  await f?.close();
});
const configuration = (): MachineConfiguration => ({
  id: crypto.randomUUID(),
  endpoint: "http://127.0.0.1:3211",
  token: "private-machine-token-".repeat(3),
  root: "/home/cua/workspace",
  generation: 1,
  project: "ngertiin-machine-1234abcd",
});
class Host extends CuaMachine {
  calls: { name: string; args: unknown }[] = [];
  effect: (() => Promise<void>) | undefined;
  override async rpc() {
    return {
      version: "fixture",
      features: ["driver", "pty", "process.exec_ledger"].map((name) => ({ name, supported: true })),
    };
  }
  override async tools() {
    return {
      contractVersion: "fixture",
      tools: ["click", "get_desktop_state"].map((name) => ({
        name,
        description: name,
        inputSchemaJson: JSON.stringify({
          type: "object",
          properties: { x: { type: "number" }, y: { type: "number" }, session: { type: "string" } },
        }),
        readOnly: name !== "click",
        destructive: false,
      })),
    };
  }
  override async call(name: string, args: unknown): Promise<DriverResult> {
    this.calls.push({ name, args });
    if (name === "click") await this.effect?.();
    return {
      content: [{ text: "Fixture response." }],
      structuredJson: JSON.stringify({ status: "ok", capture_id: "fresh-capture" }),
      isError: false,
    };
  }
}
async function setup() {
  f = await fixture();
  const config = configuration();
  const host = new Host(config);
  machines = await Machines.open(f.lifecycle, config, host);
  const connection = await f.store.get(
    "connection",
    (await f.store.get("agent", f.agent.id)).connection_id,
  );
  await new Connections(f.lifecycle).update(connection, {
    capabilities: { ...connection.capabilities, product_tools: "supported" },
  });
  const peer = await f.lifecycle.create("agent", {
    name: "Peer",
    harness: "codex",
    connection_id: connection.id,
  });
  const thread = await f.lifecycle.create("thread", { type: "dm", member_agent_ids: [peer.id] });
  const tools = await ProductTools.open(f.lifecycle);
  const start = async (agentId: string, threadId: string) => {
    await f.lifecycle.bind(threadId, agentId, crypto.randomUUID());
    await f.lifecycle.admit({
      thread_id: threadId,
      agent_id: agentId,
      text: "Use the provided machine.",
    });
    const claimed = (await f.lifecycle.claimNext(threadId, agentId)) as Entity<"run">;
    await f.lifecycle.started(claimed.id, claimed.dispatch_token as string, crypto.randomUUID());
    const run = await f.store.get("run", claimed.id);
    const lease = await tools.issue(run);
    return {
      run,
      lease,
      call: async (name: string, input: unknown) =>
        tools.call(lease.token, lease.scope, name, input),
    };
  };
  return {
    config,
    host,
    tools,
    peer,
    thread,
    a: await start(f.agent.id, f.thread.id),
    b: await start(peer.id, thread.id),
  };
}
const observe = async (agent: Awaited<ReturnType<typeof setup>>["a"]) =>
  await agent.call("ngertiin.computer_call", {
    command_id: crypto.randomUUID(),
    name: "get_desktop_state",
    arguments: {},
  });
const click = () => ({
  command_id: crypto.randomUUID(),
  name: "click",
  arguments: { x: 10, y: 20 },
});

test("DM and group contexts bind one machine while retaining distinct logical workspaces", async () => {
  const s = await setup();
  const workspaces = new Workspaces(f.lifecycle);
  const a = await workspaces.ensure(f.thread.id, f.agent.id);
  const b = await workspaces.ensure(s.thread.id, s.peer.id);
  const group = await f.lifecycle.create("thread", {
    type: "group",
    member_agent_ids: [f.agent.id, s.peer.id],
  });
  const shared = await workspaces.ensure(group.id, f.agent.id);
  expect(a.id).not.toBe(b.id);
  expect(shared.id).not.toBe(a.id);
  expect([a.machine_id, b.machine_id, shared.machine_id]).toEqual([f.owner, f.owner, f.owner]);
  expect([workspaces.path(a), workspaces.path(b), workspaces.path(shared)]).toEqual(
    Array(3).fill("/home/cua/workspace"),
  );
  expect((await workspaces.current(group.id, s.peer.id))?.id).toBe(shared.id);
  expect(workspaces.controlDirectory(a, f.agent.id)).not.toBe(
    workspaces.controlDirectory(b, s.peer.id),
  );
  await expect((async () => workspaces.files(a.id))()).rejects.toThrow("SCOPE_DENIED");
});

test("multi-step input has one owner; human takeover waits for in-flight input and fences agents", async () => {
  const s = await setup();
  const entered = Promise.withResolvers<void>();
  const finish = Promise.withResolvers<void>();
  s.host.effect = async () => {
    entered.resolve();
    await finish.promise;
  };
  await observe(s.a);
  const first = s.a.call("ngertiin.computer_call", click());
  await entered.promise;
  expect((await machines.snapshot()).lease.run_id).toBe(s.a.run.id);
  await expect(s.b.call("ngertiin.computer_call", click())).rejects.toThrow("MACHINE_INPUT_BUSY");
  await s.b.call("ngertiin.computer_call", {
    command_id: crypto.randomUUID(),
    name: "get_desktop_state",
    arguments: {},
  });
  const handoff = machines.control(
    {
      command_id: crypto.randomUUID(),
      operation: "acquire",
      expected_revision: (await machines.snapshot()).lease.revision,
    },
    null,
  );
  await Bun.sleep(5);
  expect((await machines.snapshot()).lease.holder).toBe("agent");
  finish.resolve();
  await first;
  await handoff;
  expect((await machines.snapshot()).lease.holder).toBe("human");
  await expect(s.a.call("ngertiin.computer_call", click())).rejects.toThrow("MACHINE_INPUT_BUSY");
  await machines.control(
    {
      command_id: crypto.randomUUID(),
      operation: "release",
      expected_revision: (await machines.snapshot()).lease.revision,
    },
    null,
  );
  await expect(s.b.call("ngertiin.computer_call", click())).rejects.toThrow(
    "RECONCILIATION_REQUIRED",
  );
  await observe(s.b);
  await s.b.call("ngertiin.computer_call", click());
  expect(s.host.calls.filter((item) => item.name === "click")).toHaveLength(2);
  const sessions = s.host.calls
    .filter((item) => item.name === "click")
    .map((item) => (item.args as { session: string }).session);
  expect(sessions).toEqual([`ngertiin-${s.a.run.id}`, `ngertiin-${s.b.run.id}`]);
});

test("unknown input survives restart, cannot replay, and can be reconciled by a fresh observation", async () => {
  const s = await setup();
  s.host.effect = async () => {
    throw new Error("Transport disconnected after input.");
  };
  const input = click();
  await observe(s.a);
  await expect(s.a.call("ngertiin.computer_call", input)).rejects.toThrow("MACHINE_UNKNOWN");
  expect((await machines.snapshot()).lease.state).toBe("unknown");
  expect((await f.store.get("machine_operation", input.command_id)).state).toBe("unknown");
  await machines.close();
  await f.restart();
  const host = new Host(s.config);
  machines = await Machines.open(f.lifecycle, s.config, host);
  const actor = { agent_id: s.a.run.agent_id, thread_id: s.a.run.thread_id, run_id: s.a.run.id };
  await expect(
    machines.operations.execute(
      input.command_id,
      1,
      actor,
      "click",
      input.arguments,
      () => {},
      async () => {
        throw new Error("Must not dispatch");
      },
    ),
  ).rejects.toThrow("RECONCILIATION_REQUIRED");
  await machines.control(
    {
      command_id: crypto.randomUUID(),
      operation: "reconcile",
      expected_revision: (await machines.snapshot()).lease.revision,
    },
    null,
  );
  expect((await machines.snapshot()).lease.holder).toBe("none");
  expect((await f.store.get("machine_operation", input.command_id)).state).toBe("unknown");
  expect(host.calls.map((item) => item.name)).toEqual(["get_desktop_state"]);
});

test("server-owned session identity and current grants cannot be supplied or bypassed by tool arguments", async () => {
  const s = await setup();
  await expect(
    s.a.call("ngertiin.computer_call", { ...click(), arguments: { session: "another-run" } }),
  ).rejects.toThrow("INVALID_REQUEST");
  await expect(
    s.a.call("ngertiin.computer_call", { ...click(), arguments: { _session_id: "another-run" } }),
  ).rejects.toThrow("INVALID_REQUEST");
  expect(s.host.calls).toHaveLength(0);
  const connection = await f.store.get(
    "connection",
    (await f.store.get("agent", f.agent.id)).connection_id,
  );
  await new Connections(f.lifecycle).update(connection, {
    capabilities: { ...connection.capabilities, product_tools: "unsupported" },
  });
  await expect(s.a.call("ngertiin.computer_call", click())).rejects.toThrow();
  expect(s.host.calls).toHaveLength(0);
  expect(JSON.stringify(await f.store.events(0, 1000))).not.toContain(s.config.token);
});

test("simultaneous native command retries share admission and retain one dispatched effect", async () => {
  f = await fixture();
  const operations = await MachineOperations.open(f.lifecycle, f.owner);
  const id = crypto.randomUUID();
  const entered = Promise.withResolvers<void>();
  const finish = Promise.withResolvers<void>();
  let effects = 0;
  const invoke = (value = "same") =>
    operations.execute(
      id,
      1,
      null,
      "fixture.effect",
      { value },
      () => {},
      async () => {
        effects++;
        entered.resolve();
        await finish.promise;
        return { acknowledged: true };
      },
    );
  const first = invoke();
  const second = invoke();
  try {
    await entered.promise;
    await expect(invoke("changed")).rejects.toThrow("IDEMPOTENCY_CONFLICT");
  } finally {
    finish.resolve();
  }
  expect(await first).toEqual({ acknowledged: true });
  expect(await second).toEqual({ acknowledged: true });
  expect(effects).toBe(1);
  expect(await invoke()).toEqual({ acknowledged: true });
  expect(effects).toBe(1);
  expect(await f.store.list("machine_operation")).toHaveLength(1);
});

test("async file commands commit independently while I/O waits and coalesce exact concurrent retries", async () => {
  f = await fixture();
  const entered = Promise.withResolvers<void>();
  const finish = Promise.withResolvers<void>();
  const id = crypto.randomUUID();
  let effects = 0;
  const prepare = async () => {
    effects++;
    entered.resolve();
    await finish.promise;
    return "verified-bytes";
  };
  const first = f.store.asyncCommand(id, { file: "a" }, prepare, (value) => ({ value }));
  await entered.promise;
  const second = f.store.asyncCommand(id, { file: "a" }, prepare, (value) => ({ value }));
  const independent = crypto.randomUUID();
  await f.store.command(independent, {}, () => ({ independent: true }));
  const observer = f.store;
  expect(
    (await observer.query("SELECT receipt FROM commands WHERE id=$1", [independent])).rows[0],
  ).toEqual({
    receipt: { independent: true },
  });

  await expect(
    f.store.asyncCommand(id, { file: "changed" }, prepare, (value) => ({ value })),
  ).rejects.toThrow("IDEMPOTENCY_CONFLICT");
  finish.resolve();
  expect(await first).toEqual({ value: "verified-bytes" });
  expect(await second).toEqual({ value: "verified-bytes" });
  expect(effects).toBe(1);
});

test("interrupted file projection retains its reservation across restart and rechecks scope before commit", async () => {
  f = await fixture();
  const id = crypto.randomUUID();
  let committed = false;
  await expect(
    f.store.fileCommand(
      id,
      { file: "input" },
      async () => {
        throw new Error("Interrupted after file transfer");
      },
      () => {
        committed = true;
        return {};
      },
    ),
  ).rejects.toThrow("Interrupted");
  expect(committed).toBe(false);
  expect(await f.store.receipt(id)).toBeNull();
  await f.restart();
  await expect(
    f.store.fileCommand(
      id,
      { file: "different" },
      async () => "bad",
      () => ({}),
    ),
  ).rejects.toThrow("IDEMPOTENCY_CONFLICT");
  let checks = 0;
  await expect(
    f.store.fileCommand(
      id,
      { file: "input" },
      async () => "verified",
      () => {
        committed = true;
        return {};
      },
      () => {
        if (++checks === 2) throw new Error("Scope revoked");
      },
    ),
  ).rejects.toThrow("Scope revoked");
  expect(committed).toBe(false);
  expect(
    await f.store.fileCommand(
      id,
      { file: "input" },
      async () => "verified",
      (value) => ({ value }),
    ),
  ).toEqual({ value: "verified" });
});

test("human handback waits for media quiescence and disconnected control expires", async () => {
  const s = await setup();
  await machines.ready();
  await machines.control(
    { command_id: crypto.randomUUID(), operation: "acquire", expected_revision: 0 },
    null,
  );
  const closed = Promise.withResolvers<void>();
  const entered = Promise.withResolvers<void>();
  const unsubscribe = machines.onControl(() => {
    entered.resolve();
    return closed.promise;
  });
  const returning = machines.control(
    {
      command_id: crypto.randomUUID(),
      operation: "release",
      expected_revision: (await machines.snapshot()).lease.revision,
    },
    null,
  );
  await entered.promise;
  await expect(s.a.call("ngertiin.computer_call", click())).rejects.toThrow("MACHINE_INPUT_BUSY");
  closed.resolve();
  await returning;
  unsubscribe();
  await machines.control(
    {
      command_id: crypto.randomUUID(),
      operation: "acquire",
      expected_revision: (await machines.snapshot()).lease.revision,
    },
    null,
  );
  const current = await machines.snapshot();
  await machines.operations.update(current, {
    lease: { ...current.lease, expires_at: new Date(Date.now() - 1).toISOString() },
  });
  await machines.expireControl();
  expect((await machines.snapshot()).lease.holder).toBe("none");
  await observe(s.a);
  await s.a.call("ngertiin.computer_call", click());
  expect((await machines.snapshot()).lease.holder).toBe("agent");
});
