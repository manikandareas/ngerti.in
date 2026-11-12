import { afterEach, expect, test } from "bun:test";
import { z } from "zod";
import { readAgentActivities } from "../src/agents/activity";
import { createApi } from "../src/api";
import { responseSchemas } from "../src/api-contract";
import { Background } from "../src/background";
import { Connections } from "../src/harness/connections";
import { ProductTools } from "../src/harness/tools";
import { observeToolActivity, toolActivityKind } from "../src/runs/activity";
import { fixture } from "./helpers";

let f: Awaited<ReturnType<typeof fixture>>;
afterEach(async () => await f?.close());

async function running() {
  f = await fixture();
  await f.admit("PRIVATE_ACTIVITY_INPUT");
  await f.bind();
  const claimed = await f.lifecycle.claimNext(f.thread.id, f.agent.id);
  if (!claimed?.dispatch_token) throw new Error("Missing claim.");
  return await f.lifecycle.started(claimed.id, claimed.dispatch_token, crypto.randomUUID());
}

test("overlapping activity survives another call finishing and settles without stale loading", async () => {
  const run = await running();
  const token = run.dispatch_token as string;
  const search = { call_id: "native:search", kind: "searching" as const, target_agent_id: null };
  const read = { call_id: "native:read", kind: "reading" as const, target_agent_id: null };
  const observe = async (step: typeof search | typeof read, state: "started" | "completed") =>
    await observeToolActivity(f.lifecycle, run.id, token, step, state);
  await observe(search, "started");
  await observe(read, "started");
  await observe(search, "started");
  expect((await f.store.get("run", run.id)).active_tools).toEqual([search, read]);
  await observe(search, "completed");
  expect(await f.store.get("run", run.id)).toMatchObject({
    activity: "tool_running",
    active_tools: [read],
  });
  await f.lifecycle.cancel(run.id);
  await observe(read, "completed");
  expect(await f.store.get("run", run.id)).toMatchObject({
    activity: "stopping",
    active_tools: [],
  });
  await f.lifecycle.settle(run.id, token, "cancelled");
  await expect((async () => observe(search, "started"))()).rejects.toThrow("STALE_DISPATCH");
  expect((await f.store.get("run", run.id)).active_tools).toEqual([]);
});

test("safe activity crosses authenticated HTTP snapshots and persists without transcript details", async () => {
  const run = await running();
  const operation = { call_id: "native:search", kind: "searching" as const, target_agent_id: null };
  await observeToolActivity(
    f.lifecycle,
    run.id,
    run.dispatch_token as string,
    operation,
    "started",
  );
  const token = "a".repeat(64);
  const app = await createApi(f.lifecycle, new Background(f.lifecycle), token);
  const get = (path: string, authenticated = true) =>
    app.handle(
      new Request(`http://localhost${path}`, {
        headers: authenticated ? { Authorization: `Bearer ${token}` } : {},
      }),
    );
  expect((await get("/v1/agents/activity", false)).status).toBe(401);
  const activity = responseSchemas.agent_activity.parse(
    await (await get("/v1/agents/activity")).json(),
  );
  expect(activity.items[0].active_tools).toEqual([operation]);
  expect(JSON.stringify(activity)).not.toContain("PRIVATE_ACTIVITY_INPUT");
  const snapshot = responseSchemas.conversation.parse(
    await (await get(`/v1/threads/${f.thread.id}/snapshot`)).json(),
  );
  expect(snapshot.runs[0].active_tools).toEqual([operation]);
  await f.restart();
  expect((await readAgentActivities(f.store)).items[0]).toMatchObject({
    status: "unknown",
    active_tools: [operation],
  });
});

test("product activity is live before an asynchronous tool result and clears after failure", async () => {
  const run = await running();
  const connection = await f.store.get(
    "connection",
    (await f.store.get("agent", f.agent.id)).connection_id as string,
  );
  await new Connections(f.lifecycle).update(connection, {
    capabilities: { ...connection.capabilities, product_tools: "supported" },
  });
  const tools = await ProductTools.open(f.lifecycle);
  let release!: () => void;
  const entered = Promise.withResolvers<void>();
  const held = new Promise<void>((resolve) => {
    release = resolve;
  });
  tools.register("fixture.held_activity", {
    schema: z.strictObject({}),
    resources: () => [],
    async execute() {
      entered.resolve();
      await held;
      throw new Error("Fixture failure.");
    },
  });
  const lease = await tools.issue(await f.store.get("run", run.id));
  const result = tools.call(lease.token, lease.scope, "fixture.held_activity", {});
  await entered.promise;
  expect((await f.store.get("run", run.id)).active_tools).toMatchObject([{ kind: "working" }]);
  release();
  await expect(result).rejects.toThrow("Fixture failure.");
  expect(await f.store.get("run", run.id)).toMatchObject({
    activity: "generating",
    active_tools: [],
  });
});

test("specific labels depend on known tool identities rather than user text", () => {
  expect(toolActivityKind("webSearch")).toBe("searching");
  expect(toolActivityKind("ngertiin.read_attachment")).toBe("reading");
  expect(toolActivityKind("fileChange")).toBe("updating");
  expect(toolActivityKind("echo search read_file private report")).toBe("working");
});
