import { z } from "zod";
import { DomainError, type Entity } from "../contracts";
import { authorizeResponsibilityWork } from "../goals/work-fence";
import type { ToolAccess } from "../harness/tools";
import type { Lifecycle } from "../lifecycle";
import type { MachineConfiguration } from "./config";
import { computerCall, machineControl, machineWindowInput } from "./contracts";
import { CuaMachine, type DriverTool } from "./cua";
import { MachineDesktop } from "./desktop";
import { type MachineActor, MachineOperations } from "./operations";
import { MachineProcesses } from "./processes";

const installations = new WeakMap<Lifecycle, Machines>();
export const machineFor = (lifecycle: Lifecycle) => installations.get(lifecycle);
export const computerTools = new Set([
  "list_apps",
  "list_windows",
  "get_desktop_state",
  "get_window_state",
  "get_accessibility_tree",
  "click",
  "double_click",
  "right_click",
  "drag",
  "scroll",
  "move_cursor",
  "type_text",
  "press_key",
  "hotkey",
  "set_value",
  "bring_to_front",
  "browser_prepare",
  "get_browser_state",
  "browser_navigate",
  "browser_click",
  "browser_type",
  "browser_select",
  "browser_pointer",
  "browser_dialog",
  "browser_set_input_files",
  "browser_download",
]);
const observations = new Set([
  "list_apps",
  "list_windows",
  "get_desktop_state",
  "get_window_state",
  "get_accessibility_tree",
  "get_browser_state",
]);
const noLease = (revision = 0) => ({
  holder: "none" as const,
  agent_id: null,
  run_id: null,
  revision,
  state: "active" as const,
  expires_at: null,
});

