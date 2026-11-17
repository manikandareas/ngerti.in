import { timingSafeEqual } from "node:crypto";
import { z } from "zod";
import type { ToolLease } from "./client";
import { HarnessError } from "./contracts";
import { productToolCatalog, productToolNames } from "./product-tool-contracts";
import { toolContentBlock } from "./tool-results";

export type ActiveToolLease = {
  lease: ToolLease;
  signal: AbortSignal;
  accepted: () => boolean;
  beforeCall?: () => Promise<void>;
  delivered?: () => void;
};

// MCP clients may add transport metadata; only name and arguments cross the app boundary.
const toolCall = z.object({
  name: z.string().refine((name) => productToolNames.includes(name)),
  arguments: z.record(z.string(), z.unknown()),
});
/** Per-session native endpoint. Its token cannot access the application's MCP endpoint. */
export class SessionTools {
  readonly token = `${crypto.randomUUID()}${crypto.randomUUID()}`;
  readonly server;
  #bound = false;
  #revoked = false;
  #controller: AbortController | null = null;
  #active: ActiveToolLease | null = null;
  #closing?: Promise<void>;
  readonly #initialized = new WeakMap<ActiveToolLease, Promise<void>>();
  constructor(
    private readonly endpoint: () => string,
    private readonly enabled = true,
    private readonly machine = false,
    private readonly reusable = false,
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
              serverInfo: { name: "ngertiin", version: "1.0.0" },
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
          if (frame.method !== "tools/call") return Response.json({ jsonrpc: "2.0", id, result });
          const active = this.#active;
          const bytes = new TextEncoder().encode(JSON.stringify({ jsonrpc: "2.0", id, result }));
          // Release self-stop only after Bun consumes the response body for the native transport.
          return new Response(
            new ReadableStream<Uint8Array>({
              start(controller) {
                controller.enqueue(bytes);
              },
              pull: (controller) => {
                controller.close();
                setTimeout(() => {
                  if (this.active === active) active?.delivered?.();
                }, 0);
              },
            }),
            { headers: { "Content-Type": "application/json" } },
          );
        } catch (error) {
          const code =
            error instanceof HarnessError
              ? error.code
              : error instanceof z.ZodError
                ? "INVALID_REQUEST"
                : "TOOL_UNAVAILABLE";
          console.error(JSON.stringify({ event: "harness.product_tool.error", code }));
          return Response.json({
            jsonrpc: "2.0",
            id,
            error: { code: -32602, message: "Scoped product tool unavailable.", data: { code } },
          });
        }
      },
    });
  }
  get active(): ActiveToolLease | null {
    return this.#active;
  }
  set active(value: ActiveToolLease | null) {
    if (value && (this.#revoked || (!this.reusable && this.#bound)))
      throw new HarnessError("NATIVE_REJECTED");
    if (value) this.#bound = true;
    this.#controller?.abort();
    this.#controller = value ? new AbortController() : null;
    this.#active =
      value && this.#controller
        ? Object.freeze({
            ...value,
            signal: AbortSignal.any([value.signal, this.#controller.signal]),
          })
        : null;
  }
  revoke() {
    this.#revoked = true;
    this.#controller?.abort();
    this.#active?.lease.revoke();
    this.#active = null;
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
    await active.beforeCall?.();
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
    let initialized = this.#initialized.get(active);
    if (!initialized) {
      initialized = (async () => {
        await rpc("initialize", {
          protocolVersion: "2025-06-18",
          capabilities: {},
          clientInfo: { name: "ngertiin", version: "1.0.0" },
        });
        await rpc("notifications/initialized", {}, true);
      })();
      this.#initialized.set(active, initialized);
      const current = initialized;
      void current.catch(() => {
        if (this.#initialized.get(active) === current) this.#initialized.delete(active);
      });
    }
    await initialized;
    check();
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
    this.revoke();
    this.#closing ??= this.server.stop(true);
    return this.#closing;
  }
}
