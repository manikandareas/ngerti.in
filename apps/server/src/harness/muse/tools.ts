import { timingSafeEqual } from "node:crypto";
import { z } from "zod";
import type { ToolLease } from "../client";
import { HarnessError } from "../contracts";
import { productToolCatalog, productToolNames } from "../product-tool-contracts";
import { toolContentBlock } from "../tool-results";

// MCP clients may add transport metadata; only name and arguments cross the app boundary.
const toolCall = z.object({
  name: z.string().refine((name) => productToolNames.includes(name)),
  arguments: z.record(z.string(), z.unknown()),
});
/** Per-session native endpoint. Its token cannot access the application's MCP endpoint. */
export class MuseTools {
  readonly token = `${crypto.randomUUID()}${crypto.randomUUID()}`;
  readonly server;
  active: { lease: ToolLease; signal: AbortSignal; accepted: () => boolean } | null = null;
  constructor(
    private readonly endpoint: () => string,
    private readonly enabled = true,
    private readonly machine = false,
  ) {
    this.server = Bun.serve({
      hostname: "127.0.0.1",
      port: 0,
      maxRequestBodySize: 1_048_576,
      fetch: async (request) => {
        const expected = Buffer.from(`Bearer ${this.token}`);
        const supplied = Buffer.from(request.headers.get("Authorization") ?? "");
        const origin = request.headers.get("Origin");
        if (
          supplied.length !== expected.length ||
          !timingSafeEqual(supplied, expected) ||
          (origin !== null && origin !== new URL(request.url).origin)
        )
          return new Response(null, { status: 403 });
        if (request.method !== "POST") return new Response(null, { status: 405 });
        let id: unknown = null;
        try {
          const frame = z
            .object({
              jsonrpc: z.literal("2.0"),
              id: z.union([z.string(), z.number()]).optional(),
              method: z.string(),
              params: z.unknown().optional(),
            })
            .parse(await request.json());
          id = frame.id ?? null;
          if (frame.method === "notifications/initialized")
            return new Response(null, { status: 202 });
          let result: unknown;
          if (frame.method === "initialize")
            result = {
              protocolVersion: "2025-06-18",
              capabilities: { tools: {} },
              serverInfo: { name: "ngertiin-muse", version: "1.0.0" },
            };
          else if (frame.method === "tools/list")
            result = {
              tools: this.enabled ? productToolCatalog(this.machine ? "machine" : "browser") : [],
            };
          else if (frame.method === "tools/call")
            result = await this.call(toolCall.parse(frame.params));
          else
            return Response.json({
              jsonrpc: "2.0",
              id,
              error: { code: -32601, message: "Method unavailable." },
            });
          return Response.json({ jsonrpc: "2.0", id, result });
        } catch (error) {
          const code =
            error instanceof HarnessError
              ? error.code
              : error instanceof z.ZodError
                ? "INVALID_REQUEST"
                : "TOOL_UNAVAILABLE";
          console.error(JSON.stringify({ event: "muse.product_tool.error", code }));
          return Response.json({
            jsonrpc: "2.0",
            id,
            error: { code: -32602, message: "Scoped product tool unavailable.", data: { code } },
          });
        }
      },
    });
  }
  get config() {
    return {
      ngertiin: {
        transport: "streamableHttp",
        url: `http://127.0.0.1:${this.server.port}/mcp`,
        headers: { Authorization: `Bearer ${this.token}` },
      },
    };
  }
  private async call(params: z.infer<typeof toolCall>) {
    const active = this.active;
    if (!active) throw new HarnessError("NATIVE_REJECTED");
    const check = () => {
      if (!active || this.active !== active || active.signal.aborted || !active.accepted())
        throw new HarnessError("NATIVE_REJECTED");
    };
    const rpc = async (method: string, params: unknown, notification = false) => {
      check();
      const response = await fetch(this.endpoint(), {
        method: "POST",
        headers: {
          Authorization: `Bearer ${active?.lease.token}`,
          "Content-Type": "application/json",
          "MCP-Protocol-Version": "2025-06-18",
        },
        body: JSON.stringify({
          jsonrpc: "2.0",
          ...(notification ? {} : { id: crypto.randomUUID() }),
          method,
          params,
        }),
        signal: AbortSignal.any([active.signal, AbortSignal.timeout(30_000)]),
      });
      if (!response.ok) throw new HarnessError("NATIVE_REJECTED");
      check();
      return notification ? null : response.json();
    };
    await rpc("initialize", {
      protocolVersion: "2025-06-18",
      capabilities: {},
      clientInfo: { name: "ngertiin-muse", version: "1.0.0" },
    });
    await rpc("notifications/initialized", {}, true);
    const value = z
      .object({
        result: z.object({
          content: z.array(toolContentBlock),
          isError: z.boolean(),
        }),
      })
      .parse(await rpc("tools/call", params));
    return value.result;
  }
  close() {
    this.active = null;
    this.server.stop(true);
  }
}
