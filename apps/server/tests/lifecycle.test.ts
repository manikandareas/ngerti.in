import { Database } from "bun:sqlite";
import { afterEach, expect, test } from "bun:test";
import { join } from "node:path";
import { contractDocument, domainEvent, threadInput } from "../src/contracts";
import { Store } from "../src/store";
import { fixture } from "./helpers";

let f: Awaited<ReturnType<typeof fixture>>;
afterEach(async () => await f?.close());
async function setup() {
  f = await fixture();
  return f;
}

test("admission, user text, identity, receipt and events survive restart", async () => {
  const f = await setup();
  const command = crypto.randomUUID();
  const result = await f.store.command(
    command,
    { text: "Halo" },
    async () => await f.admit("Halo"),
  );
  const events = await f.store.events(0);
  await f.restart();
  expect(
    await f.store.command<typeof result>(command, { text: "Halo" }, () => {
      throw new Error("Duplicate admission");
    }),
  ).toEqual(result);
  expect((await f.store.get("message", result.message.id)).text).toBe("Halo");
  expect((await f.store.get("run", result.run.id)).status).toBe("queued");
  expect(await f.store.events(0)).toEqual(events);
  for (const event of events) expect(domainEvent.safeParse(event).success).toBe(true);
});

test("changed idempotent command is rejected without writes", async () => {
  const f = await setup();
  const key = crypto.randomUUID();
  await f.store.command(key, { text: "one" }, async () => await f.admit());
  const count = (await f.store.events(0)).length;
  await expect(
    (async () => f.store.command(key, { text: "two" }, async () => f.admit()))(),
  ).rejects.toThrow("IDEMPOTENCY_CONFLICT");
  expect(await f.store.events(0)).toHaveLength(count);
});

test("a native start acknowledgement clears a resolved preflight error and keeps its historical receipt", async () => {
  const f = await setup();
  const { run } = await f.admit();
  await f.lifecycle.recordDiagnostic(run.id, {
    code: "VERSION_TOO_OLD",
    category: "configuration",
    outcome: "not_dispatched",
  });
  const before = await f.store.cursor;
  await f.bind();
  const claimed = await f.lifecycle.claimNext(f.thread.id, f.agent.id);
  if (!claimed?.dispatch_token) throw new Error("Run not claimed");
  const started = await f.lifecycle.started(run.id, claimed.dispatch_token, crypto.randomUUID());
  expect(started.diagnostic).toBeNull();
  expect(
    (await f.store.events(0))
      .filter((event) => event.cursor <= before)
      .some(
        (event) => event.data.kind === "run" && event.data.diagnostic?.code === "VERSION_TOO_OLD",
      ),
  ).toBeTrue();
});

test("outer rollback removes projections, event publication and command receipt together", async () => {
  const f = await setup();
  const key = crypto.randomUUID();
  const count = (await f.store.events(0)).length;
  await expect(
    (async () =>
      f.store.command(key, {}, async () => {
        await f.admit();
        throw new Error("Crash before commit");
      }))(),
  ).rejects.toThrow();
  expect(await f.store.list("run")).toHaveLength(0);
  expect(await f.store.list("message")).toHaveLength(0);
  expect(await f.store.events(0)).toHaveLength(count);
  expect((await f.store.command(key, {}, async () => await f.admit())).run.status).toBe("queued");
});

test("a second authority and an owner mismatch are rejected", async () => {
  const f = await setup();
  await expect((async () => Store.open(f.store.path, f.owner, f.options))()).rejects.toThrow(
    "Another application authority",
  );
  await f.restart();
  await f.store.close();
  await expect(
    (async () => Store.open(join(f.dir, "state.sqlite"), crypto.randomUUID(), f.options))(),
  ).rejects.toThrow("another owner");
  // Reopen the fixture after proving the rejected constructor released its lock.
  await f.restart();
});

test("legacy databases are refused without modifying their data", async () => {
  const f = await setup();
  const path = join(f.dir, "legacy.sqlite");
  const legacy = new Database(path);
  legacy.exec("CREATE TABLE old_state(value TEXT); INSERT INTO old_state VALUES ('keep')");
  legacy.close();
  await expect((async () => Store.open(path, f.owner, f.options))()).rejects.toThrow(
    "explicit offline import",
  );
  const check = new Database(path, { readonly: true });
  expect(check.query("SELECT value FROM old_state").get()).toEqual({ value: "keep" });
  check.close();
});

