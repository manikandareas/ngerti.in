import { timingSafeEqual } from "node:crypto";
import { dirname } from "node:path";
import { z } from "zod";
import { registerAgentTools } from "../agents/tools";
import { Attachments } from "../attachments/service";
import { registerAttachmentTools } from "../attachments/tools";
import { type BrowserHost, DockerBrowserHost } from "../browser/host";
import { Browsers } from "../browser/service";
import { registerBrowserTools } from "../browser/tools";
import { DomainError, type Entity } from "../contracts";
import { Goals } from "../goals/service";
import { registerGoalTools } from "../goals/tools";
import { registerGroupTools } from "../groups/tools";
import type { AppHost } from "../integrations/host";
import { Applications } from "../integrations/service";
import { registerAppTools } from "../integrations/tools";
import { registerLearningTools } from "../learning/tools";
import type { Lifecycle } from "../lifecycle";
import { observeToolActivity, toolActivityKind } from "../runs/activity";
import { canonical } from "../store";
import { registerWorkspaceTools } from "../workspaces/tools";
import { Connections } from "./connections";
import { type ToolScope, toolScope } from "./contracts";
import { ProductToolMcp } from "./mcp";
import { productToolDefinition, productToolSchemas } from "./product-tool-contracts";

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
  readonly #tools = new Map<string, Tool>();
  readonly #mcp = new ProductToolMcp({
    scope: (token) => this.lease(token),
    list: (scope) =>
      (this.lifecycle.store.get("thread", scope.thread_id).purpose === "routing"
        ? []
        : [...this.#tools]
      ).map(([name, tool]) => productToolDefinition(name, tool.schema)),
    call: (token, scope, name, input) => this.call(token, scope, name, input),
  });
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
    registerWorkspaceTools(this);
    registerAttachmentTools(this);
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
          ...new Attachments(lifecycle).current(run),
          agent_snapshot: run.agent_snapshot,
          task: run.task_id ? lifecycle.store.get("peer_task", run.task_id) : null,
        };
      },
    });
    this.register("ngertiin.describe_tools", {
      schema: productToolSchemas["ngertiin.describe_tools"],
      resources: () => [],
      execute: (input, { authorize }) => {
        authorize();
        const { names } = productToolSchemas["ngertiin.describe_tools"].parse(input);
        if (names?.some((name) => !this.#tools.has(name)))
          throw new DomainError("INVALID_REQUEST", 422);
        return {
          tools: [...this.#tools]
            .filter(([name]) => !names || names.includes(name))
            .map(([name, tool]) => productToolDefinition(name, tool.schema)),
        };
      },
    });
    registerAgentTools(this);
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
        this.#mcp.revoke(token);
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
    } else if (
      entity.kind === "artifact" &&
      entity.thread_id === scope.thread_id &&
      entity.agent_id === null
    ) {
      const run = this.lifecycle.store.get("run", scope.run_id);
      if (run.workspace_id && entity.workspace_id === run.workspace_id) {
        // The active run already revalidated group membership and workspace revision.
        const workspace = this.lifecycle.store.get("workspace", run.workspace_id);
        if (workspace.scope === "group" && workspace.state === "active") return;
      }
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
    const thread = this.lifecycle.store.get("thread", before.thread_id);
    const target =
      name === "ngertiin.group_handoff" ? (parsed as { agent_id: string }).agent_id : null;
    const operation = {
      call_id: `product:${crypto.randomUUID()}`,
      kind:
        target && thread.type === "group" && thread.member_agent_ids.includes(target)
          ? ("asking_agent" as const)
          : toolActivityKind(name),
      target_agent_id:
        target && thread.type === "group" && thread.member_agent_ids.includes(target)
          ? target
          : null,
    };
    observeToolActivity(
      this.lifecycle,
      before.id,
      before.dispatch_token as string,
      operation,
      "started",
    );
    let result: unknown;
    try {
      result = await tool.execute(parsed, { scope: Object.freeze({ ...scope }), authorize });
    } catch (error) {
      if (error instanceof DomainError) {
        const current = this.lifecycle.store.get("run", scope.run_id);
        if (current.dispatch_token && ["running", "dispatching"].includes(current.status)) {
          this.lifecycle.observe(current.id, current.dispatch_token, {
            tool_errors: [
              ...current.tool_errors,
              { name, code: error.code, created_at: new Date().toISOString() },
            ].slice(-50),
          });
          if (name === "ngertiin.report_goal")
            new Goals(this.lifecycle).recordReportFailure(
              current.id,
              parsed as { goal_id: string; expected_revision: number },
              error.code,
            );
        }
      }
      throw error;
    } finally {
      const current = this.lifecycle.store.get("run", before.id);
      if (
        current.dispatch_token === before.dispatch_token &&
        ["running", "dispatching", "cancel_requested"].includes(current.status)
      )
        observeToolActivity(
          this.lifecycle,
          current.id,
          current.dispatch_token as string,
          operation,
          "completed",
        );
    }
    const receipt = result as Partial<Entity<"goal"> | Entity<"routine"> | Entity<"run">> | null;
    const endsOwnScope =
      before.cancellation === "none" &&
      receipt &&
      ((name === "ngertiin.cancel_run" &&
        receipt.kind === "run" &&
        receipt.id === before.id &&
        receipt.cancellation === "requested") ||
        ((name === "ngertiin.assign_goal" || name === "ngertiin.control_goal") &&
          receipt.kind === "goal" &&
          receipt.id !== undefined &&
          (name === "ngertiin.assign_goal" || receipt.state !== "active") &&
          (before.goal_id === receipt.id ||
            receipt.current_run_id === before.id ||
            (before.task_id !== null &&
              this.lifecycle.store
                .get("peer_task", before.task_id)
                .goal_ids.includes(receipt.id)))) ||
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
    this.#mcp.clear();
  }
  rpc(token: string, input: unknown) {
    return this.#mcp.rpc(token, input);
  }
}
