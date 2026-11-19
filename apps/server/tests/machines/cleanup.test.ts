import { afterEach, expect, test } from "bun:test";
import { Background } from "../../src/background";
import type { Entity } from "../../src/contracts";
import { Groups } from "../../src/groups/service";
import { Connections } from "../../src/harness/connections";
import { runLearningContext } from "../../src/harness/instructions";
import { ProductTools } from "../../src/harness/tools";
import type { MachineConfiguration } from "../../src/machines/config";
import { CuaMachine, type DriverResult } from "../../src/machines/cua";
import { Machines } from "../../src/machines/service";
import { asyncMap } from "../../src/persistence/async-collections";
import { Workspaces } from "../../src/workspaces/service";
import { fixture } from "../helpers";
import { fixtureApi as createApi } from "../http-fixture";

let f: Awaited<ReturnType<typeof fixture>>;
let machines: Machines;
afterEach(async () => {
  await machines?.close();
  await f?.close();
});
const configuration = (): MachineConfiguration => ({
  id: crypto.randomUUID(),
  endpoint: "http://127.0.0.1:3211",
  token: "private-fixture-token-".repeat(3),
  root: "/home/cua/workspace",
  generation: 1,
  project: "ngertiin-machine-abcd",
});
const window = (id: string) => ({
  ref: { id, epoch: "1" },
  app: { pid: 120, name: "Chromium" },
  kind: "WINDOW_KIND_STANDARD",
});
class Host extends CuaMachine {
  windows = [window("user-window")];
  calls: { method: string; input: unknown }[] = [];
  deferWindow = false;
  pendingWindow?: ReturnType<typeof window>;
  block = false;
  loseClose = false;
  closeEffect: (() => Promise<void>) | undefined;
  override async rpc(method: string, input: unknown = {}): Promise<unknown> {
    this.calls.push({ method, input });
    if (method === "WindowsService/ListWindows") {
      const windows = [...this.windows];
      if (this.pendingWindow) {
        this.windows.push(this.pendingWindow);
        this.pendingWindow = undefined;
      }
      return { windows };
    }
    if (method === "WindowsService/LaunchApp") {
      const created = window(crypto.randomUUID());
      if ((input as { app: { executable: string } }).app.executable.includes("terminal"))
        created.app.name = "Xfce4-terminal";
      if (this.deferWindow) this.pendingWindow = created;
      else this.windows.push(created);
      return { windows: [] }; // Retained browser opens the window on its existing PID.
    }
    if (method === "WindowsService/CloseWindow") {
      await this.closeEffect?.();
      const request = input as { window: { id: string }; force: boolean };
      expect(request.force).toBe(false);
      if (!this.block)
        this.windows = this.windows.filter((item) => item.ref.id !== request.window.id);
      if (this.loseClose) throw new Error("Acknowledgement lost after close.");
      return { closed: !this.block };
    }
    return {
      version: "fixture",
      features: ["driver", "pty", "process.exec_ledger"].map((name) => ({ name, supported: true })),
    };
  }
  override async tools() {
    return {
      contractVersion: "fixture",
      tools: ["get_desktop_state", "click"].map((name) => ({
        name,
        description: name,
        readOnly: name === "get_desktop_state",
        destructive: false,
        inputSchemaJson: JSON.stringify({
          type: "object",
          properties: { session: { type: "string" }, x: { type: "number" }, y: { type: "number" } },
        }),
      })),
    };
  }
  override async call(): Promise<DriverResult> {
    return { content: [], isError: false };
  }
}
async function setup(group = false) {
  f = await fixture();
  const host = new Host(configuration());
  machines = await Machines.open(f.lifecycle, host.configuration, host);
  const connection = await f.store.get(
    "connection",
    (await f.store.get("agent", f.agent.id)).connection_id,
  );
  await new Connections(f.lifecycle).update(connection, {
    capabilities: { ...connection.capabilities, product_tools: "supported" },
  });
  const peer = await f.lifecycle.createAgent({
    name: "Reviewer",
    harness: "codex",
    connection_id: connection.id,
  });
  const thread = group
    ? await f.lifecycle.create("thread", { type: "group", member_agent_ids: [f.agent.id, peer.id] })
    : f.thread;
  const tools = await ProductTools.open(f.lifecycle);
  const start = async (agentId = f.agent.id) => {
    await f.lifecycle.bind(thread.id, agentId, crypto.randomUUID());
    const claimed = await f.lifecycle.claimNext(thread.id, agentId);
    if (!claimed?.dispatch_token) throw new Error("The fixture run cannot start.");
    await f.lifecycle.started(claimed.id, claimed.dispatch_token, crypto.randomUUID());
    const run = await f.store.get("run", claimed.id);
    const lease = await tools.issue(run);
    return {
      run,
      lease,
      call: async (input: unknown) =>
        tools.call(lease.token, lease.scope, "ngertiin.machine_window", input),
    };
  };
  if (group)
    await new Groups(f.lifecycle).send(thread.id, {
      agent_id: f.agent.id,
      text: "Analyze and review.",
    });
  else
    await f.lifecycle.admit({
      thread_id: thread.id,
      agent_id: f.agent.id,
      text: "Research a page.",
    });
  return { host, tools, peer, thread, start, a: await start() };
}
const open = (keep_open = false) => ({
  command_id: crypto.randomUUID(),
  operation: "open_browser",
  url: "https://example.com",
  keep_open,
});
async function finish(
  agent: Awaited<ReturnType<typeof setup>>["a"],
  outcome: "succeeded" | "failed" = "succeeded",
) {
  await f.lifecycle.appendAnswer(agent.run.id, "The requested work is ready.");
  await f.lifecycle.settle(agent.run.id, agent.run.dispatch_token as string, outcome);
  agent.lease.revoke();
  await machines.releaseRun(agent.run.id);
  await machines.desktop.idle();
}