test("scope and strict schemas reject cross-thread admission and caller-owned identities", async () => {
  const f = await setup();
  const other = await f.lifecycle.create("agent", {
    name: "Other",
    harness: "codex",
    connection_id: (await f.store.get("agent", f.agent.id)).connection_id,
  });
  await expect(
    (async () =>
      f.lifecycle.admit({ thread_id: f.thread.id, agent_id: other.id, text: "Read private DM" }))(),
  ).rejects.toThrow("SCOPE_DENIED");
  await expect(
    (async () =>
      f.lifecycle.create("agent", {
        name: "Injected",
        harness: "codex",
        connection_id: crypto.randomUUID(),
        owner_id: crypto.randomUUID(),
      }))(),
  ).rejects.toThrow();
  expect(() =>
    threadInput.parse({ type: "dm", member_agent_ids: [f.agent.id, other.id] }),
  ).toThrow();
  expect(() =>
    threadInput.parse({ type: "group", member_agent_ids: [f.agent.id, f.agent.id] }),
  ).toThrow();
});

test("FIFO admits only one active run per thread and agent", async () => {
  const f = await setup();
  await f.bind();
  const first = await f.admit();
  const second = await f.admit();
  const claimed = await f.lifecycle.claimNext(f.thread.id, f.agent.id);
  expect(claimed?.id).toBe(first.run.id);
  expect(await f.lifecycle.claimNext(f.thread.id, f.agent.id)).toBeNull();
  if (!claimed?.dispatch_token) throw new Error("Expected dispatch");
  await f.lifecycle.settle(claimed.id, claimed.dispatch_token, "succeeded");
  expect((await f.lifecycle.claimNext(f.thread.id, f.agent.id))?.id).toBe(second.run.id);
});

test("native sessions stay separate across DM and group; shared session identity is rejected", async () => {
  const f = await setup();
  const privateBinding = await f.bind();
  const group = await f.lifecycle.create("thread", {
    type: "group",
    member_agent_ids: [f.agent.id],
  });
  await expect(
    (async () => f.lifecycle.bind(group.id, f.agent.id, privateBinding.native_session_id))(),
  ).rejects.toThrow();
  const groupBinding = await f.lifecycle.bind(group.id, f.agent.id, "group-native-session");
  expect(groupBinding.id).not.toBe(privateBinding.id);
  expect(groupBinding.agent_id).toBe(privateBinding.agent_id);
});

test("unused binding replacement rejects stale revisions and any binding claimed for dispatch", async () => {
  const f = await setup();
  const binding = await f.bind();
  const before = await f.store.cursor;
  await expect(
    (async () =>
      f.lifecycle.bind(f.thread.id, f.agent.id, "new-pristine-session", undefined, {
        id: binding.id,
        revision: binding.revision + 1,
      }))(),
  ).rejects.toThrow("CONFLICT");
  expect(await f.store.cursor).toBe(before);
  await f.admit();
  expect((await f.lifecycle.claimNext(f.thread.id, f.agent.id))?.binding_id).toBe(binding.id);
  const dispatched = await f.store.cursor;
  await expect(
    (async () =>
      f.lifecycle.bind(f.thread.id, f.agent.id, "must-not-replay", undefined, binding))(),
  ).rejects.toThrow("CONFLICT");
  expect(await f.store.cursor).toBe(dispatched);
  expect(await f.store.get("binding", binding.id)).toEqual(binding);
});

test("grant changes between admission and dispatch are fenced", async () => {
  const f = await setup();
  await f.bind();
  await f.admit();
  const agent = await f.store.get("agent", f.agent.id);
  await f.store.put({ ...agent, grant_revision: 2, revision: 2 }, 1);
  await expect((async () => f.lifecycle.claimNext(f.thread.id, f.agent.id))()).rejects.toThrow(
    "STALE_DISPATCH",
  );
});

test("final dispatch rechecks grants after claim", async () => {
  const f = await setup();
  await f.bind();
  await f.admit();
  const claimed = await f.lifecycle.claimNext(f.thread.id, f.agent.id);
  const agent = await f.store.get("agent", f.agent.id);
  await f.store.put({ ...agent, grant_revision: 2, revision: 2 }, 1);
  await expect(
    (async () => f.lifecycle.authorizeDispatch(claimed?.id ?? "", claimed?.dispatch_token ?? ""))(),
  ).rejects.toThrow("STALE_DISPATCH");
});

test("stop intent does not claim native stop and survives recovery", async () => {
  const f = await setup();
  await f.bind();
  const { run } = await f.admit();
  const claimed = await f.lifecycle.claimNext(f.thread.id, f.agent.id);
  if (!claimed?.dispatch_token) throw new Error("Expected dispatch");
  await f.lifecycle.started(run.id, claimed.dispatch_token);
  const stopped = await f.lifecycle.cancel(run.id);
  expect(stopped.status).toBe("cancel_requested");
  expect(stopped.cancellation).toBe("requested");
  await f.restart();
  const recovered = await f.store.get("run", run.id);
  expect(recovered.status).toBe("unknown");
  expect(recovered.cancellation).toBe("requested");
  await expect(
    (async () => f.lifecycle.settle(run.id, claimed.dispatch_token ?? "", "succeeded"))(),
  ).rejects.toThrow("STALE_DISPATCH");
  expect(await f.lifecycle.claimNext(f.thread.id, f.agent.id)).toBeNull();
  const receipt = crypto.randomUUID();
  expect(
    (await f.lifecycle.reconcile(run.id, recovered.revision, "cancelled", receipt)).cancellation,
  ).toBe("confirmed");
  expect(
    (await f.lifecycle.reconcile(run.id, recovered.revision, "cancelled", receipt)).status,
  ).toBe("cancelled");
});

