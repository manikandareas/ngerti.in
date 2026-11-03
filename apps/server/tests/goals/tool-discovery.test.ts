import { expect, test } from "bun:test";
import { Connections } from "../../src/harness/connections";
import { MuseTools } from "../../src/harness/muse/tools";
import { productToolCatalog } from "../../src/harness/product-tool-contracts";
import { ProductTools } from "../../src/harness/tools";
import { fixture } from "../helpers";

test("responsibility guidance reaches MCP, exact-schema discovery and the Muse native catalog", async () => {
  const f = fixture();
  const tools = new ProductTools(f.lifecycle);
  const muse = new MuseTools(() => "http://127.0.0.1:1");
  try {
    const connections = new Connections(f.lifecycle);
    const connection = connections.get(f.store.get("agent", f.agent.id).connection_id);
    connections.update(connection, {
      capabilities: { ...connection.capabilities, product_tools: "supported" },
    });
    f.bind();
    f.admit();
    const run = f.lifecycle.claimNext(f.thread.id, f.agent.id);
    if (!run?.dispatch_token) throw new Error("Expected a claimed run.");
    f.lifecycle.started(run.id, run.dispatch_token, crypto.randomUUID());
    const lease = tools.issue(f.store.get("run", run.id));
    const rpc = (method: string, params?: Record<string, unknown>, notification = false) =>
      tools.rpc(lease.token, {
        jsonrpc: "2.0",
        ...(!notification ? { id: crypto.randomUUID() } : {}),
        method,
        params,
      });
    await rpc("initialize", {
      protocolVersion: "2025-06-18",
      capabilities: {},
      clientInfo: { name: "discovery-test", version: "1" },
    });
    await rpc("notifications/initialized", {}, true);
    const listed = (await rpc("tools/list"))?.result as { tools: unknown[] };
    const described = (
      await rpc("tools/call", {
        name: "ngertiin.describe_tools",
        arguments: {},
      })
    )?.result as { structuredContent: { result: { tools: unknown[] } } };
    const response = await fetch(muse.config.ngertiin.url, {
      method: "POST",
      headers: { Authorization: `Bearer ${muse.token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list" }),
    });
    expect(response.status).toBe(200);
    const native = (await response.json()) as { result: { tools: unknown[] } };
    for (const catalog of [
      listed.tools,
      described.structuredContent.result.tools,
      native.result.tools,
    ]) {
      for (const name of [
        "ngertiin.capture_goal",
        "ngertiin.write_routine",
        "ngertiin.group_handoff",
        "ngertiin.create_file",
        "ngertiin.publish_artifact",
      ]) {
        const item = catalog.find((item) => (item as { name: string }).name === name) as {
          name: string;
          description?: string;
          inputSchema: { description?: string };
        };
        const expected = productToolCatalog().find((tool) => tool.name === name);
        expect(item.description).toBeTruthy();
        expect(item.description).toBe(expected?.description);
        expect(item.inputSchema.description).toBe(item.description);
      }
    }
  } finally {
    muse.server.stop(true);
    await tools.browsers.shutdown();
    f.close();
  }
});
