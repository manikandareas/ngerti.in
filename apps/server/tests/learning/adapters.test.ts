import { expect, test } from "bun:test";
import { join } from "node:path";
import { Background } from "../../src/background";
import { manifests } from "../../src/harness/availability";
import { HarnessBroker } from "../../src/harness/broker";
import { CodexAdapter } from "../../src/harness/codex/adapter";
import { Connections } from "../../src/harness/connections";
import { CredentialContexts } from "../../src/harness/context";
import { MuseAdapter } from "../../src/harness/muse/adapter";
import { ProductTools } from "../../src/harness/tools";
import { fixture } from "../helpers";
import { fixtureApi as createApi } from "../http-fixture";

for (const harness of ["codex", "muse"] as const) {
  test(`${harness} protocol fixture uses the trusted learning bridge and resumes pinned assets after restart`, async () => {
    const f = await fixture();
    const connection = await new Connections(f.lifecycle).create({
      harness,
      authentication: { method: "native_login", billing_source: "subscription" },
    });
    const agent = await f.lifecycle.createAgent({
      name: "Learning fixture",
      harness,
      connection_id: connection.id,
      model_id: "model-a",
      reasoning: "high",
    });
    const thread = await f.lifecycle.create("thread", { type: "dm", member_agent_ids: [agent.id] });
    let app: Awaited<ReturnType<typeof createApi>>;
    let background: Background;
    let broker: HarnessBroker;
    const token = "l".repeat(64);
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
        async (id) => ({
          harness: id,
          executable: process.execPath,
          version: manifests[id].minimum_version,
          state: "supported",
          manifest: manifests[id],
        }),
      );
      background = new Background(f.lifecycle, broker.executors());
      app = (
        await createApi(f.lifecycle, background, token, {
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
    const call = async (name: string, args: object, threadId = thread.id) => {
      const response = await fetch(`${base()}/v1/runs`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
          "Idempotency-Key": crypto.randomUUID(),
        },
        body: JSON.stringify({
          thread_id: threadId,
          agent_id: agent.id,
          text: `product-tool:${JSON.stringify({ name, arguments: args })}`,
        }),
      });
      const admitted = await response.json();
      expect(response.status).toBe(200);
      await background.tick();
      await background.idle();
      const run = await f.store.get("run", admitted.run.id);
      expect(run.status).toBe("succeeded");
      const answer = JSON.parse((await f.store.answer(run.id))?.text ?? "null");
      const text =
        harness === "codex" ? answer.tool.contentItems[0].text : answer.tool.result.content[0].text;
      return { result: JSON.parse(text), run };
    };
    await compose();
    try {
      const memoryId = crypto.randomUUID();
      const input = {
        command_id: crypto.randomUUID(),
        memory_id: memoryId,
        expected_revision: 0,
        visibility: "dm_private",
        text: "Original fact",
      };
      const first = await call("ngertiin.write_memory", input);
      await call("ngertiin.write_memory", {
        ...input,
        command_id: crypto.randomUUID(),
        expected_revision: 1,
        text: "Correct fact",
      });
      await call("ngertiin.delete_memory", {
        command_id: crypto.randomUUID(),
        memory_id: memoryId,
        expected_revision: 2,
      });
      await call("ngertiin.write_memory", input);
      expect((await f.store.get("memory", memoryId)).state).toBe("deleted");
      const created = await call("ngertiin.create_skill", {
        command_id: crypto.randomUUID(),
        name: "scoped-report",
        visibility: "dm_private",
        package: {
          description: "Produce a clear report",
          instructions: "Read references/context.txt",
          assets: [{ path: "references/context.txt", text: "PRIVATE_ASSET" }],
        },
      });
      const skill = created.result.skill;
      await call("ngertiin.assign_skill", {
        command_id: crypto.randomUUID(),
        skill_id: skill.id,
        version: 1,
        expected_revision: 0,
        enabled: true,
      });
      await call("ngertiin.revise_skill", {
        command_id: crypto.randomUUID(),
        skill_id: skill.id,
        expected_revision: 1,
        package: {
          description: "Updated report",
          instructions: "Use the new format",
          assets: [{ path: "references/context.txt", content_base64: "AAECAw==" }],
        },
      });
      await close();
      await f.restart();
      await compose();
      const old = await call("ngertiin.read_skill", { skill_id: skill.id, version: 1 });
      expect(old.result.revision.package.assets[0].text).toBe("PRIVATE_ASSET");
      expect(old.run.binding_id).toBe(first.run.binding_id);
      const inventory = await call("ngertiin.list_skills", {});
      expect(inventory.result.application[0].assignment.version).toBe(1);
      expect(inventory.result.native_state).toBe("supported");
      const memories = await call("ngertiin.list_memories", {});
      expect(memories.result.memories).toEqual([]);
      const group = await f.lifecycle.create("thread", {
        type: "group",
        member_agent_ids: [agent.id],
      });
      const scoped = await call("ngertiin.list_skills", {}, group.id);
      expect(scoped.result.application).toEqual([]);
      expect(JSON.stringify(scoped.result)).not.toContain("PRIVATE_ASSET");
      expect(await f.store.list("skill_revision")).toHaveLength(2);
    } finally {
      await close();
      await f.close();
    }
  }, 45_000);
}
