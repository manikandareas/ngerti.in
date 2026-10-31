import { timingSafeEqual } from "node:crypto";
import { dirname } from "node:path";
import { z } from "zod";
import { Artifacts } from "../artifacts";
import { type BrowserHost, DockerBrowserHost } from "../browser/host";
import { Browsers } from "../browser/service";
import { registerBrowserTools } from "../browser/tools";
import { type agentInput, type agentUpdate, DomainError, type Entity } from "../contracts";
import { registerGoalTools } from "../goals/tools";
import { authorizeResponsibilityWork } from "../goals/work-fence";
import { registerGroupTools } from "../groups/tools";
import type { AppHost } from "../integrations/host";
import { Applications } from "../integrations/service";
import { registerAppTools } from "../integrations/tools";
import { registerLearningTools } from "../learning/tools";
import type { Lifecycle } from "../lifecycle";
import { canonical } from "../store";
import { Connections } from "./connections";
import { type ToolScope, toolScope } from "./contracts";
import { productToolSchemas } from "./product-tool-contracts";

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
  readonly browsers: Browsers;
  readonly applications: Applications;
  readonly #leases = new Map<string, ToolScope>();
  readonly #negotiated = new Set<string>();
  readonly #initialized = new Set<string>();
  readonly #tools = new Map<string, Tool>();
  constructor(
    readonly lifecycle: Lifecycle,
    private readonly completed: (scope: ToolScope, name: string) => void = () => {},
    browserHost?: BrowserHost,
    appHost?: AppHost,
  ) {
    this.applications = new Applications(lifecycle, appHost);
    registerAppTools(this);
    this.browsers = new Browsers(
      lifecycle,
      browserHost ?? new DockerBrowserHost(dirname(lifecycle.store.path), lifecycle.store.ownerId),
    );
    registerBrowserTools(this);
    registerLearningTools(this);
    registerGroupTools(this);
    registerGoalTools(this);
    this.register("ngertiin.cancel_run", {
      schema: productToolSchemas["ngertiin.cancel_run"],
      resources: () => [],
      execute: (input, { scope, authorize }) => {
        const { command_id } = input as { command_id: string };
        authorize();
        return lifecycle.store.command(
          command_id,
          { operation: "ngertiin.cancel_run", run_id: scope.run_id },
          () => {
            authorize();
            return lifecycle.cancel(scope.run_id);
          },
        );
      },
    });
    const artifacts = new Artifacts(lifecycle);
    const workspaces = artifacts.workspaces;
    const workspaceFor = (access: ToolAccess) => {
      access.authorize();
      return workspaces.authorizeRun(lifecycle.store.get("run", access.scope.run_id));
    };
    for (const name of [
      "ngertiin.get_workspace",
      "ngertiin.list_files",
      "ngertiin.read_file",
      "ngertiin.create_file",
      "ngertiin.publish_artifact",
    ] as const) {
      this.register(name, {
        schema: productToolSchemas[name],
        resources: () => [],
        execute: (raw, access) => {
          const workspace = workspaceFor(access);
          const data = raw as {
            command_id: string;
            path: string;
            text: string;
            media_type: string;
          };
          if (name === "ngertiin.get_workspace")
            return {
              workspace_id: workspace.id,
              name: workspace.name,
              root: workspaces.path(workspace),
            };
          if (name === "ngertiin.list_files")
            return workspaces.files(workspace.id).list(data.path, "", 200);
          if (name === "ngertiin.read_file") {
            const bytes = workspaces.files(workspace.id).read(data.path);
            if (bytes.length > 100_000) throw new DomainError("INVALID_REQUEST", 413);
            return {
              path: data.path,
              text: new TextDecoder("utf-8", { fatal: true }).decode(bytes),
            };
          }
          if (name === "ngertiin.create_file")
            return lifecycle.store.command(
              data.command_id,
              { operation: name, workspace_id: workspace.id, path: data.path, text: data.text },
              () => {
                access.authorize();
                authorizeResponsibilityWork(lifecycle, access.scope.run_id);
                workspaces.files(workspace.id).create(data.path, Buffer.from(data.text));
                return { path: data.path };
              },
            );
          return artifacts.publish(
            data.command_id,
            {
              workspace_id: workspace.id,
              run_id: access.scope.run_id,
              path: data.path,
              media_type: data.media_type,
            },
            access.authorize,
          );
        },
      });
    }
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
          input_message_id: message.id,
          goal_id: run.goal_id,
          routine_id: run.routine_id,
          workspace_id: run.workspace_id,
          attachments: message.artifact_ids.map((id) => {
            const item = lifecycle.store.get("artifact", id);
            if (item.workspace_id !== run.workspace_id) throw new DomainError("SCOPE_DENIED", 403);
            return { id: item.id, name: item.name, path: item.source_path, sha256: item.sha256 };
          }),
          agent_snapshot: run.agent_snapshot,
          task: run.task_id ? lifecycle.store.get("peer_task", run.task_id) : null,
        };
      },
    });
    this.register("ngertiin.describe_tools", {
      schema: z.strictObject({}),
      resources: () => [],
      execute: (_input, { authorize }) => {
        authorize();
        return {
          tools: [...this.#tools].map(([name, tool]) => ({
            name,
            inputSchema: z.toJSONSchema(tool.schema),
          })),
        };
      },
    });
    this.register("ngertiin.list_agents", {
      schema: z.strictObject({}),
      resources: () => [],
      execute: (_input, { scope, authorize }) => {
        authorize();
        const caller = lifecycle.store.get("agent", scope.agent_id);
        const agents =
          caller.configuration_access === "owner" ? lifecycle.store.list("agent") : [caller];
        return {
          agents,
          connections: lifecycle.store
            .list("connection")
            .filter(
              (connection) =>
                connection.state === "active" &&
                (caller.configuration_access === "owner" || connection.id === caller.connection_id),
            )
            .map((connection) => ({
              id: connection.id,
              harness: connection.harness,
              authentication: {
                method: connection.authentication.method,
                billing_source: connection.authentication.billing_source,
              },
              models: connection.models,
            })),
        };
      },
    });
    this.register("ngertiin.create_agent", {
      schema: productToolSchemas["ngertiin.create_agent"],
      resources: () => [],
      execute: (input, { scope, authorize }) => {
        const data = input as { command_id: string; profile: z.infer<typeof agentInput> };
        authorize();
        if (lifecycle.store.get("agent", scope.agent_id).configuration_access !== "owner")
          throw new DomainError("SCOPE_DENIED", 403);
        return lifecycle.store.command(
          data.command_id,
          {
            operation: "create_agent",
            owner_id: scope.owner_id,
            actor_id: scope.agent_id,
            profile: data.profile,
          },
          () => {
            const connection = lifecycle.store.get("connection", data.profile.connection_id);
            if (connection.state !== "active" || connection.harness !== data.profile.harness)
              throw new DomainError("SCOPE_DENIED", 403);
            const agent = lifecycle.createAgent(data.profile);
            const thread = lifecycle.create("thread", { type: "dm", member_agent_ids: [agent.id] });
            return { agent, thread };
          },
        );
      },
    });
    this.register("ngertiin.update_agent", {
      schema: productToolSchemas["ngertiin.update_agent"],
      resources: () => [],
      execute: (input, { scope, authorize }) => {
        const data = input as z.infer<typeof agentUpdate> & {
          command_id: string;
          agent_id: string;
        };
        authorize();
        const caller = lifecycle.store.get("agent", scope.agent_id);
        if (caller.id !== data.agent_id && caller.configuration_access !== "owner")
          throw new DomainError("SCOPE_DENIED", 403);
        return lifecycle.store.command(
          data.command_id,
          {
            operation: "update_agent",
            owner_id: scope.owner_id,
            actor_id: caller.id,
            target: data.agent_id,
            expected_revision: data.expected_revision,
            changes: data.changes,
          },
          () =>
            lifecycle.updateAgent(data.agent_id, {
              expected_revision: data.expected_revision,
              changes: data.changes,
            }),
        );
      },
    });
  }
  register(name: string, tool: Tool) {
    if (!/^[a-z][\w.]{1,100}$/.test(name) || this.#tools.has(name))
      throw new Error("Invalid or duplicate product tool.");
    this.#tools.set(name, tool);
  }
  issue(run: Entity<"run">) {
    const { agent, connection } = new Connections(this.lifecycle).forAgent(
      run.agent_id,
      run.thread_id,
    );
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
  private authorize(scope: ToolScope, controlReceipt = false) {
    const store = this.lifecycle.store;
    const run = store.get("run", scope.run_id);
    if (!run.dispatch_token) throw new DomainError("SCOPE_DENIED", 403);
    if (controlReceipt) {
      if (
        run.authority_epoch !== this.lifecycle.epoch ||
        run.cancellation !== "requested" ||
        !["running", "cancel_requested"].includes(run.status)
      )
        throw new DomainError("STALE_DISPATCH");
      const thread = store.get("thread", run.thread_id);
      if (
        !thread.member_agent_ids.includes(run.agent_id) ||
        (run.thread_revision !== null && run.thread_revision !== thread.revision)
      )
        throw new DomainError("SCOPE_DENIED", 403);
    } else this.lifecycle.authorizeDispatch(run.id, run.dispatch_token);
    const { agent, connection } = new Connections(this.lifecycle).forAgent(
      scope.agent_id,
      scope.thread_id,
    );
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
    if (this.lifecycle.store.get("thread", scope.thread_id).purpose === "routing")
      throw new DomainError("SCOPE_DENIED", 403);
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
    const before = this.lifecycle.store.get("run", scope.run_id);
    const result = await tool.execute(parsed, { scope: Object.freeze({ ...scope }), authorize });
    const receipt = result as Partial<Entity<"goal"> | Entity<"routine"> | Entity<"run">> | null;
    const endsOwnScope =
      before.cancellation === "none" &&
      receipt &&
      ((name === "ngertiin.cancel_run" &&
        receipt.kind === "run" &&
        receipt.id === before.id &&
        receipt.cancellation === "requested") ||
        (name === "ngertiin.control_goal" &&
          receipt.kind === "goal" &&
          receipt.state !== "active" &&
          (before.goal_id === receipt.id || receipt.current_run_id === before.id)) ||
        (name === "ngertiin.control_routine" &&
          receipt.kind === "routine" &&
          receipt.state !== "active" &&
          before.routine_id === receipt.id));
    // A synchronous self-stop may return its committed receipt, but cannot authorize another tool.
    if (endsOwnScope) {
      if (!this.#leases.has(token)) throw new DomainError("UNAUTHORIZED", 401);
      this.authorize(scope, true);
    } else authorize();
    const current = this.lifecycle.store.get("run", scope.run_id);
    this.lifecycle.observe(current.id, current.dispatch_token as string, {
      product_tools: [...current.product_tools, name].slice(-200),
    });
    this.completed(scope, name);
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
          tools: (this.lifecycle.store.get("thread", scope.thread_id).purpose === "routing"
            ? []
            : [...this.#tools]
          ).map(([name, tool]) => ({
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
            content: toolContent(params.name, value),
            structuredContent: {
              result:
                params.name === "ngertiin.browser_action" &&
                value &&
                typeof value === "object" &&
                "receipt" in value
                  ? { receipt: value.receipt }
                  : value,
            },
            isError: false,
          };
        } catch (error) {
          result = {
            content: [
              {
                type: "text",
                text:
                  error instanceof DomainError
                    ? error.code
                    : error instanceof z.ZodError
                      ? "INVALID_REQUEST. Read ngertiin.describe_tools for the exact argument schema."
                      : "TOOL_FAILED",
              },
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

function toolContent(name: string, value: unknown) {
  if (
    name === "ngertiin.browser_action" &&
    value &&
    typeof value === "object" &&
    "content" in value &&
    "receipt" in value
  ) {
    return [
      { type: "text", text: JSON.stringify({ receipt: value.receipt }) },
      ...(value.content as unknown[]),
    ];
  }
  return [{ type: "text", text: JSON.stringify(value) }];
}