/** Shared-machine routing, durable input ownership and upstream capability admission. */
export class Machines {
  readonly host: CuaMachine | null;
  readonly operations: MachineOperations;
  readonly processes: MachineProcesses;
  readonly desktop: MachineDesktop;
  readonly #controlListeners = new Set<() => void | Promise<void>>();
  readonly #revocations = new Set<Promise<void>>();
  #renewedAt = 0;
  #registry: DriverTool[] = [];
  #refresh: Promise<Entity<"machine">> | undefined;
  #refreshedAt = 0;
  #input: Promise<unknown> | undefined;
  #handoff = false;
  #maintenance = false;
  constructor(
    readonly lifecycle: Lifecycle,
    readonly configuration: MachineConfiguration | null,
    host?: CuaMachine,
  ) {
    if (installations.has(lifecycle))
      throw new Error("This application already has a machine module.");
    installations.set(lifecycle, this);
    this.host = host ?? (configuration ? new CuaMachine(configuration) : null);
    this.operations = new MachineOperations(lifecycle, lifecycle.store.ownerId);
    const current = lifecycle.store
      .list("machine")
      .find((item) => item.id === lifecycle.store.ownerId);
    if (
      current &&
      configuration &&
      current.machine_key &&
      (current.machine_key !== configuration.id || current.generation !== configuration.generation)
    )
      throw new Error(
        "The retained machine binding changed. Reconcile it before starting this installation.",
      );
    if (!current)
      lifecycle.store.put({
        ...this.operations.base(lifecycle.store.ownerId),
        kind: "machine",
        machine_key: configuration?.id ?? null,
        generation: configuration?.generation ?? 1,
        state: configuration ? "offline" : "unconfigured",
        root: configuration?.root ?? "/home/cua/workspace",
        service_version: null,
        driver_version: null,
        features: [],
        lease: noLease(),
      });
    else
      this.operations.update(current, {
        machine_key: configuration?.id ?? current.machine_key,
        state: configuration ? "offline" : "unconfigured",
        lease:
          current.lease.holder === "none" ? current.lease : { ...current.lease, state: "unknown" },
      });
    this.processes = new MachineProcesses(
      lifecycle,
      this.host,
      this.operations,
      () => this.snapshot().generation,
    );
    this.desktop = new MachineDesktop(
      lifecycle,
      this.host,
      this.operations,
      () => this.snapshot(),
      (effect) => this.withIdleInput(effect),
    );
  }
  private async withIdleInput(effect: () => Promise<void>): Promise<void> {
    const current = this.snapshot();
    if (
      this.#input ||
      this.#handoff ||
      this.#maintenance ||
      current.state !== "ready" ||
      current.lease.holder !== "none" ||
      current.lease.state !== "active"
    )
      return;
    this.#maintenance = true;
    const pending = Promise.resolve().then(effect);
    this.#input = pending;
    try {
      await pending;
    } catch (error) {
      this.uncertainControl();
      throw error;
    } finally {
      // Cleanup changes desktop geometry. Observations made before or during
      // it must not authorize a later click, even though no agent held input.
      const lease = this.snapshot().lease;
      if (lease.holder === "none" && lease.state === "active")
        this.lease(noLease(lease.revision + 1));
      this.#input = undefined;
      this.#maintenance = false;
    }
  }
  snapshot() {
    return this.lifecycle.store.get("machine", this.operations.machineId);
  }
  onControl(listener: () => void | Promise<void>) {
    this.#controlListeners.add(listener);
    return () => this.#controlListeners.delete(listener);
  }
  private lease(lease: Entity<"machine">["lease"]) {
    const record = this.operations.update(this.snapshot(), { lease });
    for (const listener of this.#controlListeners) {
      const result = listener();
      if (result) {
        this.#revocations.add(result);
        void result
          .catch(() => this.uncertainControl())
          .finally(() => this.#revocations.delete(result));
      }
    }
    return record;
  }
  uncertainControl() {
    if (this.lifecycle.store.closed) return;
    const current = this.snapshot();
    if (current.lease.state !== "unknown") this.lease({ ...current.lease, state: "unknown" });
  }
  renewHuman() {
    const lease = this.snapshot().lease;
    if (
      lease.holder !== "human" ||
      lease.state !== "active" ||
      this.#handoff ||
      Date.now() - this.#renewedAt < 20_000
    )
      return;
    this.#renewedAt = Date.now();
    this.operations.update(this.snapshot(), {
      lease: { ...lease, expires_at: new Date(Date.now() + 60_000).toISOString() },
    });
  }
  private async quiesce() {
    try {
      await Promise.all([...this.#revocations]);
      if (this.snapshot().lease.state === "unknown")
        throw new DomainError("RECONCILIATION_REQUIRED");
    } catch {
      this.uncertainControl();
      throw new DomainError("RECONCILIATION_REQUIRED");
    }
  }
  async expireControl() {
    const lease = this.snapshot().lease;
    if (
      this.#handoff ||
      lease.holder !== "human" ||
      lease.state !== "active" ||
      !lease.expires_at ||
      Date.parse(lease.expires_at) > Date.now()
    )
      return;
    this.#handoff = true;
    try {
      this.lease(noLease(lease.revision + 1));
      await this.quiesce();
    } finally {
      this.#handoff = false;
    }
  }
  async refresh() {
    if (!this.host) return this.snapshot();
    if (this.#refresh) return this.#refresh;
    if (Date.now() - this.#refreshedAt < 3000 && this.snapshot().state === "ready")
      return this.snapshot();
    this.#refresh = (async () => {
      try {
        const capabilities = z
          .object({
            version: z.string(),
            features: z.array(
              z.object({ name: z.string(), supported: z.boolean().default(false) }),
            ),
          })
          .parse(await this.host?.rpc("SystemService/GetCapabilities"));
        const registry = await this.host?.tools();
        if (!registry) throw new DomainError("MACHINE_UNAVAILABLE", 503);
        const features = capabilities.features
          .filter((feature) => feature.supported)
          .map((feature) => feature.name);
        if (!["driver", "pty", "process.exec_ledger"].every((name) => features.includes(name)))
          throw new DomainError("MACHINE_UNAVAILABLE", 503);
        this.#registry = registry.tools.filter((tool) => computerTools.has(tool.name));
        this.#refreshedAt = Date.now();
        const current = this.snapshot();
        if (
          current.state === "ready" &&
          current.service_version === capabilities.version &&
          current.driver_version === registry.contractVersion &&
          JSON.stringify(current.features) === JSON.stringify(features)
        )
          return current;
        return this.operations.update(current, {
          state: "ready",
          service_version: capabilities.version,
          driver_version: registry.contractVersion,
          features,
        });
      } catch {
        const current = this.snapshot();
        if (current.state !== "offline") this.operations.update(current, { state: "offline" });
        if (current.lease.holder !== "none") this.uncertainControl();
        throw new DomainError("MACHINE_UNAVAILABLE", 503);
      } finally {
        this.#refresh = undefined;
      }
    })();
    return this.#refresh;
  }
  async ready() {
    const current = await this.refresh();
    if (!this.host || current.state !== "ready") throw new DomainError("MACHINE_UNAVAILABLE", 503);
    return this.host;
  }
  files() {
    if (!this.host) throw new DomainError("MACHINE_UNAVAILABLE", 503);
    return this.host.files();
  }
  actor(access: ToolAccess): NonNullable<MachineActor> {
    access.authorize();
    authorizeResponsibilityWork(this.lifecycle, access.scope.run_id);
    return {
      agent_id: access.scope.agent_id,
      thread_id: access.scope.thread_id,
      run_id: access.scope.run_id,
    };
  }
  async catalog() {
    await this.ready();
    return this.#registry.map((tool) => {
      const schema = JSON.parse(tool.inputSchemaJson);
      if (schema.properties) delete schema.properties.session;
      if (Array.isArray(schema.required))
        schema.required = schema.required.filter((name: string) => name !== "session");
      return {
        name: tool.name,
        description: tool.description,
        input_schema: schema,
        requires_input_lease: !observations.has(tool.name),
      };
    });
  }
  private acquire(actor: MachineActor) {
    if (this.#handoff || this.#maintenance) throw new DomainError("MACHINE_INPUT_BUSY");
    const current = this.snapshot().lease;
    if (current.state === "unknown") throw new DomainError("RECONCILIATION_REQUIRED");
    if (
      (current.holder === "human" && actor !== null) ||
      (current.holder === "agent" && current.run_id !== actor?.run_id)
    )
      throw new DomainError("MACHINE_INPUT_BUSY");
    if (current.holder === "none")
      return this.lease({
        holder: actor ? "agent" : "human",
        agent_id: actor?.agent_id ?? null,
        run_id: actor?.run_id ?? null,
        revision: current.revision + 1,
        state: "active",
        expires_at: null,
      });
    return this.snapshot();
  }
  async control(raw: unknown, actor: MachineActor, authorize: () => void = () => {}) {
    const data = machineControl.parse(raw);
    await this.ready();
    await this.expireControl();
    authorize();
    const existing = this.lifecycle.store
      .list("machine_operation")
      .find((item) => item.id === data.command_id);
    if (!existing && this.snapshot().lease.revision !== data.expected_revision)
      throw new DomainError("CONFLICT");
    return this.operations.execute(
      data.command_id,
      this.snapshot().generation,
      actor,
      `control.${data.operation}`,
      data,
      authorize,
      async () => {
        if (data.operation === "acquire" && actor === null) {
          this.#handoff = true;
          try {
            await this.#input;
            authorize();
            const lease = this.snapshot().lease;
            if (lease.state === "unknown") throw new DomainError("RECONCILIATION_REQUIRED");
            const record = this.lease({
              holder: "human",
              agent_id: null,
              run_id: null,
              revision: lease.revision + 1,
              state: "active",
              expires_at: new Date(Date.now() + 60_000).toISOString(),
            });
            this.desktop.preserveForHuman();
            await this.quiesce();
            return record;
          } finally {
            this.#handoff = false;
          }
        }
        if (data.operation === "acquire") return this.acquire(actor);
        const lease = this.snapshot().lease;
        if (actor && (lease.holder !== "agent" || lease.run_id !== actor.run_id))
          throw new DomainError("SCOPE_DENIED", 403);
        if (this.#input) throw new DomainError("MACHINE_INPUT_BUSY");
        if (lease.state === "unknown") {
          if (data.operation !== "reconcile") throw new DomainError("RECONCILIATION_REQUIRED");
          const observation = await this.host?.call("get_desktop_state", {
            session: `ngertiin-reconcile-${data.command_id}`,
          });
          if (!observation || observation.isError) throw new DomainError("RECONCILIATION_REQUIRED");
        }
        authorize();
        this.#handoff = true;
        try {
          const record = this.lease(noLease(this.snapshot().lease.revision + 1));
          await this.quiesce();
          return record;
        } finally {
          this.#handoff = false;
        }
      },
    );
  }
  private claimTarget(actor: NonNullable<MachineActor>, targetId: string, tabId: string | null) {
    const existing = this.lifecycle.store
      .list("machine_target")
      .find(
        (item) =>
          item.machine_id === this.operations.machineId &&
          item.generation === this.snapshot().generation &&
          item.active &&
          item.target_id === targetId &&
          item.tab_id === tabId,
      );
    if (existing && existing.run_id !== actor.run_id) throw new DomainError("MACHINE_INPUT_BUSY");
    if (!existing)
      this.lifecycle.store.put({
        ...this.operations.base(),
        kind: "machine_target",
        machine_id: this.operations.machineId,
        generation: this.snapshot().generation,
        agent_id: actor.agent_id,
        run_id: actor.run_id,
        target_id: targetId,
        tab_id: tabId,
        active: true,
      });
  }
  async window(raw: unknown, access: ToolAccess) {
    const data = machineWindowInput.parse(raw);
    const actor = this.actor(access);
    if (data.operation === "list") return { windows: this.desktop.list(actor) };
    if (!data.command_id) throw new DomainError("INVALID_REQUEST", 422);
    if (data.operation === "retain")
      return this.lifecycle.store.command(data.command_id, { actor, ...data }, () => {
        access.authorize();
        return this.desktop.retain(data.resource_id as string, actor);
      });
    await this.ready();
    await this.expireControl();
    return this.operations.execute(
      data.command_id,
      this.snapshot().generation,
      actor,
      `window.${data.operation}`,
      data,
      access.authorize,
      async () => {
        if (this.#input) throw new DomainError("MACHINE_INPUT_BUSY");
        this.acquire(actor);
        const pending = this.desktop.open(
          actor,
          data.operation === "open_browser" ? "browser" : "terminal",
          data.keep_open,
          data.operation === "open_browser" ? data.url : undefined,
          access.authorize,
        );
        this.#input = pending;
        try {
          return await pending;
        } catch (error) {
          this.uncertainControl();
          throw error;
        } finally {
          this.#input = undefined;
        }
      },
    );
  }
  async computer(raw: unknown, access: ToolAccess) {
    const data = computerCall.parse(raw);
    const actor = this.actor(access);
    const host = await this.ready();
    await this.expireControl();
    const definition = this.#registry.find((tool) => tool.name === data.name);
    if (!computerTools.has(data.name) || !definition) throw new DomainError("SCOPE_DENIED", 403);
    const publicArguments = JSON.parse(definition.inputSchemaJson).properties ?? {};
    if (
      Object.keys(data.arguments).some(
        (name) => name.startsWith("_") || name === "session" || !(name in publicArguments),
      )
    )
      throw new DomainError("INVALID_REQUEST", 422);
    if (!observations.has(data.name)) {
      const lease = this.snapshot().lease;
      if (
        this.#handoff ||
        this.#maintenance ||
        lease.holder === "human" ||
        (lease.holder === "agent" && lease.run_id !== actor.run_id)
      )
        throw new DomainError("MACHINE_INPUT_BUSY");
      if (lease.state === "unknown") throw new DomainError("RECONCILIATION_REQUIRED");
      const minimum = lease.holder === "agent" ? lease.revision - 1 : lease.revision;
      const fresh = this.operations
        .list(actor)
        .some(
          (operation) =>
            operation.run_id === actor.run_id &&
            observations.has(operation.name) &&
            operation.state === "succeeded" &&
            (operation.result as { input_revision?: number; isError?: boolean })?.input_revision !==
              undefined &&
            (operation.result as { input_revision: number }).input_revision >= minimum &&
            !(operation.result as { isError?: boolean }).isError,
        );
      if (!fresh) throw new DomainError("RECONCILIATION_REQUIRED");
    }
    if (
      data.name === "browser_prepare" &&
      (data.arguments.allow_launch === true || data.arguments.profile !== undefined)
    )
      throw new DomainError("SCOPE_DENIED", 403);
    const session = `ngertiin-${actor.run_id}`;
    const args: Record<string, unknown> = { ...data.arguments, session };
    return this.operations.execute(
      data.command_id,
      this.snapshot().generation,
      actor,
      data.name,
      data.arguments,
      access.authorize,
      async () => {
        const mutation = !observations.has(data.name);
        if (mutation && this.#input) throw new DomainError("MACHINE_INPUT_BUSY");
        if (mutation) this.acquire(actor);
        if (mutation && typeof args.target_id === "string")
          this.claimTarget(
            actor,
            args.target_id,
            typeof args.tab_id === "string" ? args.tab_id : null,
          );
        const effect = (async () => {
          access.authorize();
          const inputRevision = this.snapshot().lease.revision;
          const started = await host.call("start_session", { session });
          if (started.isError) throw new DomainError("MACHINE_UNAVAILABLE", 503);
          access.authorize();
          const result = await host.call(data.name, args);
          if (result.structuredJson) {
            const structured = JSON.parse(result.structuredJson);
            if (structured.status === "refused") result.isError = true;
          }
          if (JSON.stringify(result).length > 8 * 1024 * 1024)
            throw new DomainError("MACHINE_UNKNOWN");
          return {
            ...result,
            input_revision: inputRevision,
            content: result.content.map((part) =>
              part.image
                ? { type: "image", data: part.image.data, mimeType: part.image.mimeType }
                : { type: "text", text: part.text ?? part.json ?? "" },
            ),
          };
        })();
        if (!mutation) return effect;
        this.#input = effect;
        try {
          return await effect;
        } catch (error) {
          const lease = this.snapshot().lease;
          this.lease({ ...lease, state: "unknown" });
          throw error;
        } finally {
          this.#input = undefined;
        }
      },
      (result) => ({ ...result, content: result.content.filter((part) => part.type !== "image") }),
    );
  }
  async releaseRun(runId: string) {
    if (this.lifecycle.store.closed) return;
    if (this.snapshot().lease.run_id === runId) await this.#input?.catch(() => {});
    if (this.host)
      await this.host.call("end_session", { session: `ngertiin-${runId}` }).catch(() => {});
    if (this.lifecycle.store.closed) return;
    const current = this.snapshot();
    if (current.lease.run_id === runId && current.lease.state === "active")
      this.lease(noLease(current.lease.revision + 1));
    for (const target of this.lifecycle.store.list("machine_target"))
      if (target.run_id === runId && target.active)
        this.operations.update(target, { active: false });
  }
  assertViewer(revision: number, interactive: boolean) {
    const current = this.snapshot();
    if (
      current.state !== "ready" ||
      (interactive &&
        (this.#handoff ||
          current.lease.holder !== "human" ||
          current.lease.state !== "active" ||
          current.lease.revision !== revision ||
          (!!current.lease.expires_at && Date.parse(current.lease.expires_at) <= Date.now())))
    )
      throw new DomainError("SCOPE_DENIED", 403);
    return current;
  }
  async recover() {
    await this.refresh()
      .then(() => this.processes.recover())
      .catch(() => {});
  }
  async close() {
    await this.desktop.close();
    await this.#input?.catch(() => {});
    await this.processes.close();
    installations.delete(this.lifecycle);
  }
}
