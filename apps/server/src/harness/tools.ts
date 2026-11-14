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
import { Interactions } from "../interactions/service";
import { registerInteractionTools } from "../interactions/tools";
import { registerLearningTools } from "../learning/tools";
import type { Lifecycle } from "../lifecycle";
import { resolvedMachine } from "../machines/domains";
import { type Machines, machineFor } from "../machines/service";
import { registerMachineTools } from "../machines/tools";
import type { DataContext } from "../persistence/access-context";
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
export type ToolAccess = { scope: Readonly<ToolScope>; authorize(): void | Promise<void> };
type Tool = {
  schema: z.ZodType;
  resources(input: unknown): Resource[];
  execute(input: unknown, access: ToolAccess): unknown | Promise<unknown>;
};
export class ProductTools {
  #browsers!: Browsers | undefined;
  machines!: Machines | undefined;
  applications!: Applications;
  readonly #leases = new Map<string, ToolScope>();
  readonly #contexts = new Map<string, DataContext>();
  readonly #readiness = new Map<string, () => Promise<void>>();
  readonly #tools = new Map<string, Tool>();
  readonly #mcp = new ProductToolMcp({
    scope: async (token) => await this.lease(token),
    list: async (scope) =>
      ((await this.lifecycle.store.get("thread", scope.thread_id)).purpose === "routing"
        ? []
        : [...this.#tools]
      ).map(([name, tool]) => productToolDefinition(name, tool.schema)),
    call: async (token, scope, name, input) => this.call(token, scope, name, input),
  });
  private constructor(
    readonly lifecycle: Lifecycle,
    private readonly completed: (scope: ToolScope, name: string) => void | Promise<void> = () => {},
  ) {}
  get browsers() {
    if (!this.#browsers) throw new DomainError("BROWSER_UNAVAILABLE");
    return this.#browsers;
  }
  register(name: string, tool: Tool) {
    if (!/^[a-z][\w.]{1,100}$/.test(name) || this.#tools.has(name))
      throw new Error("Invalid or duplicate product tool.");
    this.#tools.set(name, tool);
  }
  async issue(run: Entity<"run">, ready: () => Promise<void> = async () => {}) {
    const { agent, connection } = await new Connections(this.lifecycle).forAgent(
      run.agent_id,
      run.thread_id,
    );
    if (!run.binding_id) throw new DomainError("SCOPE_DENIED", 403);
    const scope = toolScope.parse({
      owner_id: run.owner_id,
      organization_id: run.organization_id,
      actor_id: run.actor_id ?? undefined,
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
    const context = this.lifecycle.store.dataContext;
    if (context)
      this.#contexts.set(token, {
        ...context,
        validate: context.validateResources ?? context.validate,
        acquire: context.acquireResources,
      });
    this.#readiness.set(token, ready);
    try {
      await this.authorize(scope);
    } catch (error) {
      this.#leases.delete(token);
      this.#contexts.delete(token);
      this.#readiness.delete(token);
      throw error;
    }
    return {
      token,
      scope: Object.freeze({ ...scope }),
      revoke: () => {
        void this.inContext(token, async () =>
          (await resolvedMachine(this.lifecycle))?.releaseRun(run.id),
        ).catch(() => {});
        this.#leases.delete(token);
        this.#contexts.delete(token);
        this.#readiness.delete(token);
        this.#mcp.revoke(token);
      },
    };
  }
  private async lease(token: string, waitForObservations = true) {
    // Constant-time token comparison, independent of caller-supplied scope fields.
    for (const [key, scope] of this.#leases) {
      const a = Buffer.from(key);
      const b = Buffer.from(token);
      if (a.length === b.length && timingSafeEqual(a, b)) {
        if (waitForObservations) await this.#readiness.get(key)?.();
        await this.authorize(scope);
        return scope;
      }
    }
    throw new DomainError("UNAUTHORIZED", 401);
  }
  private async authorize(scope: ToolScope, controlReceipt = false) {
    const store = this.lifecycle.store;
    await store.assertAuthority();
    const run = await store.get("run", scope.run_id);
    if (!run.dispatch_token) throw new DomainError("SCOPE_DENIED", 403);
    if (controlReceipt) {
      if (
        run.authority_epoch !== this.lifecycle.epoch ||
        run.cancellation !== "requested" ||
        !["running", "cancel_requested"].includes(run.status)
      )
        throw new DomainError("STALE_DISPATCH");
      const thread = await store.get("thread", run.thread_id);
      if (
        !thread.member_agent_ids.includes(run.agent_id) ||
        (run.thread_revision !== null && run.thread_revision !== thread.revision)
      )
        throw new DomainError("SCOPE_DENIED", 403);
    } else await this.lifecycle.authorizeDispatch(run.id, run.dispatch_token);
    const { agent, connection } = await new Connections(this.lifecycle).forAgent(
      scope.agent_id,
      scope.thread_id,
    );
    const binding = await store.get("binding", scope.binding_id);
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
  private async resource(scope: ToolScope, reference: Resource) {
    const entity = await this.lifecycle.store.get(reference.kind, reference.id);
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
      const run = await this.lifecycle.store.get("run", scope.run_id);
      if (run.workspace_id && entity.workspace_id === run.workspace_id) {
        // The active run already revalidated group membership and workspace revision.
        const workspace = await this.lifecycle.store.get("workspace", run.workspace_id);
        if (workspace.scope === "group" && workspace.state === "active") return;
      }
    } else if (entity.thread_id === scope.thread_id && entity.agent_id === scope.agent_id) return;
    throw new DomainError("SCOPE_DENIED", 403);
  }
  private async inContext<T>(token: string, action: () => Promise<T>): Promise<T> {
    const context = this.#contexts.get(token);
    const active = this.lifecycle.store.dataContext;
    if (
      context &&
      active &&
      (active.userId !== context.userId || active.organizationId !== context.organizationId)
    )
      throw new DomainError("SCOPE_DENIED", 403);
    return context && !active ? this.lifecycle.store.withDataContext(context, action) : action();
  }
  async call(token: string, claimedScope: unknown, name: string, input: unknown) {
    return this.inContext(token, () => this.callScoped(token, claimedScope, name, input));
  }
  private async callScoped(token: string, claimedScope: unknown, name: string, input: unknown) {
    const scope = await this.lease(token);
    if ((await this.lifecycle.store.get("thread", scope.thread_id)).purpose === "routing")
      throw new DomainError("SCOPE_DENIED", 403);
    if (canonical(toolScope.parse(claimedScope)) !== canonical(scope))
      throw new DomainError("SCOPE_DENIED", 403);
    const tool = this.#tools.get(name);
    if (!tool) throw new DomainError("NOT_FOUND", 404);
    const parsed = tool.schema.parse(input);
    const authorize = async () => {
      await this.lease(token, false);
      for (const ref of tool.resources(parsed)) await this.resource(scope, ref);
      await new Interactions(this.lifecycle).guard(
        scope.run_id,
        name,
        parsed as Record<string, unknown>,
      );
    };
    await authorize();
    // Asynchronous tools must call authorize immediately before committing their effect.
    const before = await this.lifecycle.store.get("run", scope.run_id);
    const thread = await this.lifecycle.store.get("thread", before.thread_id);
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
    await observeToolActivity(
      this.lifecycle,
      before.id,
      before.dispatch_token as string,
      operation,
      "started",
    );
    const controlsScope = [
      "ngertiin.cancel_run",
      "ngertiin.assign_goal",
      "ngertiin.control_goal",
      "ngertiin.control_routine",
    ].includes(name);
    if (controlsScope) this.lifecycle.holdToolControl(before.id);
    let result: unknown;
    try {
      if (
        this.machines &&
        ["ngertiin.computer_call", "ngertiin.machine_exec", "ngertiin.machine_window"].includes(
          name,
        )
      ) {
        const machines = await resolvedMachine(this.lifecycle);
        if (!machines) throw new DomainError("MACHINE_UNAVAILABLE", 503);
        const machine = await machines.snapshot();
        const activity = {
          machine_id: machine.id,
          generation: machine.generation,
          phase: "preparing" as const,
          started_at: before.computer_activity?.started_at ?? new Date().toISOString(),
        };
        await this.lifecycle.observe(before.id, before.dispatch_token as string, {
          computer_activity: activity,
        });
        await machines.ready();
        await authorize();
        await this.lifecycle.observe(before.id, before.dispatch_token as string, {
          computer_activity: { ...activity, phase: "active" },
        });
      }
      await new Interactions(this.lifecycle).claim(
        scope.run_id,
        name,
        parsed as Record<string, unknown>,
      );
      result = await this.lifecycle.store.withAuthorization(authorize, () =>
        tool.execute(parsed, { scope: Object.freeze({ ...scope }), authorize }),
      );
    } catch (error) {
      this.lifecycle.releaseToolControl(before.id);
      if (error instanceof DomainError) {
        const current = await this.lifecycle.store.get("run", scope.run_id);
        if (current.dispatch_token && ["running", "dispatching"].includes(current.status)) {
          await this.lifecycle.observe(current.id, current.dispatch_token, {
            tool_errors: [
              ...current.tool_errors,
              { name, code: error.code, created_at: new Date().toISOString() },
            ].slice(-50),
          });
          if (name === "ngertiin.report_goal")
            await new Goals(this.lifecycle).recordReportFailure(
              current.id,
              parsed as { goal_id: string; expected_revision: number },
              error.code,
            );
        }
      }
      throw error;
    } finally {
      const current = await this.lifecycle.store.get("run", before.id);
      if (
        current.dispatch_token === before.dispatch_token &&
        ["running", "dispatching", "cancel_requested"].includes(current.status)
      )
        await observeToolActivity(
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
              (await this.lifecycle.store.get("peer_task", before.task_id)).goal_ids.includes(
                receipt.id,
              )))) ||
        (name === "ngertiin.control_routine" &&
          receipt.kind === "routine" &&
          receipt.state !== "active" &&
          before.routine_id === receipt.id));
    if (!endsOwnScope) this.lifecycle.releaseToolControl(before.id);
    // A self-stop returns its committed receipt before native control interrupts the transport.
    if (endsOwnScope) {
      if (!this.#leases.has(token)) throw new DomainError("UNAUTHORIZED", 401);
      await this.authorize(scope, true);
    } else await authorize();
    const current = await this.lifecycle.store.get("run", scope.run_id);
    await this.lifecycle.observe(current.id, current.dispatch_token as string, {
      product_tools: [...current.product_tools, name].slice(-200),
    });
    await this.completed(scope, name);
    return result;
  }
  async authenticate(token: string) {
    await this.inContext(token, () => this.lease(token));
  }
  revokeAll() {
    for (const [token, scope] of this.#leases)
      void this.inContext(token, async () =>
        (await resolvedMachine(this.lifecycle))?.releaseRun(scope.run_id),
      ).catch(() => {});
    this.#leases.clear();
    this.#contexts.clear();
    this.#readiness.clear();
    this.#mcp.clear();
  }
  async rpc(token: string, input: unknown) {
    return this.inContext(token, () => this.#mcp.rpc(token, input));
  }

  private async initialize(lifecycle: Lifecycle, browserHost?: BrowserHost, appHost?: AppHost) {
    this.applications = await Applications.open(lifecycle, appHost);
    registerAppTools(this);
    this.machines = machineFor(lifecycle);
    if (this.machines) registerMachineTools(this);
    else {
      this.#browsers = await Browsers.open(
        lifecycle,
        browserHost ??
          new DockerBrowserHost(dirname(lifecycle.store.path), lifecycle.store.ownerId),
      );
      registerBrowserTools(this);
    }
    registerLearningTools(this);
    registerGroupTools(this);
    registerInteractionTools(this);
    registerGoalTools(this);
    this.register("ngertiin.cancel_run", {
      schema: productToolSchemas["ngertiin.cancel_run"],
      resources: () => [],
      execute: async (input, { scope, authorize }) => {
        const { command_id } = input as { command_id: string };
        await authorize();
        return await lifecycle.store.command(
          command_id,
          { operation: "ngertiin.cancel_run", run_id: scope.run_id },
          async () => {
            await authorize();
            return await lifecycle.cancel(scope.run_id);
          },
        );
      },
    });
    registerWorkspaceTools(this);
    registerAttachmentTools(this);
    this.register("ngertiin.read_run_context", {
      schema: z.strictObject({}),
      resources: () => [],
      execute: async (_input, { scope, authorize }) => {
        await authorize();
        const run = await lifecycle.store.get("run", scope.run_id);
        const message = await lifecycle.store.get("message", run.input_message_id);
        return {
          organization_id: run.organization_id,
          actor_id: run.actor_id,
          connection_id: scope.connection_id,
          provider_selection: run.provider_selection,
          agent_id: run.agent_id,
          thread_id: run.thread_id,
          run_id: run.id,
          input: message.text,
          input_message_id: message.id,
          goal_id: run.goal_id,
          routine_id: run.routine_id,
          workspace_id: run.workspace_id,
          ...(await new Attachments(lifecycle).current(run)),
          agent_snapshot: run.agent_snapshot,
          retry_context: run.retry_of_run_id
            ? {
                failed_run_id: run.retry_of_run_id,
                native_tool_receipts: (await lifecycle.store.get("run", run.retry_of_run_id))
                  .native_tools,
                app_receipts: (
                  await lifecycle.store.list("app_effect", { run_id: run.retry_of_run_id })
                ).filter((effect) => effect.run_id === run.retry_of_run_id),
                machine_receipts: (
                  await lifecycle.store.list("machine_operation", { run_id: run.retry_of_run_id })
                ).filter((effect) => effect.run_id === run.retry_of_run_id),
              }
            : null,
          task: run.task_id ? await lifecycle.store.get("peer_task", run.task_id) : null,
        };
      },
    });
    this.register("ngertiin.describe_tools", {
      schema: productToolSchemas["ngertiin.describe_tools"],
      resources: () => [],
      execute: async (input, { authorize }) => {
        await authorize();
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

  static async open(
    lifecycle: Lifecycle,
    completed: (scope: ToolScope, name: string) => void | Promise<void> = () => {},
    browserHost?: BrowserHost,
    appHost?: AppHost,
  ): Promise<ProductTools> {
    const instance = new ProductTools(lifecycle, completed);
    await instance.initialize(lifecycle, browserHost, appHost);
    return instance;
  }
}