test("successful task closes only its explicit temporary window, retaining the browser profile and user window", async () => {
  const s = await setup();
  s.host.deferWindow = true;
  const request = open();
  const item = (await s.a.call(request)) as Entity<"machine_window">;
  expect(await s.a.call(request)).toEqual(item);
  expect(s.host.windows).toHaveLength(2);
  expect(s.host.calls.filter((call) => call.method === "WindowsService/LaunchApp")).toHaveLength(1);
  await machines.desktop.idle();
  expect(s.host.windows).toHaveLength(2);
  await finish(s.a);
  expect(s.host.windows.map((item) => item.ref.id)).toEqual(["user-window"]);
  expect((await f.store.get("machine_window", item.id)).state).toBe("closed");
  expect(s.host.calls.filter((call) => call.method === "WindowsService/CloseWindow")).toHaveLength(
    1,
  );
  await machines.desktop.idle();
  expect(s.host.calls.filter((call) => call.method === "WindowsService/CloseWindow")).toHaveLength(
    1,
  );
});

test("whole handoff chain owns the window until the peer delivers its result", async () => {
  const s = await setup(true);
  const item = (await s.a.call(open())) as Entity<"machine_window">;
  const groups = new Groups(f.lifecycle);
  await groups.handoff(s.a.run.id, {
    agent_id: s.peer.id,
    instruction: "Review the same workspace.",
    purpose: "review",
    continuation: "complete",
  });
  await finish(s.a);
  await groups.advance();
  await machines.desktop.idle();
  expect((await f.store.get("machine_window", item.id)).state).toBe("open");
  const peer = await s.start(s.peer.id);
  const listed = (await peer.call({ operation: "list" })) as {
    windows: Entity<"machine_window">[];
  };
  expect(listed.windows.map((item) => item.id)).toEqual([item.id]);
  await finish(peer);
  await groups.advance();
  await groups.advance();
  await machines.desktop.idle();
  expect((await f.store.get("peer_task", s.a.run.task_id as string)).state).toBe("completed");
  expect((await f.store.get("machine_window", item.id)).state).toBe("closed");
});

test("result previews and explicit retention remain available", async () => {
  const s = await setup();
  const preview = (await s.a.call(open(true))) as Entity<"machine_window">;
  const retained = (await s.a.call(open())) as Entity<"machine_window">;
  await s.a.call({
    command_id: crypto.randomUUID(),
    operation: "retain",
    resource_id: retained.id,
  });
  await finish(s.a);
  expect(
    await asyncMap(
      [preview.id, retained.id],
      async (id) => (await f.store.get("machine_window", id)).state,
    ),
  ).toEqual(["open", "open"]);
  expect(s.host.windows).toHaveLength(3);
});

