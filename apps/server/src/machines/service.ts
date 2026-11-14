import { z } from "zod";
import { DomainError, type Entity } from "../contracts";
import { authorizeResponsibilityWork } from "../goals/work-fence";
import type { ToolAccess } from "../harness/tools";
import type { Lifecycle } from "../lifecycle";
import { asyncFind } from "../persistence/async-collections";
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
  host!: CuaMachine | null;
  operations!: MachineOperations;
  processes!: MachineProcesses;
  desktop!: MachineDesktop;
  readonly #controlListeners = new Set<() => void | Promise<void>>();
  readonly #revocations = new Set<Promise<void>>();
  #renewedAt = 0;
  #registry: DriverTool[] = [];
  #refresh!: Promise<Entity<"machine">> | undefined;
  #refreshedAt = 0;
  #input!: Promise<unknown> | undefined;
  #handoff = false;
  #maintenance = false;
  private constructor(
    readonly lifecycle: Lifecycle,
    readonly configuration: MachineConfiguration | null,
  ) {}
  private async withIdleInput(effect: () => Promise<void>): Promise<void> {
    const current = await this.snapshot();
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
    // Human takeover must wait for the persisted observation fence as well as
    // the native effect, or cleanup could overwrite the newly granted lease.
    const pending = Promise.resolve().then(async () => {
      try {
        await effect();
      } catch (error) {
        await this.uncertainControl();
        throw error;
      } finally {
        try {
          // Cleanup changes desktop geometry. Observations made before or during
          // it must not authorize a later click, even though no agent held input.
          const lease = (await this.snapshot()).lease;
          if (lease.holder === "none" && lease.state === "active")
            await this.lease(noLease(lease.revision + 1));
        } finally {
          this.#input = undefined;
          this.#maintenance = false;
        }
      }
    });
    this.#input = pending;
    await pending;
  }
  async snapshot() {
    return await this.lifecycle.store.get("machine", this.operations.machineId);
  }
  onControl(listener: () => void | Promise<void>) {
    this.#controlListeners.add(listener);
    return () => this.#controlListeners.delete(listener);
  }
  private async lease(lease: Entity<"machine">["lease"]) {
    const record = await this.lifecycle.store.transaction(async () =>
      this.operations.update(await this.snapshot(), { lease }),
    );
    for (const listener of this.#controlListeners) {
      const result = listener();
      if (result) {
        this.#revocations.add(result);
        void result
          .catch(async () => await this.uncertainControl())
          .finally(() => this.#revocations.delete(result));
      }
    }
    return record;
  }
  async uncertainControl() {
    if (this.lifecycle.store.closed) return;
    const current = await this.snapshot();
    if (current.lease.state !== "unknown") await this.lease({ ...current.lease, state: "unknown" });
  }
  async renewHuman() {
    const lease = (await this.snapshot()).lease;
    if (
      lease.holder !== "human" ||
      lease.state !== "active" ||
      this.#handoff ||
      Date.now() - this.#renewedAt < 20_000
    )
      return;
    this.#renewedAt = Date.now();
    await this.operations.update(await this.snapshot(), {
      lease: { ...lease, expires_at: new Date(Date.now() + 60_000).toISOString() },
    });
  }
  private async quiesce() {
    try {
      await Promise.all([...this.#revocations]);
      if ((await this.snapshot()).lease.state === "unknown")
        throw new DomainError("RECONCILIATION_REQUIRED");
    } catch {
      await this.uncertainControl();
      throw new DomainError("RECONCILIATION_REQUIRED");
    }
  }
  async expireControl() {
    const lease = (await this.snapshot()).lease;
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
      await this.lease(noLease(lease.revision + 1));
      await this.quiesce();
    } finally {
      this.#handoff = false;
    }
  }
  async refresh() {
    if (!this.host) return await this.snapshot();
    if (this.#refresh) return this.#refresh;
    if (Date.now() - this.#refreshedAt < 3000 && (await this.snapshot()).state === "ready")
      return await this.snapshot();
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
        const current = await this.snapshot();
        if (
          current.state === "ready" &&
          current.service_version === capabilities.version &&
          current.driver_version === registry.contractVersion &&
          JSON.stringify(current.features) === JSON.stringify(features)
        )
          return current;
        return await this.operations.update(current, {
          state: "ready",
          service_version: capabilities.version,
          driver_version: registry.contractVersion,
          features,
          error_code: null,
        });
      } catch (error) {
        const current = await this.snapshot();
        if (current.state !== "offline")
          await this.operations.update(current, {
            state: "offline",
            error_code: error instanceof DomainError ? error.code : "MACHINE_UNAVAILABLE",
          });
        if (current.lease.holder !== "none") await this.uncertainControl();
        throw error instanceof DomainError ? error : new DomainError("MACHINE_UNAVAILABLE", 503);
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
  async actor(access: ToolAccess): Promise<NonNullable<MachineActor>> {
    await access.authorize();
    await authorizeResponsibilityWork(this.lifecycle, access.scope.run_id);
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
  private async acquire(actor: MachineActor) {
    if (this.#handoff || this.#maintenance) throw new DomainError("MACHINE_INPUT_BUSY");
    const current = (await this.snapshot()).lease;
    if (current.state === "unknown") throw new DomainError("RECONCILIATION_REQUIRED");
    if (
      (current.holder === "human" && actor !== null) ||
      (current.holder === "agent" && current.run_id !== actor?.run_id)
    )
      throw new DomainError("MACHINE_INPUT_BUSY");
    if (current.holder === "none")
      return await this.lease({
        holder: actor ? "agent" : "human",
        agent_id: actor?.agent_id ?? null,
        run_id: actor?.run_id ?? null,
        revision: current.revision + 1,
        state: "active",
        expires_at: null,
      });
    return await this.snapshot();
  }
  async control(
    raw: unknown,
    actor: MachineActor,
    authorize: () => unknown = () => {},
    sessionId?: string,
  ) {
    const data = machineControl.parse(raw);
    await this.ready();
    await this.expireControl();
    await authorize();
    const existing = (await this.lifecycle.store.list("machine_operation")).find(
      (item) => item.id === data.command_id,
    );
    if (!existing && (await this.snapshot()).lease.revision !== data.expected_revision)
      throw new DomainError("CONFLICT");
    return this.operations.execute(
      data.command_id,
      (await this.snapshot()).generation,
      actor,
      `control.${data.operation}`,
      { ...data, session_id: sessionId ?? null },
      authorize,
      async () => {
        if (this.#handoff) throw new DomainError("MACHINE_INPUT_BUSY");
        if (data.operation === "acquire" && actor === null) {
          this.#handoff = true;
          try {
            await this.#input;
            await authorize();
            const lease = (await this.snapshot()).lease;
            if (lease.state === "unknown") throw new DomainError("RECONCILIATION_REQUIRED");
            const record = await this.lease({
              holder: "human",
              agent_id: null,
              run_id: null,
              revision: lease.revision + 1,
              state: "active",
              expires_at: new Date(Date.now() + 60_000).toISOString(),
              session_id: sessionId ?? null,
            });
            await this.desktop.preserveForHuman();
            await this.quiesce();
            return record;
          } finally {
            this.#handoff = false;
          }
        }
        if (data.operation === "acquire") return await this.acquire(actor);
        const lease = (await this.snapshot()).lease;
        if (
          !actor &&
          lease.holder === "human" &&
          lease.session_id &&
          lease.session_id !== sessionId
        )
          throw new DomainError("SCOPE_DENIED", 403);
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
        await authorize();
        this.#handoff = true;
        try {
          const record = await this.lease(noLease((await this.snapshot()).lease.revision + 1));
          await this.quiesce();
          return record;
        } finally {
          this.#handoff = false;
        }
      },
    );
  }
  private async claimTarget(
    actor: NonNullable<MachineActor>,
    targetId: string,
    tabId: string | null,
  ) {
    const existing = await asyncFind(
      await this.lifecycle.store.list("machine_target"),
      async (item) =>
        item.machine_id === this.operations.machineId &&
        item.generation === (await this.snapshot()).generation &&
        item.active &&
        item.target_id === targetId &&
        item.tab_id === tabId,
    );
    if (existing && existing.run_id !== actor.run_id) throw new DomainError("MACHINE_INPUT_BUSY");
    if (!existing)
      await this.lifecycle.store.put({
        ...this.operations.base(),
        kind: "machine_target",
        machine_id: this.operations.machineId,
        generation: (await this.snapshot()).generation,
        agent_id: actor.agent_id,
        run_id: actor.run_id,
        target_id: targetId,
        tab_id: tabId,
        active: true,
      });
  }
  async window(raw: unknown, access: ToolAccess) {
    const data = machineWindowInput.parse(raw);
    const actor = await this.actor(access);
    if (data.operation === "list") return { windows: await this.desktop.list(actor) };
    if (!data.command_id) throw new DomainError("INVALID_REQUEST", 422);
    if (data.operation === "retain")
      return await this.lifecycle.store.command(data.command_id, { actor, ...data }, async () => {
        await access.authorize();
        return await this.desktop.retain(data.resource_id as string, actor);
      });
    await this.ready();
    await this.expireControl();
    return this.operations.execute(
      data.command_id,
      (await this.snapshot()).generation,
      actor,
      `window.${data.operation}`,
      data,
      access.authorize,
      async () => {
        if (this.#input) throw new DomainError("MACHINE_INPUT_BUSY");
        await this.acquire(actor);
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
          await this.uncertainControl();
          throw error;
        } finally {
          this.#input = undefined;
        }
      },
    );
  }
  async computer(raw: unknown, access: ToolAccess) {
    const data = computerCall.parse(raw);
    const actor = await this.actor(access);
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
      const lease = (await this.snapshot()).lease;
      if (
        this.#handoff ||
        this.#maintenance ||
        lease.holder === "human" ||
        (lease.holder === "agent" && lease.run_id !== actor.run_id)
      )
        throw new DomainError("MACHINE_INPUT_BUSY");
      if (lease.state === "unknown") throw new DomainError("RECONCILIATION_REQUIRED");
      const minimum = lease.holder === "agent" ? lease.revision - 1 : lease.revision;
      const fresh = (await this.operations.list(actor)).some(
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
      (await this.snapshot()).generation,
      actor,
      data.name,
      data.arguments,
      access.authorize,
      async () => {
        const mutation = !observations.has(data.name);
        if (mutation && this.#input) throw new DomainError("MACHINE_INPUT_BUSY");
        if (mutation) await this.acquire(actor);
        if (mutation && typeof args.target_id === "string")
          await this.claimTarget(
            actor,
            args.target_id,
            typeof args.tab_id === "string" ? args.tab_id : null,
          );
        const effect = (async () => {
          await access.authorize();
          const inputRevision = (await this.snapshot()).lease.revision;
          const started = await host.call("start_session", { session });
          if (started.isError) throw new DomainError("MACHINE_UNAVAILABLE", 503);
          await access.authorize();
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
          const lease = (await this.snapshot()).lease;
          await this.lease({ ...lease, state: "unknown" });
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
    if ((await this.snapshot()).lease.run_id === runId) await this.#input?.catch(() => {});
    if (this.host)
      await this.host.call("end_session", { session: `ngertiin-${runId}` }).catch(() => {});
    if (this.lifecycle.store.closed) return;
    const current = await this.snapshot();
    if (current.lease.run_id === runId && current.lease.state === "active")
      await this.lease(noLease(current.lease.revision + 1));
    for (const target of await this.lifecycle.store.list("machine_target"))
      if (target.run_id === runId && target.active)
        await this.operations.update(target, { active: false });
  }
  async assertViewer(revision: number, interactive: boolean, sessionId?: string) {
    const current = await this.snapshot();
    if (
      current.state !== "ready" ||
      (interactive &&
        (this.#handoff ||
          current.lease.holder !== "human" ||
          current.lease.state !== "active" ||
          current.lease.revision !== revision ||
          (!!current.lease.session_id && current.lease.session_id !== sessionId) ||
          (!!current.lease.expires_at && Date.parse(current.lease.expires_at) <= Date.now())))
    )
      throw new DomainError("SCOPE_DENIED", 403);
    return current;
  }
  async recover() {
    await this.refresh()
      .then(async () => this.processes.recover())
      .catch(() => {});
  }
  async close() {
    await this.desktop.close().catch(() => {});
    await this.#input?.catch(() => {});
    await this.processes.close();
    installations.delete(this.lifecycle);
  }

  private async initialize(
    lifecycle: Lifecycle,
    configuration: MachineConfiguration | null,
    host?: CuaMachine,
    machineId = lifecycle.store.ownerId,
  ) {
    if (installations.has(lifecycle))
      throw new Error("This application already has a machine module.");
    installations.set(lifecycle, this);
    const legacyMapped =
      !lifecycle.store.dataContext && (await lifecycle.store.legacyScopeMapped());
    this.host = legacyMapped
      ? null
      : (host ?? (configuration ? new CuaMachine(configuration) : null));
    this.operations = await MachineOperations.open(lifecycle, machineId);
    const current = (await lifecycle.store.list("machine")).find((item) => item.id === machineId);
    if (
      current &&
      configuration &&
      current.machine_key &&
      (current.machine_key !== configuration.id || current.generation !== configuration.generation)
    )
      throw new Error(
        "The retained machine binding changed. Reconcile it before starting this installation.",
      );
    if (!current && !legacyMapped)
      await lifecycle.store.put({
        ...this.operations.base(machineId),
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
    else if (current)
      await this.operations.update(current, {
        machine_key: configuration?.id ?? current.machine_key,
        state: configuration ? "offline" : "unconfigured",
        lease:
          current.lease.holder === "none" ? current.lease : { ...current.lease, state: "unknown" },
      });
    this.processes = new MachineProcesses(
      lifecycle,
      this.host,
      this.operations,
      async () => (await this.snapshot()).generation,
    );
    this.desktop = await MachineDesktop.open(
      lifecycle,
      this.host,
      this.operations,
      async () => await this.snapshot(),
      async (effect) => this.withIdleInput(effect),
    );
  }

  static async open(
    lifecycle: Lifecycle,
    configuration: MachineConfiguration | null,
    host?: CuaMachine,
    machineId = lifecycle.store.ownerId,
  ): Promise<Machines> {
    const instance = new Machines(lifecycle, configuration);
    await instance.initialize(lifecycle, configuration, host, machineId);
    return instance;
  }
}
