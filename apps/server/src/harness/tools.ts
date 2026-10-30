import { timingSafeEqual } from "node:crypto";
import { z } from "zod";
import { DomainError, type Entity } from "../contracts";
import type { Lifecycle } from "../lifecycle";
import { canonical } from "../store";
import { Connections } from "./connections";
import { type ToolScope, toolScope } from "./contracts";

export type Resource = {
  kind: "agent" | "thread" | "run" | "message" | "goal" | "routine" | "artifact";
  id: string;
};
export type ToolAccess = { scope: Readonly<ToolScope>; authorize(): void };
type Tool = {
  schema: z.ZodType;
  resources(input: unknown): Resource[];
  execute(input: unknown, access: ToolAccess): unknown | Promise<unknown>;
};
export class ProductTools {
  readonly #leases = new Map<string, ToolScope>();
  readonly #negotiated = new Set<string>();
  readonly #initialized = new Set<string>();
  readonly #tools = new Map<string, Tool>();
  constructor(readonly lifecycle: Lifecycle) {
    this.register("ngertiin.read_run_context", {
      schema: z.strictObject({}),
      resources: () => [],
      execute: (_input, { scope, authorize }) => {
        authorize();
        const run = lifecycle.store.get("run", scope.run_id);
        const message = lifecycle.store.get("message", run.input_message_id);
        return {
          agent_id: run.agent_id,
          thread_id: run.thread_id,
          run_id: run.id,
          input: message.text,
        };
      },
    });
  }
  register(name: string, tool: Tool) {
    if (!/^[a-z][\w.]{1,100}$/.test(name) || this.#tools.has(name))
      throw new Error("Invalid or duplicate product tool.");
    this.#tools.set(name, tool);
  }
  issue(run: Entity<"run">) {
    const { agent, connection } = new Connections(this.lifecycle).forAgent(run.agent_id);
    if (!run.binding_id) throw new DomainError("SCOPE_DENIED", 403);
    const scope = toolScope.parse({
      owner_id: run.owner_id,
      connection_id: connection.id,
      agent_id: agent.id,
      thread_id: run.thread_id,
      run_id: run.id,
      binding_id: run.binding_id,
      grant_revision: agent.grant_revision,
      connection_revision: connection.grant_revision,
    });
    const token = `${crypto.randomUUID()}${crypto.randomUUID()}`;
    this.#leases.set(token, scope);
    try {
      this.authorize(scope);
    } catch (error) {
      this.#leases.delete(token);
      throw error;
    }
    return {
      token,
      scope: Object.freeze({ ...scope }),
      revoke: () => {
        this.#leases.delete(token);
        this.#negotiated.delete(token);
        this.#initialized.delete(token);
      },
    };
  }
  private lease(token: string) {
    // Constant-time token comparison, independent of caller-supplied scope fields.
    for (const [key, scope] of this.#leases) {
      const a = Buffer.from(key);
      const b = Buffer.from(token);
      if (a.length === b.length && timingSafeEqual(a, b)) {
        this.authorize(scope);
        return scope;
      }
    }
    throw new DomainError("UNAUTHORIZED", 401);
  }
  private authorize(scope: ToolScope) {
    const store = this.lifecycle.store;
    const run = store.get("run", scope.run_id);
    if (!run.dispatch_token) throw new DomainError("SCOPE_DENIED", 403);
    this.lifecycle.authorizeDispatch(run.id, run.dispatch_token);
    const { agent, connection } = new Connections(this.lifecycle).forAgent(scope.agent_id);
    const binding = store.get("binding", scope.binding_id);
    if (
      scope.owner_id !== store.ownerId ||
      run.owner_id !== scope.owner_id ||
      run.agent_id !== scope.agent_id ||
      run.thread_id !== scope.thread_id ||
      run.binding_id !== scope.binding_id ||
      agent.connection_id !== scope.connection_id ||
      agent.grant_revision !== scope.grant_revision ||
      connection.grant_revision !== scope.connection_revision ||
      connection.capabilities.product_tools !== "supported" ||
      binding.agent_id !== scope.agent_id ||
      binding.thread_id !== scope.thread_id ||
      binding.connection_id !== scope.connection_id
    )
      throw new DomainError("SCOPE_DENIED", 403);
  }
  private resource(scope: ToolScope, reference: Resource) {
    const entity = this.lifecycle.store.get(reference.kind, reference.id);
    if (entity.kind === "agent") {
      if (entity.id === scope.agent_id) return;
    } else if (entity.kind === "thread") {
      if (entity.id === scope.thread_id) return;
    } else if (entity.kind === "message") {
      if (entity.thread_id === scope.thread_id) return;
    } else if (entity.thread_id === scope.thread_id && entity.agent_id === scope.agent_id) return;
    throw new DomainError("SCOPE_DENIED", 403);
  }
  async call(token: string, claimedScope: unknown, name: string, input: unknown) {
    const scope = this.lease(token);
    if (canonical(toolScope.parse(claimedScope)) !== canonical(scope))
      throw new DomainError("SCOPE_DENIED", 403);
    const tool = this.#tools.get(name);
    if (!tool) throw new DomainError("NOT_FOUND", 404);
    const parsed = tool.schema.parse(input);
    const authorize = () => {
      this.lease(token);
      for (const ref of tool.resources(parsed)) this.resource(scope, ref);
    };
    authorize();
    // Asynchronous tools must call authorize immediately before committing their effect.
    const result = await tool.execute(parsed, { scope: Object.freeze({ ...scope }), authorize });
    authorize();
    return result;
  }
  authenticate(token: string) {
    this.lease(token);
  }
  revokeAll() {
    this.#leases.clear();
    this.#negotiated.clear();
    this.#initialized.clear();
  }
  async rpc(token: string, input: unknown) {
    const request = z
      .strictObject({
        jsonrpc: z.literal("2.0"),
        id: z.union([z.string(), z.number().int()]).optional(),
        method: z.string(),
        params: z.record(z.string(), z.unknown()).optional(),
      })
      .parse(input);
    const scope = this.lease(token);
    if (request.method === "notifications/initialized" && request.id === undefined) {
      if (!this.#negotiated.has(token)) throw new DomainError("CONFLICT");
      this.#initialized.add(token);
      return null;
    }
    if (request.id === undefined) throw new DomainError("INVALID_REQUEST", 422);
    if (!["initialize", "ping"].includes(request.method) && !this.#initialized.has(token))
      throw new DomainError("CONFLICT");
    let result: unknown;
    switch (request.method) {
      case "initialize": {
        z.object({
          protocolVersion: z.string(),
          capabilities: z.record(z.string(), z.unknown()),
          clientInfo: z.object({ name: z.string(), version: z.string() }),
        }).parse(request.params);
        this.#negotiated.add(token);
        result = {
          protocolVersion: "2025-06-18",
          capabilities: { tools: {} },
          serverInfo: { name: "ngertiin-product-tools", version: "1.0.0" },
        };
        break;
      }
      case "ping":
        result = {};
        break;
      case "tools/list":
        result = {
          tools: [...this.#tools].map(([name, tool]) => ({
            name,
            inputSchema: z.toJSONSchema(tool.schema),
          })),
        };
        break;
      case "tools/call": {
        const params = z
          .strictObject({ name: z.string(), arguments: z.unknown() })
          .parse(request.params);
        try {
          const value = await this.call(token, scope, params.name, params.arguments);
          result = {
            content: [{ type: "text", text: JSON.stringify(value) }],
            structuredContent: { result: value },
            isError: false,
          };
        } catch (error) {
          result = {
            content: [
              { type: "text", text: error instanceof DomainError ? error.code : "TOOL_FAILED" },
            ],
            isError: true,
          };
        }
        break;
      }
      default:
        return {
          jsonrpc: "2.0",
          id: request.id,
          error: { code: -32601, message: "Method not found." },
        };
    }
    return { jsonrpc: "2.0", id: request.id, result };
  }
}