test("a failed task does not dispose of its debugging context", async () => {
  const s = await setup();
  const item = (await s.a.call(open())) as Entity<"machine_window">;
  await finish(s.a, "failed");
  expect((await f.store.get("machine_window", item.id)).state).toBe("open");
});

test("human takeover preserves potentially edited task windows and never races cleanup", async () => {
  const s = await setup();
  const item = (await s.a.call(open())) as Entity<"machine_window">;
  await machines.control(
    {
      command_id: crypto.randomUUID(),
      operation: "acquire",
      expected_revision: (await machines.snapshot()).lease.revision,
    },
    null,
  );
  await finish(s.a);
  expect((await machines.snapshot()).lease.holder).toBe("human");
  expect(await f.store.get("machine_window", item.id)).toMatchObject({
    state: "open",
    keep_open: true,
  });
  await machines.control(
    {
      command_id: crypto.randomUUID(),
      operation: "release",
      expected_revision: (await machines.snapshot()).lease.revision,
    },
    null,
  );
  await machines.desktop.idle();
  expect(s.host.windows).toHaveLength(2);
});

test("save prompts block graceful cleanup without force-close or retries", async () => {
  const s = await setup();
  const item = (await s.a.call(open())) as Entity<"machine_window">;
  s.host.block = true;
  await finish(s.a);
  expect((await f.store.get("machine_window", item.id)).state).toBe("blocked");
  await machines.desktop.idle();
  expect(s.host.calls.filter((call) => call.method === "WindowsService/CloseWindow")).toHaveLength(
    1,
  );
});

test("lost close acknowledgement survives restart without repeating the effect", async () => {
  const s = await setup();
  const item = (await s.a.call(open())) as Entity<"machine_window">;
  s.host.loseClose = true;
  await finish(s.a);
  expect((await f.store.get("machine_window", item.id)).state).toBe("unknown");
  await machines.close();
  await f.restart();
  machines = await Machines.open(f.lifecycle, s.host.configuration, s.host);
  await machines.recover();
  await machines.desktop.idle();
  expect(s.host.calls.filter((call) => call.method === "WindowsService/CloseWindow")).toHaveLength(
    1,
  );
});

test("owner API exports managed window state and its versioned schema", async () => {
  const s = await setup();
  await s.a.call(open());
  const token = "private-owner-token-".repeat(3);
  const api = await createApi(f.lifecycle, new Background(f.lifecycle), token, {
    connections: new Connections(f.lifecycle),
    tools: s.tools,
  });
  const response = await api.handle(
    new Request("http://localhost/v1/machine/windows", {
      headers: { Authorization: `Bearer ${token}` },
    }),
  );
  expect(response.status).toBe(200);
  expect((await response.json()).windows).toHaveLength(1);
});

test("a task-owned terminal stays open until its attributed process exits", async () => {
  const s = await setup();
  const item = (await s.a.call({
    command_id: crypto.randomUUID(),
    operation: "open_terminal",
  })) as Entity<"machine_window">;
  const process: Entity<"machine_process"> = await f.store.put({
    ...machines.operations.base(),
    kind: "machine_process",
    machine_id: f.owner,
    generation: 1,
    agent_id: f.agent.id,
    thread_id: f.thread.id,
    run_id: s.a.run.id,
    tag: "fixture",
    state: "running",
    pid: 123,
    stdout: "",
    stderr: "",
    output_truncated: false,
    output_offset: "0",
    exit_code: null,
    exit_signal: null,
    lost: false,
  });
  await finish(s.a);
  expect((await f.store.get("machine_window", item.id)).state).toBe("open");
  await machines.operations.update(process, { state: "exited", exit_code: 0 });
  await machines.desktop.idle();
  expect((await f.store.get("machine_window", item.id)).state).toBe("closed");
});

test("deferred successful cleanup resumes after restart without reopening a window", async () => {
  const s = await setup();
  const item = (await s.a.call(open())) as Entity<"machine_window">;
  await machines.operations.update(await machines.snapshot(), { state: "offline" });
  await finish(s.a);
  expect((await f.store.get("machine_window", item.id)).state).toBe("open");
  await machines.close();
  await f.restart();
  machines = await Machines.open(f.lifecycle, s.host.configuration, s.host);
  await machines.recover();
  await machines.desktop.idle();
  expect((await f.store.get("machine_window", item.id)).state).toBe("closed");
  expect(s.host.calls.filter((call) => call.method === "WindowsService/LaunchApp")).toHaveLength(1);
});

