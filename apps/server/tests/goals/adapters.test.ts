import { expect, test } from "bun:test";
import { join } from "node:path";
import { Background } from "../../src/background";
import { Conversations } from "../../src/conversations";
import { Goals } from "../../src/goals/service";
import { manifests } from "../../src/harness/availability";
import { HarnessBroker } from "../../src/harness/broker";
import { CodexAdapter } from "../../src/harness/codex/adapter";
import { Connections } from "../../src/harness/connections";
import { CredentialContexts } from "../../src/harness/context";
import { MuseAdapter } from "../../src/harness/muse/adapter";
import { ProductTools } from "../../src/harness/tools";
import { RunControls } from "../../src/run-controls";
import { fixture } from "../helpers";
import { fixtureApi as createApi } from "../http-fixture";

for (const harness of ["codex", "muse"] as const) {
  test(`${harness} structured goal capture and quiet Routine round trip survive native-client restart`, async () => {
    const f = await fixture();
    let app!: Awaited<ReturnType<typeof createApi>>;
    let broker!: HarnessBroker;
    let background!: Background;
    const base = () => `http://127.0.0.1:${app.server?.port}`;
    const compose = async () => {
      const tools = await ProductTools.open(f.lifecycle);
      broker = new HarnessBroker(
        f.lifecycle,
        new CredentialContexts(f.dir),
        tools,
        {
          codex: new CodexAdapter(
            () => `${base()}/v1/harness/tools`,
            [join(import.meta.dir, "../fixtures/codex-app-server.ts")],
          ),
          muse: new MuseAdapter(
            () => `${base()}/v1/harness/tools`,
            [join(import.meta.dir, "../fixtures/muse-serve.ts")],
          ),
        },
        async (family) => ({
          harness: family,
          executable: process.execPath,
          version: manifests[family].minimum_version,
          state: "supported",
          manifest: manifests[family],
        }),
      );
      background = new Background(f.lifecycle, broker.executors());
      app = (
        await createApi(f.lifecycle, background, "t".repeat(64), {
          tools,
          broker,
          connections: broker.connections,
        })
      ).listen({ hostname: "127.0.0.1", port: 0 });
    };
    const close = async () => {
      await background.stop();
      await broker.close();
      await app.stop();
    };
    const c = await new Connections(f.lifecycle).create({
      harness,
      authentication: { method: "native_login", billing_source: "subscription" },
    });
    const agent = await f.lifecycle.createAgent({
      name: "Goal worker",
      harness,
      connection_id: c.id,
      model_id: "model-a",
      reasoning: "high",
    });
    const thread = await f.lifecycle.create("thread", { type: "dm", member_agent_ids: [agent.id] });
    const source = await f.lifecycle.admit({
      thread_id: thread.id,
      agent_id: agent.id,
      text: "Prepare a report.",
    });
    const goalId = crypto.randomUUID();
    await new RunControls(f.lifecycle).edit(source.message.id, {
      expected_revision: source.message.revision,
      text: `product-tool:${JSON.stringify({
        name: "ngertiin.capture_goal",
        arguments: {
          command_id: crypto.randomUUID(),
          goal_id: goalId,
          expected_revision: 0,
          title: "Prepare report",
          objective: "Verify a useful report",
          source_message_id: source.message.id,
        },
      })}`,
    });
    await compose();
    try {
      await background.tick();
      await background.idle();
      expect((await f.store.get("run", source.run.id)).status).toBe("succeeded");
      expect((await f.store.get("run", source.run.id)).product_tools).toContain(
        "ngertiin.capture_goal",
      );
      const goal = await f.store.get("goal", goalId);
      await new Goals(f.lifecycle).report(source.run.id, {
        goal_id: goalId,
        expected_revision: goal.revision,
        progress: "Waiting for actual input.",
        disposition: "wait",
      });
      const r = await new Goals(f.lifecycle).writeRoutine(source.run.id, {
        routine_id: crypto.randomUUID(),
        expected_revision: 0,
        goal_id: null,
        instruction: `product-tool:${JSON.stringify({ name: "ngertiin.routine_no_update", arguments: { command_id: crypto.randomUUID() } })}`,
        schedule: { type: "once", at: "2026-10-31T00:00:00.000Z" },
        timezone: "Asia/Makassar",
      });
      const session = (await f.store.list("binding")).find(
        (b) => b.thread_id === thread.id,
      )?.native_session_id;
      await close();
      await f.restart();
      await compose();
      await background.tick(new Date("2026-11-01T00:00:00Z"));
      await background.idle();
      const occurrence = (await f.store.list("occurrence")).find((o) => o.routine_id === r.id);
      expect(occurrence).toBeDefined();
      const run = await f.store.get("run", occurrence?.run_id as string);
      expect(run).toMatchObject({ status: "succeeded", publication: "quiet" });
      expect(run.product_tools).toContain("ngertiin.routine_no_update");
      expect(await f.store.answer(run.id)).toBeNull();
      expect(
        (await f.store.list("binding")).find((b) => b.thread_id === thread.id)?.native_session_id,
      ).toBe(session);
      expect(
        (await new Conversations(f.lifecycle).snapshot(thread.id)).messages.filter(
          (m) => m.run_id === run.id,
        ),
      ).toHaveLength(0);
      const cursor = await f.store.cursor;
      await background.tick();
      await background.idle();
      expect(await f.store.cursor).toBe(cursor);
    } finally {
      await close();
      await f.close();
    }
  }, 30_000);
}
