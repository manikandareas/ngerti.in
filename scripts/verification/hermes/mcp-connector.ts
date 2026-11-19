import { existsSync, readFileSync, writeFileSync } from "node:fs";

const sessions = new Map<string, boolean>();
const target = process.env.HERMES_MCP_FIXTURE_DATA;
const statusFile = process.env.HERMES_MCP_FIXTURE_STATUS;
const catalogGate = process.env.HERMES_MCP_FIXTURE_CATALOG_GATE;
if (!target) throw new Error("Set the synthetic MCP fixture data file.");
const token = "ngertiin-mcp-fixture-only";
const protocolVersion = "2025-06-18";
const inputSchema = {
  type: "object",
  required: ["item_id"],
  properties: { item_id: { type: "string", const: "KITE-624" } },
  additionalProperties: false,
};
const writeSchema = {
  ...inputSchema,
  required: ["item_id", "status"],
  properties: {
    ...inputSchema.properties,
    status: { type: "string", enum: ["checker-accepted", "checker-second"] },
  },
};

Bun.serve({
  hostname: "127.0.0.1",
  port: 8469,
  async fetch(request) {
    if (new URL(request.url).pathname !== "/mcp") return new Response(null, { status: 404 });
    const origin = request.headers.get("Origin");
    if (origin && origin !== "http://127.0.0.1:8469") return new Response(null, { status: 403 });
    if (request.headers.get("Authorization") !== `Bearer ${token}`)
      return new Response(null, { status: 401 });
    const session = request.headers.get("Mcp-Session-Id");
    if (request.method === "DELETE") {
      if (session) sessions.delete(session);
      return new Response(null, { status: 204 });
    }
    if (request.method !== "POST") return new Response(null, { status: 405 });
    const { jsonrpc, id, method, params } = await request.json() as {
      jsonrpc?: string; id?: string; method?: string;
      params?: { name?: string; arguments?: { item_id?: string; status?: string } };
    };
    if (jsonrpc !== "2.0" || (id !== undefined && typeof id !== "string"))
      return new Response(null, { status: 400 });
    const response = (result: unknown, headers?: HeadersInit) =>
      Response.json({ jsonrpc: "2.0", id, result }, { headers });
    if (method === "initialize") {
      const key = crypto.randomUUID();
      sessions.set(key, false);
      console.info(JSON.stringify({ event: "initialize", bearerAccepted: true }));
      return response({
        protocolVersion, capabilities: { tools: { listChanged: true } },
        serverInfo: { name: "Kite Laboratory", version: "1.0.0" },
      }, { "Mcp-Session-Id": key });
    }
    if (!session || !sessions.has(session)) return new Response(null, { status: 404 });
    if (method === "notifications/initialized") {
      sessions.set(session, true);
      return new Response(null, { status: 202 });
    }
    if (!sessions.get(session) || request.headers.get("MCP-Protocol-Version") !== protocolVersion)
      return new Response(null, { status: 400 });
    const refreshed = Boolean(catalogGate && existsSync(catalogGate));
    const lookup = refreshed ? "lookup_raven_item" : "lookup_kite_item";
    const expectedItem = refreshed ? "RAVEN-309" : "KITE-624";
    if (method === "tools/list")
      return new Response(`event: message\ndata: ${JSON.stringify({
        jsonrpc: "2.0", id,
        result: { tools: [{
          name: lookup,
          description: refreshed
            ? "Look up the current Raven inventory item in the Kite laboratory."
            : "Look up an authorized inventory item in the Kite laboratory.",
          inputSchema: {
            ...inputSchema,
            properties: { item_id: { type: "string", const: expectedItem } },
          },
          annotations: { readOnlyHint: true },
        }, ...(statusFile ? [{
          name: "set_kite_status",
          description: "Write the verification status to the Kite laboratory inventory item.",
          inputSchema: writeSchema,
          annotations: { readOnlyHint: false },
        }] : [])] },
      })}\n\n`, { headers: { "Content-Type": "text/event-stream" } });
    if (method !== "tools/call") return new Response(null, { status: 405 });
    const item = params?.arguments?.item_id;
    const status = params?.arguments?.status;
    if (statusFile && params?.name === "set_kite_status" && item === "KITE-624" &&
      ["checker-accepted", "checker-second"].includes(status ?? "") &&
      Object.keys(params.arguments ?? {}).length === 2) {
      writeFileSync(statusFile, `${status}\n`, { mode: 0o600 });
      console.info(JSON.stringify({ event: "write", item, status }));
      return response({ content: [{ type: "text", text: status }], structuredContent: { item, status } });
    }
    if (params?.name !== lookup || item !== expectedItem ||
      Object.keys(params?.arguments ?? {}).length !== 1) {
      console.info(JSON.stringify({ event: "invalid_call", catalog: refreshed ? "raven" : "kite" }));
      return response({ isError: true, content: [{ type: "text", text: "Kite request did not match its schema." }] });
    }
    const data = JSON.parse(readFileSync(target, "utf8")) as Record<string, string>;
    const value = data[item];
    if (typeof value !== "string") throw new Error("The fixture target is missing its required item.");
    console.info(JSON.stringify({ event: "lookup", item, found: !!value }));
    return response({ content: [{ type: "text", text: value }], structuredContent: {
      item, value, ...(statusFile ? { status: readFileSync(statusFile, "utf8").trim() } : {}),
    } });
  },
});