test("human takeover waits for an in-flight cleanup before granting interactive input", async () => {
  const s = await setup();
  await s.a.call(open());
  const entered = Promise.withResolvers<void>();
  const done = Promise.withResolvers<void>();
  s.host.closeEffect = async () => {
    entered.resolve();
    await done.promise;
  };
  const finishing = finish(s.a);
  await entered.promise;
  const takeover = machines.control(
    {
      command_id: crypto.randomUUID(),
      operation: "acquire",
      expected_revision: (await machines.snapshot()).lease.revision,
    },
    null,
  );
  await Bun.sleep(5);
  expect((await machines.snapshot()).lease.holder).toBe("none");
  done.resolve();
  await finishing;
  await takeover;
  expect((await machines.snapshot()).lease.holder).toBe("human");
});

test("another request cannot retain this task's windows or prevent its independent cleanup", async () => {
  const s = await setup();
  const item = (await s.a.call(open())) as Entity<"machine_window">;
  const next = await f.lifecycle.admit({
    thread_id: f.thread.id,
    agent_id: f.agent.id,
    text: "A separate request.",
  });
  await expect(
    (async () =>
      machines.desktop.retain(item.id, {
        agent_id: f.agent.id,
        thread_id: f.thread.id,
        run_id: next.run.id,
      }))(),
  ).rejects.toThrow("SCOPE_DENIED");
  await finish(s.a);
  expect((await f.store.get("machine_window", item.id)).state).toBe("closed");
  expect((await f.store.get("run", next.run.id)).status).toBe("queued");
});

test("window commands reject missing mutation identities and unsupported URL schemes", async () => {
  const s = await setup();
  await expect(
    s.a.call({ operation: "open_browser", url: "https://example.com" }),
  ).rejects.toThrow();
  await expect(s.a.call({ ...open(), url: "javascript:alert(1)" })).rejects.toThrow();
  await expect(
    s.a.call({ command_id: crypto.randomUUID(), operation: "retain" }),
  ).rejects.toThrow();
  expect(await machines.desktop.list()).toHaveLength(0);
});

test("existing native sessions receive current cleanup policy in every turn context", async () => {
  const s = await setup();
  const workspace = await new Workspaces(f.lifecycle).ensure(f.thread.id, f.agent.id);
  const context = await runLearningContext(f.lifecycle, { ...s.a.run, workspace_id: workspace.id });
  expect(context).toContain("ngertiin.machine_window");
  expect(context).toContain("entire task/handoff succeeds");
});

test("observations made during cleanup cannot authorize a subsequent agent click", async () => {
  const s = await setup();
  await s.a.call(open());
  const thread = await f.lifecycle.create("thread", { type: "dm", member_agent_ids: [s.peer.id] });
  await f.lifecycle.bind(thread.id, s.peer.id, crypto.randomUUID());
  await f.lifecycle.admit({ thread_id: thread.id, agent_id: s.peer.id, text: "Independent work." });
  const claimed = await f.lifecycle.claimNext(thread.id, s.peer.id);
  if (!claimed?.dispatch_token) throw new Error("The peer run cannot start.");
  await f.lifecycle.started(claimed.id, claimed.dispatch_token, crypto.randomUUID());
  const peer = await s.tools.issue(await f.store.get("run", claimed.id));
  const call = async (name: string) =>
    s.tools.call(peer.token, peer.scope, "ngertiin.computer_call", {
      command_id: crypto.randomUUID(),
      name,
      arguments: name === "click" ? { x: 10, y: 20 } : {},
    });
  const entered = Promise.withResolvers<void>();
  const done = Promise.withResolvers<void>();
  s.host.closeEffect = async () => {
    entered.resolve();
    await done.promise;
  };
  const finishing = finish(s.a);
  await entered.promise;
  await call("get_desktop_state");
  done.resolve();
  await finishing;
  await expect(call("click")).rejects.toThrow("RECONCILIATION_REQUIRED");
  await call("get_desktop_state");
  await expect(call("click")).resolves.toBeDefined();
});
