import { Database } from "bun:sqlite";
import { afterEach, expect, test } from "bun:test";
import { join } from "node:path";
import { contractDocument, domainEvent, threadInput } from "../src/contracts";
import { Store } from "../src/store";
import { fixture } from "./helpers";

let f: ReturnType<typeof fixture>;
afterEach(() => f?.close());
function setup() {
  f = fixture();
  return f;
}

test("admission, user text, identity, receipt and events survive restart", () => {
  const f = setup();
  const command = crypto.randomUUID();
  const result = f.store.command(command, { text: "Halo" }, () => f.admit("Halo"));
  const events = f.store.events(0);
  f.restart();
  expect(
    f.store.command<typeof result>(command, { text: "Halo" }, () => {
      throw new Error("Duplicate admission");
    }),
  ).toEqual(result);
  expect(f.store.get("message", result.message.id).text).toBe("Halo");
  expect(f.store.get("run", result.run.id).status).toBe("queued");
  expect(f.store.events(0)).toEqual(events);
  for (const event of events) expect(domainEvent.safeParse(event).success).toBe(true);
});

test("changed idempotent command is rejected without writes", () => {
  const f = setup();
  const key = crypto.randomUUID();
  f.store.command(key, { text: "one" }, () => f.admit());
  const count = f.store.events(0).length;
  expect(() => f.store.command(key, { text: "two" }, () => f.admit())).toThrow(
    "IDEMPOTENCY_CONFLICT",
  );
  expect(f.store.events(0)).toHaveLength(count);
});

test("outer rollback removes projections, event publication and command receipt together", () => {
  const f = setup();
  const key = crypto.randomUUID();
  const count = f.store.events(0).length;
  expect(() =>
    f.store.command(key, {}, () => {
      f.admit();
      throw new Error("Crash before commit");
    }),
  ).toThrow();
  expect(f.store.list("run")).toHaveLength(0);
  expect(f.store.list("message")).toHaveLength(0);
  expect(f.store.events(0)).toHaveLength(count);
  expect(f.store.command(key, {}, () => f.admit()).run.status).toBe("queued");
});

test("a second authority and an owner mismatch are rejected", () => {
  const f = setup();
  expect(() => new Store(f.store.path, f.owner)).toThrow("Another application authority");
  f.restart();
  f.store.close();
  expect(() => new Store(join(f.dir, "state.sqlite"), crypto.randomUUID())).toThrow(
    "another owner",
  );
  // Reopen the fixture after proving the rejected constructor released its lock.
  f.restart();
});

test("legacy databases are refused without modifying their data", () => {
  const f = setup();
  const path = join(f.dir, "legacy.sqlite");
  const legacy = new Database(path);
  legacy.exec("CREATE TABLE old_state(value TEXT); INSERT INTO old_state VALUES ('keep')");
  legacy.close();
  expect(() => new Store(path, f.owner)).toThrow("Unsupported database");
  const check = new Database(path, { readonly: true });
  expect(check.query("SELECT value FROM old_state").get()).toEqual({ value: "keep" });
  check.close();
});

test("scope and strict schemas reject cross-thread admission and caller-owned identities", () => {
  const f = setup();
  const other = f.lifecycle.create("agent", {
    name: "Other",
    harness: "codex",
    connection_id: f.store.get("agent", f.agent.id).connection_id,
  });
  expect(() =>
    f.lifecycle.admit({ thread_id: f.thread.id, agent_id: other.id, text: "Read private DM" }),
  ).toThrow("SCOPE_DENIED");
  expect(() =>
    f.lifecycle.create("agent", {
      name: "Injected",
      harness: "codex",
      connection_id: crypto.randomUUID(),
      owner_id: crypto.randomUUID(),
    }),
  ).toThrow();
  expect(() =>
    threadInput.parse({ type: "dm", member_agent_ids: [f.agent.id, other.id] }),
  ).toThrow();
  expect(() =>
    threadInput.parse({ type: "group", member_agent_ids: [f.agent.id, f.agent.id] }),
  ).toThrow();
});

test("FIFO admits only one active run per thread and agent", () => {
  const f = setup();
  f.bind();
  const first = f.admit();
  const second = f.admit();
  const claimed = f.lifecycle.claimNext(f.thread.id, f.agent.id);
  expect(claimed?.id).toBe(first.run.id);
  expect(f.lifecycle.claimNext(f.thread.id, f.agent.id)).toBeNull();
  if (!claimed?.dispatch_token) throw new Error("Expected dispatch");
  f.lifecycle.settle(claimed.id, claimed.dispatch_token, "succeeded");
  expect(f.lifecycle.claimNext(f.thread.id, f.agent.id)?.id).toBe(second.run.id);
});

test("native sessions stay separate across DM and group; shared session identity is rejected", () => {
  const f = setup();
  const privateBinding = f.bind();
  const group = f.lifecycle.create("thread", { type: "group", member_agent_ids: [f.agent.id] });
  expect(() => f.lifecycle.bind(group.id, f.agent.id, privateBinding.native_session_id)).toThrow();
  const groupBinding = f.lifecycle.bind(group.id, f.agent.id, "group-native-session");
  expect(groupBinding.id).not.toBe(privateBinding.id);
  expect(groupBinding.agent_id).toBe(privateBinding.agent_id);
});

test("grant changes between admission and dispatch are fenced", () => {
  const f = setup();
  f.bind();
  f.admit();
  const agent = f.store.get("agent", f.agent.id);
  f.store.put({ ...agent, grant_revision: 2, revision: 2 }, 1);
  expect(() => f.lifecycle.claimNext(f.thread.id, f.agent.id)).toThrow("STALE_DISPATCH");
});

