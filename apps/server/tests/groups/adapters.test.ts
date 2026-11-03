import { expect, test } from "bun:test";
import { join } from "node:path";
import { createApi } from "../../src/api";
import { Background } from "../../src/background";
import { Conversations } from "../../src/conversations";
import { Groups } from "../../src/groups/service";
import { manifests } from "../../src/harness/availability";
import { HarnessBroker } from "../../src/harness/broker";
import { CodexAdapter } from "../../src/harness/codex/adapter";
import { Connections } from "../../src/harness/connections";
import { CredentialContexts } from "../../src/harness/context";
import { MuseAdapter } from "../../src/harness/muse/adapter";
import { ProductTools } from "../../src/harness/tools";
import { fixture } from "../helpers";

for (const routerHarness of ["codex", "muse"] as const) {
  test(`${routerHarness} routing and cross-harness peer/HITL use real protocol fixtures and durable tool receipts`, async () => {
    const f = fixture();
    let app!: ReturnType<typeof createApi>;
    let broker: HarnessBroker;
    let background: Background;
    const token = "h".repeat(64);
    const base = () => `http://127.0.0.1:${app.server?.port}`;
    const compose = () => {
      const tools = new ProductTools(f.lifecycle);
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
        async (harness) => ({
          harness,
          executable: process.execPath,
          version: manifests[harness].minimum_version,
          state: "supported",
          manifest: manifests[harness],
        }),
      );
      background = new Background(f.lifecycle, broker.executors());
      app = createApi(f.lifecycle, background, token, {
        tools,
        broker,
        connections: broker.connections,
      }).listen({ hostname: "127.0.0.1", port: 0 });
    };
    const close = async () => {
      await background.stop();
      await broker.close();
      await app.stop();
    };
    const agent = (harness: "codex" | "muse", name: string) => {
      const connection = new Connections(f.lifecycle).create({
        harness,
        authentication: { method: "native_login", billing_source: "subscription" },
      });
      return f.lifecycle.createAgent({
        name,
        harness,
        connection_id: connection.id,
        model_id: "model-a",
        reasoning: "high",
      });
    };
    const router = agent(routerHarness, "Coordinator");
    const peer = agent(routerHarness === "codex" ? "muse" : "codex", "Reviewer");
    const group = f.lifecycle.create("thread", {
      type: "group",
      member_agent_ids: [router.id, peer.id],
    });
    const pump = async (until: () => boolean) => {
      for (let i = 0; i < 12 && !until(); i++) {
        background.tick();
        await background.idle();
      }
      expect(until()).toBe(true);
    };
    compose();
    try {
      const groups = new Groups(f.lifecycle);
      const selection = groups.send(group.id, {
        text: "Who should review this?",
        router_agent_id: router.id,
      });
      await pump(() => f.store.get("group_route", selection.id).state === "selected");
      expect(f.store.get("group_route", selection.id).selected_agent_id).toBe(peer.id);
      await pump(() => f.store.list("peer_task").every((t) => t.state === "completed"));
      const childInput = `product-tool:${JSON.stringify({ name: "ngertiin.group_ask_user", arguments: { command_id: crypto.randomUUID(), purpose: "review", question: "Confirm this review?" } })}`;
      const command = {
        name: "ngertiin.group_handoff",
        arguments: {
          command_id: crypto.randomUUID(),
          announcement: "I am asking the peer to review this work.",
          agent_id: peer.id,
          purpose: "review",
          instruction: childInput,
        },
      };
      const route = groups.send(group.id, {
        agent_id: router.id,
        text: `product-tool:${JSON.stringify(command)}`,
      });
      await pump(
        () =>
          f.store.list("human_request").length === 1 &&
          f.store.list("run").every((r) => r.status === "succeeded"),
      );
      const request = f.store.list("human_request")[0];
      const task = f.store.get("peer_task", route.task_id as string);
      expect(task.state).toBe("waiting_peer");
      expect(f.store.get("peer_task", request.task_id).state).toBe("waiting_user");
      const rootRun = f.store.get("run", task.current_run_id);
      const childRun = f.store.get("run", f.store.get("peer_task", request.task_id).current_run_id);
      expect(rootRun.product_tools).toContain("ngertiin.group_handoff");
      expect(childRun.product_tools).toContain("ngertiin.group_ask_user");
      await close();
      f.restart();
      compose();
      const response = await app.handle(
        new Request(`http://localhost/v1/human-requests/${request.id}/reply`, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
            "Idempotency-Key": crypto.randomUUID(),
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ expected_revision: request.revision, text: "Confirmed." }),
        }),
      );
      expect(response.status).toBe(200);
      await pump(() => f.store.get("peer_task", task.id).state === "completed");
      expect(f.store.get("peer_task", task.id).continuation).toBe(1);
      expect(f.store.get("peer_task", request.task_id).continuation).toBe(1);
      const snapshot = new Conversations(f.lifecycle).snapshot(group.id);
      expect(snapshot.messages.some((m) => m.purpose === "continuation")).toBe(false);
      expect(snapshot.messages.filter((m) => m.purpose === "review")[0]?.author_agent_id).toBe(
        router.id,
      );
      expect(
        snapshot.messages.filter((m) => m.purpose === "human_request")[0]?.author_agent_id,
      ).toBe(peer.id);
      expect(snapshot.messages.filter((m) => m.purpose === "human_reply")).toHaveLength(1);
    } finally {
      await close();
      f.close();
    }
  }, 30_000);
}