test("queued cancellation is terminal while unknown work cannot be replayed", async () => {
  const f = await setup();
  const queued = await f.admit();
  expect((await f.lifecycle.cancel(queued.run.id)).status).toBe("cancelled");
  await f.bind();
  const next = await f.admit();
  const claimed = await f.lifecycle.claimNext(f.thread.id, f.agent.id);
  if (!claimed?.dispatch_token) throw new Error("Expected dispatch");
  await f.lifecycle.settle(next.run.id, claimed.dispatch_token, "unknown");
  await f.admit();
  await f.restart();
  expect(await f.lifecycle.claimNext(f.thread.id, f.agent.id)).toBeNull();
  await expect(
    (async () => f.lifecycle.reconcile(next.run.id, 2, "succeeded", ""))(),
  ).rejects.toThrow("RECONCILIATION_REQUIRED");
});

test("stopping a goal cancels its queue and routines while stopping a run leaves its goal active", async () => {
  const f = await setup();
  const goal = await f.lifecycle.create("goal", {
    thread_id: f.thread.id,
    agent_id: f.agent.id,
    title: "Research",
  });
  const routine = await f.lifecycle.create("routine", {
    thread_id: f.thread.id,
    agent_id: f.agent.id,
    goal_id: goal.id,
    instruction: "Check progress",
    schedule: { type: "once", at: new Date().toISOString() },
    timezone: "Asia/Makassar",
  });
  const first = await f.lifecycle.admit({
    thread_id: f.thread.id,
    agent_id: f.agent.id,
    text: "Work",
    goal_id: goal.id,
  });
  await f.lifecycle.cancel(first.run.id);
  expect((await f.store.get("goal", goal.id)).state).toBe("active");
  const second = await f.lifecycle.admit({
    thread_id: f.thread.id,
    agent_id: f.agent.id,
    text: "Work",
    goal_id: goal.id,
  });
  await f.lifecycle.controlGoal(goal.id, "stopped");
  await f.restart();
  expect((await f.store.get("run", second.run.id)).status).toBe("cancelled");
  expect((await f.store.get("routine", routine.id)).state).toBe("stopped");
  await expect(
    (async () =>
      f.lifecycle.admit({
        thread_id: f.thread.id,
        agent_id: f.agent.id,
        text: "Work",
        goal_id: goal.id,
      }))(),
  ).rejects.toThrow("CONFLICT");
});

test("artifacts require the correct thread/run scope and an opaque storage key", async () => {
  const f = await setup();
  const { run } = await f.admit();
  const input = {
    thread_id: f.thread.id,
    agent_id: f.agent.id,
    run_id: run.id,
    media_type: "text/plain",
    sha256: "a".repeat(64),
    storage_key: "artifact_1",
  };
  const artifact = await f.lifecycle.create("artifact", input);
  await f.restart();
  expect((await f.store.get("artifact", artifact.id)).storage_key).toBe("artifact_1");
  await expect(
    (async () => f.lifecycle.create("artifact", { ...input, storage_key: "../../secret" }))(),
  ).rejects.toThrow();
  const group = await f.lifecycle.create("thread", {
    type: "group",
    member_agent_ids: [f.agent.id],
  });
  await expect(
    (async () => f.lifecycle.create("artifact", { ...input, thread_id: group.id }))(),
  ).rejects.toThrow("SCOPE_DENIED");
});

test("event cursor pagination is stable and contracts expose all domain entities", async () => {
  const f = await setup();
  await f.admit();
  const page = await f.store.events(0, 2);
  const remainder = await f.store.events(page[1].cursor);
  expect([...page, ...remainder]).toEqual(await f.store.events(0));
  expect(Object.keys(contractDocument().entities).sort()).toEqual([
    "agent",
    "app_connection",
    "app_effect",
    "app_session",
    "artifact",
    "attachment_document",
    "attachment_upload",
    "binding",
    "browser_action",
    "browser_profile",
    "browser_session",
    "connection",
    "control",
    "goal",
    "group_route",
    "harness_inventory",
    "human_request",
    "machine",
    "machine_operation",
    "machine_process",
    "machine_target",
    "machine_window",
    "memory",
    "message",
    "occurrence",
    "peer_task",
    "routine",
    "run",
    "skill",
    "skill_assignment",
    "skill_revision",
    "thread",
    "workspace",
  ]);
});