test("final dispatch rechecks grants after claim", () => {
  const f = setup();
  f.bind();
  f.admit();
  const claimed = f.lifecycle.claimNext(f.thread.id, f.agent.id);
  const agent = f.store.get("agent", f.agent.id);
  f.store.put({ ...agent, grant_revision: 2, revision: 2 }, 1);
  expect(() =>
    f.lifecycle.authorizeDispatch(claimed?.id ?? "", claimed?.dispatch_token ?? ""),
  ).toThrow("STALE_DISPATCH");
});

test("stop intent does not claim native stop and survives recovery", () => {
  const f = setup();
  f.bind();
  const { run } = f.admit();
  const claimed = f.lifecycle.claimNext(f.thread.id, f.agent.id);
  if (!claimed?.dispatch_token) throw new Error("Expected dispatch");
  f.lifecycle.started(run.id, claimed.dispatch_token);
  const stopped = f.lifecycle.cancel(run.id);
  expect(stopped.status).toBe("cancel_requested");
  expect(stopped.cancellation).toBe("requested");
  f.restart();
  const recovered = f.store.get("run", run.id);
  expect(recovered.status).toBe("unknown");
  expect(recovered.cancellation).toBe("requested");
  expect(() => f.lifecycle.settle(run.id, claimed.dispatch_token ?? "", "succeeded")).toThrow(
    "STALE_DISPATCH",
  );
  expect(f.lifecycle.claimNext(f.thread.id, f.agent.id)).toBeNull();
  const receipt = crypto.randomUUID();
  expect(f.lifecycle.reconcile(run.id, recovered.revision, "cancelled", receipt).cancellation).toBe(
    "confirmed",
  );
  expect(f.lifecycle.reconcile(run.id, recovered.revision, "cancelled", receipt).status).toBe(
    "cancelled",
  );
});

test("queued cancellation is terminal while unknown work cannot be replayed", () => {
  const f = setup();
  const queued = f.admit();
  expect(f.lifecycle.cancel(queued.run.id).status).toBe("cancelled");
  f.bind();
  const next = f.admit();
  const claimed = f.lifecycle.claimNext(f.thread.id, f.agent.id);
  if (!claimed?.dispatch_token) throw new Error("Expected dispatch");
  f.lifecycle.settle(next.run.id, claimed.dispatch_token, "unknown");
  f.admit();
  f.restart();
  expect(f.lifecycle.claimNext(f.thread.id, f.agent.id)).toBeNull();
  expect(() => f.lifecycle.reconcile(next.run.id, 2, "succeeded", "")).toThrow(
    "RECONCILIATION_REQUIRED",
  );
});

test("stopping a goal cancels its queue and routines while stopping a run leaves its goal active", () => {
  const f = setup();
  const goal = f.lifecycle.create("goal", {
    thread_id: f.thread.id,
    agent_id: f.agent.id,
    title: "Research",
  });
  const routine = f.lifecycle.create("routine", {
    thread_id: f.thread.id,
    agent_id: f.agent.id,
    goal_id: goal.id,
    instruction: "Check progress",
    schedule: { type: "once", at: new Date().toISOString() },
    timezone: "Asia/Makassar",
  });
  const first = f.lifecycle.admit({
    thread_id: f.thread.id,
    agent_id: f.agent.id,
    text: "Work",
    goal_id: goal.id,
  });
  f.lifecycle.cancel(first.run.id);
  expect(f.store.get("goal", goal.id).state).toBe("active");
  const second = f.lifecycle.admit({
    thread_id: f.thread.id,
    agent_id: f.agent.id,
    text: "Work",
    goal_id: goal.id,
  });
  f.lifecycle.controlGoal(goal.id, "stopped");
  f.restart();
  expect(f.store.get("run", second.run.id).status).toBe("cancelled");
  expect(f.store.get("routine", routine.id).state).toBe("stopped");
  expect(() =>
    f.lifecycle.admit({
      thread_id: f.thread.id,
      agent_id: f.agent.id,
      text: "Work",
      goal_id: goal.id,
    }),
  ).toThrow("CONFLICT");
});

test("artifacts require the correct thread/run scope and an opaque storage key", () => {
  const f = setup();
  const { run } = f.admit();
  const input = {
    thread_id: f.thread.id,
    agent_id: f.agent.id,
    run_id: run.id,
    media_type: "text/plain",
    sha256: "a".repeat(64),
    storage_key: "artifact_1",
  };
  const artifact = f.lifecycle.create("artifact", input);
  f.restart();
  expect(f.store.get("artifact", artifact.id).storage_key).toBe("artifact_1");
  expect(() => f.lifecycle.create("artifact", { ...input, storage_key: "../../secret" })).toThrow();
  const group = f.lifecycle.create("thread", { type: "group", member_agent_ids: [f.agent.id] });
  expect(() => f.lifecycle.create("artifact", { ...input, thread_id: group.id })).toThrow(
    "SCOPE_DENIED",
  );
});

test("event cursor pagination is stable and contracts expose all domain entities", () => {
  const f = setup();
  f.admit();
  const page = f.store.events(0, 2);
  const remainder = f.store.events(page[1].cursor);
  expect([...page, ...remainder]).toEqual(f.store.events(0));
  expect(Object.keys(contractDocument().entities).sort()).toEqual([
    "agent",
    "artifact",
    "binding",
    "connection",
    "control",
    "goal",
    "message",
    "occurrence",
    "routine",
    "run",
    "thread",
  ]);
});
