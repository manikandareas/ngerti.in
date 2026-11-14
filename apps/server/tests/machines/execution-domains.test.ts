import { afterEach, expect, test } from "bun:test";
import { rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { Artifacts } from "../../src/artifacts";
import type { SessionLease } from "../../src/auth/service";
import { DomainError } from "../../src/contracts";
import { Connections } from "../../src/harness/connections";
import { ProductTools } from "../../src/harness/tools";
import type { MachineConfiguration } from "../../src/machines/config";
import { CuaMachine, MachineFiles } from "../../src/machines/cua";
import { DomainRuntime, readDomainPolicy } from "../../src/machines/domain-runtime";
import { ExecutionDomains, resolvedMachine } from "../../src/machines/domains";
import { Machines } from "../../src/machines/service";
import { MachineViewGateway } from "../../src/machines/view-gateway";
import type { DataContext } from "../../src/persistence/access-context";
import { Workspaces } from "../../src/workspaces/service";
import { fixture } from "../helpers";

let f: Awaited<ReturnType<typeof fixture>>;
let domains: ExecutionDomains;
let legacy: Machines;
let views: MachineViewGateway;
afterEach(async () => {
  await views?.close();
  await domains?.close();
  await legacy?.close();
  await f?.close();
});
class Files extends MachineFiles {
  get bytes() {
    return (this.machine as Host).bytes;
  }
  override async read(path: string): Promise<Buffer<ArrayBuffer>> {
    this.path(path);
    const value = this.bytes.get(path);
    if (!value) throw new DomainError("NOT_FOUND", 404);
    return Buffer.from(value);
  }
  override async create(path: string, bytes: Uint8Array) {
    await this.write(path, bytes, true);
  }
  override async write(path: string, bytes: Uint8Array, exclusive = false) {
    this.path(path);
    if (exclusive && this.bytes.has(path)) throw new DomainError("CONFLICT");
    this.bytes.set(path, Buffer.from(bytes));
  }
}
class Host extends CuaMachine {
  bytes = new Map<string, Buffer>();
  tickets = 0;
  calls = 0;
  beforeTicket?: () => Promise<void>;
  override files() {
    return new Files(this);
  }
  override async rpc(name: string): Promise<unknown> {
    this.calls++;
    if (name.endsWith("CreateViewerTicket")) {
      await this.beforeTicket?.();
      return { ticket: `fixture-${this.configuration.id}-${++this.tickets}` };
    }
    return {
      version: "fixture",
      features: ["driver", "pty", "process.exec_ledger"].map((name) => ({ name, supported: true })),
    };
  }
  override async tools() {
    return { contractVersion: "fixture", tools: [] };
  }
}
function context(
  userId: string = crypto.randomUUID(),
  organizationId: string = crypto.randomUUID(),
): DataContext {
  return {
    userId,
    organizationId,
    membershipGeneration: 1,
    authorizationGeneration: 1,
    readableAgents: [],
    invocableAgents: [],
    managedAgents: [],
    canManage: false,
    validate: async () => {},
  };
}
function lease(sessionId: string, scope: DataContext) {
  const abort = new AbortController();
  return {
    abort,
    value: {
      sessionId,
      userId: scope.userId,
      organizationId: scope.organizationId,
      signal: abort.signal,
      release: () => {},
      assert: async () => {
        if (abort.signal.aborted) throw new DomainError("UNAUTHORIZED", 401);
      },
    } satisfies SessionLease,
  };
}
async function setup() {
  f = await fixture();
  legacy = await Machines.open(f.lifecycle, null);
  domains = new ExecutionDomains(
    f.lifecycle,
    new DomainRuntime(f.dir, f.owner, null),
    (configuration) => new Host(configuration),
  );
  views = new MachineViewGateway(f.lifecycle);
}
function run<T>(scope: DataContext, action: () => T) {
  return f.store.withDataContext(scope, action);
}
async function workspace(scope: DataContext) {
  return run(scope, async () => {
    const agent = await f.lifecycle.createAgent({
      name: "Private helper",
      harness: "codex",
      connection_id: null,
    });
    const thread = await f.lifecycle.create("thread", { type: "dm", member_agent_ids: [agent.id] });
    return new Workspaces(f.lifecycle).ensure(thread.id, agent.id);
  });
}

test("lazy resolution coalesces concurrent requests and persists one organization/user domain without native I/O", async () => {
  await setup();
  const scope = context();
  const machines = await run(scope, () =>
    Promise.all(Array.from({ length: 5 }, () => domains.resolve())),
  );
  expect(new Set(machines).size).toBe(1);
  const host = machines[0]?.host;
  if (!(host instanceof Host)) throw new Error("The resolved fixture host is missing.");
  expect(host.calls).toBe(0);
  expect(await run(scope, () => f.store.list("execution_domain"))).toHaveLength(1);
  expect((await machines[0]?.snapshot())?.id).not.toBe(f.owner);
  expect(await resolvedMachine(f.lifecycle)).toBe(legacy);
});
test("different humans and organizations receive different files while one human's agents cooperate", async () => {
  await setup();
  const a = context();
  const b = context(crypto.randomUUID(), a.organizationId);
  const c = context(a.userId);
  const wa = await workspace(a);
  const wa2 = await workspace(a);
  const wb = await workspace(b);
  const wc = await workspace(c);
  expect(wa.machine_id).toBe(wa2.machine_id);
  expect(new Set([wa.machine_id, wb.machine_id, wc.machine_id]).size).toBe(3);
  await run(a, async () =>
    (await new Workspaces(f.lifecycle).workingFiles(wa.id)).create(
      "private.txt",
      Buffer.from("A only"),
    ),
  );
  const shared = await run(a, async () =>
    (await new Workspaces(f.lifecycle).workingFiles(wa2.id)).read("private.txt"),
  );
  expect(shared.toString()).toBe("A only");
  await expect(
    run(b, async () => (await new Workspaces(f.lifecycle).workingFiles(wb.id)).read("private.txt")),
  ).rejects.toMatchObject({ code: "NOT_FOUND" });
  await expect(
    run(c, async () => (await new Workspaces(f.lifecycle).workingFiles(wc.id)).read("private.txt")),
  ).rejects.toMatchObject({ code: "NOT_FOUND" });
  await expect(run(b, () => new Workspaces(f.lifecycle).get(wa.id))).rejects.toMatchObject({
    code: "NOT_FOUND",
  });
});
test("PostgreSQL rejects a cross-domain machine reference even through the restricted application role", async () => {
  await setup();
  const a = context();
  const b = context(crypto.randomUUID(), a.organizationId);
  const wa = await workspace(a);
  const wb = await workspace(b);
  await expect(
    run(b, () =>
      f.store.put({ ...wb, machine_id: wa.machine_id, revision: wb.revision + 1 }, wb.revision),
    ),
  ).rejects.toMatchObject({ code: "23503" });
  expect((await run(b, () => f.store.get("workspace", wb.id))).machine_id).toBe(wb.machine_id);
});
test("private uploads materialize into the resolved domain and immutable downloads survive working-copy edits", async () => {
  await setup();
  const a = context();
  const w = await workspace(a);
  await run(a, async () => {
    const artifacts = new Artifacts(f.lifecycle);
    const output = await artifacts.upload(w.id, crypto.randomUUID(), {
      name: "source.txt",
      media_type: "text/plain",
      content_base64: Buffer.from("original").toString("base64"),
    });
    const files = await new Workspaces(f.lifecycle).workingFiles(w.id);
    expect((await files.read(output.source_path as string)).toString()).toBe("original");
    const machine = await domains.resolve();
    await machine.files().write(output.source_path as string, Buffer.from("edited"));
    expect((await artifacts.download(output.id, w.id)).bytes.toString()).toBe("original");
  });
});
test("scoped resolution never returns the singleton when the operator has not enabled domain provisioning", async () => {
  f = await fixture();
  legacy = await Machines.open(f.lifecycle, null);
  domains = new ExecutionDomains(f.lifecycle, new DomainRuntime(f.dir, f.owner, null));
  const machine = await run(context(), () => domains.resolve());
  await expect(machine.ready()).rejects.toMatchObject({ code: "MACHINE_UNAVAILABLE" });
  expect((await machine.snapshot()).id).not.toBe((await legacy.snapshot()).id);
});
test("viewer tickets reject another organization/user and read-only clipboard or filesystem RPCs", async () => {
  await setup();
  const a = context();
  const b = context(crypto.randomUUID(), a.organizationId);
  const c = context(a.userId);
  const session = lease("session-a", a);
  const viewer = await run(a, () =>
    views.issue("http://localhost", false, "http://localhost", session.value),
  );
  await expect(
    run(b, () => views.authorize(new Request(`http://localhost${viewer.viewer_url}`))),
  ).rejects.toMatchObject({ code: "SCOPE_DENIED" });
  await expect(
    run(c, () => views.renew(viewer.viewer_id, "http://localhost", "session-a")),
  ).rejects.toMatchObject({ code: "SCOPE_DENIED" });
  const root = viewer.viewer_url.split("viewer/#")[0];
  for (const path of [
    "cua.env.v1.FilesystemService/ListDir",
    "cua.env.v1.ComputerService/SetClipboard",
    "files/private.txt",
  ])
    await expect(
      views.proxy(new Request(`http://localhost${root}${path}`, { method: "POST" })),
    ).rejects.toMatchObject({ code: "SCOPE_DENIED" });
  session.abort.abort();
  await expect(
    views.authorize(new Request(`http://localhost${viewer.viewer_url}`)),
  ).rejects.toMatchObject({ code: "UNAUTHORIZED" });
});
test("human control is session-bound and stale revisions cannot acquire or reactivate a viewer", async () => {
  await setup();
  const a = context();
  const machine = await run(a, () => domains.resolve());
  await machine.control(
    { command_id: crypto.randomUUID(), operation: "acquire", expected_revision: 0 },
    null,
    () => {},
    "session-a",
  );
  const session = lease("session-a", a);
  const viewer = await run(a, () =>
    views.issue("http://localhost", true, "http://localhost", session.value),
  );
  await expect(
    run(a, () =>
      views.issue("http://localhost", true, "http://localhost", lease("session-b", a).value),
    ),
  ).rejects.toMatchObject({ code: "SCOPE_DENIED" });
  await expect(
    machine.control(
      { command_id: crypto.randomUUID(), operation: "release", expected_revision: 1 },
      null,
      () => {},
      "session-b",
    ),
  ).rejects.toMatchObject({ code: "SCOPE_DENIED" });
  await machine.control(
    { command_id: crypto.randomUUID(), operation: "release", expected_revision: 1 },
    null,
    () => {},
    "session-a",
  );
  await expect(
    views.authorize(new Request(`http://localhost${viewer.viewer_url}`)),
  ).rejects.toMatchObject({ code: "UNAUTHORIZED" });
  await expect(
    machine.control(
      { command_id: crypto.randomUUID(), operation: "acquire", expected_revision: 0 },
      null,
      () => {},
      "session-a",
    ),
  ).rejects.toMatchObject({ code: "CONFLICT" });
});
test("membership or grant changes revoke existing viewers and do not resurrect a racing ticket issuance", async () => {
  await setup();
  const a = context();
  let active = true;
  a.validate = a.validateResources = async () => {
    if (!active) throw new DomainError("SCOPE_DENIED", 403);
  };
  const session = lease("session-a", a);
  const machine = await run(a, () => domains.resolve());
  const host = machine.host as Host;
  const entered = Promise.withResolvers<void>();
  const proceed = Promise.withResolvers<void>();
  host.beforeTicket = async () => {
    entered.resolve();
    await proceed.promise;
  };
  const issuing = run(a, () =>
    views.issue("http://localhost", false, "http://localhost", session.value),
  ).catch((e) => e);
  await entered.promise;
  active = false;
  proceed.resolve();
  expect(await issuing).toMatchObject({ code: "SCOPE_DENIED" });
});
test("backend restart preserves domain identity and private control credentials without provision or replacement", async () => {
  await setup();
  const a = context();
  const before = await run(a, () => domains.resolve());
  const id = (await before.snapshot()).id;
  const configuration = before.configuration as MachineConfiguration;
  await views.close();
  await domains.close();
  await legacy.close();
  await f.restart();
  legacy = await Machines.open(f.lifecycle, null);
  domains = new ExecutionDomains(
    f.lifecycle,
    new DomainRuntime(f.dir, f.owner, null),
    (configuration) => new Host(configuration),
  );
  const after = await run(a, () => domains.resolve());
  expect((await after.snapshot()).id).toBe(id);
  expect(after.configuration?.token).toBe(configuration.token);
  expect((after.host as Host).calls).toBe(0);
});
test("operator policy is explicit, bounded and private", async () => {
  await setup();
  expect(readDomainPolicy(f.dir)).toBeNull();
  const path = join(f.dir, "execution-domains.json");
  writeFileSync(
    path,
    JSON.stringify({ version: 1, max_domains: 2, memory_mib: 768, cpus: 1, pids: 512 }),
    { mode: 0o600 },
  );
  expect(readDomainPolicy(f.dir)?.max_domains).toBe(2);
  writeFileSync(
    path,
    JSON.stringify({ version: 1, max_domains: 0, memory_mib: 768, cpus: 1, pids: 512 }),
  );
  expect(() => readDomainPolicy(f.dir)).toThrow("Invalid execution-domain policy");
});

test("run-tool leases restore their private domain outside the initiating request and reject foreign scope or revoked grants", async () => {
  await setup();
  const scope = context();
  let active = true;
  scope.validate = scope.validateResources = async () => {
    if (!active) throw new DomainError("SCOPE_DENIED", 403);
  };
  const tools = await ProductTools.open(f.lifecycle);
  // Stub only the deliberately closed native admission seam in this synthetic run fixture.
  f.lifecycle.authorizeDispatch = async (id, token) => {
    await f.store.dataContext?.validate(true);
    const accepted = await f.store.get("run", id);
    if (accepted.dispatch_token !== token) throw new DomainError("STALE_DISPATCH");
    return accepted;
  };
  const lease = await run(scope, async () => {
    const connections = new Connections(f.lifecycle);
    const connection = await connections.create({
      harness: "codex",
      authentication: { method: "native_login", billing_source: "subscription" },
    });
    await connections.update(connection, {
      capabilities: { ...connection.capabilities, product_tools: "supported" },
    });
    const agent = await f.lifecycle.createAgent({
      name: "Scoped tools",
      harness: "codex",
      connection_id: connection.id,
    });
    const thread = await f.lifecycle.create("thread", { type: "dm", member_agent_ids: [agent.id] });
    const binding = await f.lifecycle.bind(thread.id, agent.id, crypto.randomUUID());
    const admission = await f.lifecycle.admit({
      thread_id: thread.id,
      agent_id: agent.id,
      text: "Fixture-only run-tool scope verification.",
    });
    // Synthetic accepted run: this fixture tests the tool bridge, without opening the
    // production scoped native-admission gate owned by NMA-077/078.
    const accepted = await f.store.put(
      {
        ...admission.run,
        status: "running",
        binding_id: binding.id,
        workspace_id: binding.workspace_id,
        workspace_revision: binding.workspace_revision,
        dispatch_token: crypto.randomUUID(),
        authority_epoch: f.lifecycle.epoch,
        revision: admission.run.revision + 1,
      },
      admission.run.revision,
    );
    return tools.issue(accepted);
  });
  const result = (await tools.call(lease.token, lease.scope, "ngertiin.machine_status", {})) as {
    id: string;
    actor_id: string;
  };
  expect(result.actor_id).toBe(scope.userId);
  expect(result.id).not.toBe(f.owner);
  await expect(
    run(context(), () => tools.call(lease.token, lease.scope, "ngertiin.machine_status", {})),
  ).rejects.toMatchObject({ code: "SCOPE_DENIED" });
  active = false;
  await expect(
    tools.call(lease.token, lease.scope, "ngertiin.machine_status", {}),
  ).rejects.toMatchObject({ code: "SCOPE_DENIED" });
  active = true;
  const machine = await run(scope, () => domains.resolve());
  await tools.call(lease.token, lease.scope, "ngertiin.machine_control", {
    command_id: crypto.randomUUID(),
    operation: "acquire",
    expected_revision: (await machine.snapshot()).lease.revision,
  });
  expect((await machine.snapshot()).lease.holder).toBe("agent");
  tools.revokeAll();
  const deadline = Date.now() + 2000;
  while ((await machine.snapshot()).lease.holder !== "none" && Date.now() < deadline)
    await Bun.sleep(10);
  expect((await machine.snapshot()).lease.holder).toBe("none");
  await expect(tools.authenticate(lease.token)).rejects.toMatchObject({ code: "UNAUTHORIZED" });
});

test("rolled-back domain metadata is not cached as a retained binding", async () => {
  await setup();
  const a = context();
  await expect(
    run(a, () =>
      f.store.transaction(async () => {
        await domains.resolve();
        throw new Error("Roll back the enclosing command.");
      }),
    ),
  ).rejects.toThrow("Roll back");
  const machine = await run(a, () => domains.resolve());
  expect((await machine.snapshot()).actor_id).toBe(a.userId);
  expect(await run(a, () => f.store.list("execution_domain"))).toHaveLength(1);
});

test("loss of a retained private configuration requires reconciliation instead of generating replacement credentials", async () => {
  await setup();
  const a = context();
  const machine = await run(a, () => domains.resolve());
  const id = (await machine.snapshot()).id;
  await run(a, async () => {
    const domain = await f.store.get("execution_domain", id);
    await f.store.put(
      { ...domain, state: "ready", revision: domain.revision + 1 },
      domain.revision,
    );
  });
  await domains.close();
  rmSync(join(f.dir, "execution-domains", `${id}.json`));
  domains = new ExecutionDomains(
    f.lifecycle,
    new DomainRuntime(f.dir, f.owner, null),
    (configuration) => new Host(configuration),
  );
  await expect(run(a, () => domains.resolve())).rejects.toMatchObject({
    code: "MACHINE_DOMAIN_MISSING",
  });
});

test("immutable private artifact downloads do not require reattaching a former working machine", async () => {
  await setup();
  const a = context();
  const w = await workspace(a);
  await run(a, async () => {
    const artifacts = new Artifacts(f.lifecycle);
    const artifact = await artifacts.upload(w.id, crypto.randomUUID(), {
      name: "retained.txt",
      media_type: "text/plain",
      content_base64: Buffer.from("immutable retained output").toString("base64"),
    });
    const machine = await domains.resolve();
    const current = await machine.snapshot();
    const previous = await f.store.put({
      ...current,
      id: crypto.randomUUID(),
      machine_key: crypto.randomUUID(),
      state: "offline",
      revision: 1,
    });
    const rebound = await f.store.get("workspace", w.id);
    await f.store.put(
      { ...rebound, machine_id: previous.id, revision: rebound.revision + 1 },
      rebound.revision,
    );
    expect((await artifacts.download(artifact.id, w.id)).bytes.toString()).toBe(
      "immutable retained output",
    );
    await expect(new Workspaces(f.lifecycle).workingFiles(w.id)).rejects.toMatchObject({
      code: "MACHINE_UNAVAILABLE",
    });
  });
});
