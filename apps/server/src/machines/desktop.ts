import { z } from "zod";
import { DomainError, type Entity } from "../contracts";
import type { Lifecycle } from "../lifecycle";
import { asyncFilter } from "../persistence/async-collections";
import type { CuaMachine } from "./cua";
import type { MachineActor, MachineOperations } from "./operations";

const nativeWindow = z.object({
  ref: z.object({ id: z.string(), epoch: z.string() }),
  app: z.object({ pid: z.int().positive(), name: z.string() }),
  kind: z.string(),
});
const windowList = z.object({ windows: z.array(nativeWindow).default([]) });
type NativeWindow = z.infer<typeof nativeWindow>;
type ManagedWindow = Entity<"machine_window">;
type Actor = NonNullable<MachineActor>;

/** Only explicitly created task windows are disposable. Existing windows are never adopted. */
export class MachineDesktop {
  #closed = false;
  #dirty = false;
  #pending!: Promise<void> | undefined;
  #timer!: ReturnType<typeof setTimeout> | undefined;
  #unsubscribe!: () => void;
  private constructor(
    readonly lifecycle: Lifecycle,
    readonly host: CuaMachine | null,
    readonly operations: MachineOperations,
    readonly snapshot: () => Promise<Entity<"machine">>,
    readonly idleInput: (effect: () => Promise<void>) => Promise<void>,
  ) {}
  async taskKey(runId: string): Promise<string> {
    const run = await this.lifecycle.store.get("run", runId);
    return run.task_id
      ? (await this.lifecycle.store.get("peer_task", run.task_id)).root_task_id
      : run.id;
  }
  async list(actor?: Actor): Promise<ManagedWindow[]> {
    return await asyncFilter(
      await this.lifecycle.store.list("machine_window"),
      async (item) =>
        item.machine_id === this.operations.machineId &&
        (!actor ||
          (item.thread_id === actor.thread_id &&
            item.task_key === (await this.taskKey(actor.run_id)))),
    );
  }
  async retain(resourceId: string, actor: Actor): Promise<ManagedWindow> {
    const item = (await this.list(actor)).find((item) => item.id === resourceId);
    if (item?.state !== "open") throw new DomainError("SCOPE_DENIED", 403);
    return item.keep_open ? item : await this.operations.update(item, { keep_open: true });
  }
  /** Human input cannot be attributed to a particular tab; preserve potentially edited work. */
  async preserveForHuman(): Promise<void> {
    for (const item of await this.list())
      if (item.state === "open" && !item.keep_open)
        await this.operations.update(item, { keep_open: true });
  }
  private async listNativeWindows(): Promise<NativeWindow[]> {
    if (!this.host) throw new DomainError("MACHINE_UNAVAILABLE", 503);
    return windowList.parse(
      await this.host.rpc("WindowsService/ListWindows", { filter: { includeSystem: false } }),
    ).windows;
  }
  async open(
    actor: Actor,
    application: "browser" | "terminal",
    keepOpen: boolean,
    url: string | undefined,
    authorize: () => void,
  ): Promise<ManagedWindow> {
    if (!this.host) throw new DomainError("MACHINE_UNAVAILABLE", 503);
    const before = new Set((await this.listNativeWindows()).map((item) => item.ref.id));
    await authorize();
    let item: ManagedWindow = await this.lifecycle.store.put({
      ...this.operations.base(),
      kind: "machine_window",
      machine_id: this.operations.machineId,
      generation: (await this.snapshot()).generation,
      ...actor,
      task_key: await this.taskKey(actor.run_id),
      application,
      native_ref: null,
      pid: null,
      keep_open: keepOpen,
      state: "opening",
      close_operation_id: crypto.randomUUID(),
      error_code: null,
    });
    try {
      await authorize();
      // Fixed executable/argv, retained profile and native opaque window handles.
      // No shell command, raw CDP endpoint or arbitrary application launcher is exposed.
      await this.host.rpc("WindowsService/LaunchApp", {
        app: {
          executable:
            application === "browser" ? "/opt/cua/bin/cua-chromium" : "/usr/bin/xfce4-terminal",
        },
        args:
          application === "browser"
            ? [
                "--user-data-dir=/home/cua/.config/ngertiin-browser",
                "--remote-debugging-port=9222",
                "--no-first-run",
                "--no-default-browser-check",
                "--new-window",
                url as string,
              ]
            : ["--disable-server", `--default-working-directory=${this.host.configuration.root}`],
        delivery: "DELIVERY_FOREGROUND",
        waitForWindow: "5s",
      });
      // A retained Chromium process opens the new window on its existing PID;
      // LaunchApp's short-lived launcher PID may therefore return no windows.
      const created = (await this.listNativeWindows()).filter(
        (window) =>
          window.kind === "WINDOW_KIND_STANDARD" &&
          !before.has(window.ref.id) &&
          (application === "browser" ? /chromium/i : /terminal/i).test(window.app.name),
      );
      if (created.length !== 1) throw new DomainError("RECONCILIATION_REQUIRED");
      const window = created[0] as NativeWindow;
      item = await this.operations.update(item, {
        state: "open",
        native_ref: window.ref,
        pid: window.app.pid,
      });
      return item;
    } catch (error) {
      await this.operations.update(item, {
        state: "unknown",
        error_code: "RECONCILIATION_REQUIRED",
      });
      throw error;
    }
  }
  private async isTaskComplete(item: ManagedWindow): Promise<boolean> {
    const store = this.lifecycle.store;
    const runs = await asyncFilter(
      await store.list("run"),
      async (run) => (await this.taskKey(run.id)) === item.task_key,
    );
    if (!runs.length || runs.some((run) => run.status !== "succeeded")) return false;
    if (
      (await store.list("peer_task")).some(
        (task) => task.root_task_id === item.task_key && task.state !== "completed",
      )
    )
      return false;
    const runIds = new Set(runs.map((run) => run.id));
    if (
      (await store.list("machine_operation")).some(
        (operation) =>
          operation.run_id &&
          runIds.has(operation.run_id) &&
          ["dispatched", "unknown"].includes(operation.state),
      )
    )
      return false;
    return !(await store.list("machine_process")).some(
      (process) => runIds.has(process.run_id) && process.state !== "exited",
    );
  }
  private async authorizeCleanup(item: ManagedWindow): Promise<void> {
    const machine = await this.snapshot();
    const current = await this.lifecycle.store.get("machine_window", item.id);
    if (
      this.#closed ||
      machine.state !== "ready" ||
      machine.generation !== item.generation ||
      machine.lease.holder !== "none" ||
      machine.lease.state !== "active" ||
      current.keep_open ||
      !["open", "closing"].includes(current.state) ||
      !(await this.isTaskComplete(current))
    )
      throw new DomainError("MACHINE_INPUT_BUSY");
  }
  private async closeTemporaryWindow(item: ManagedWindow): Promise<void> {
    const host = this.host;
    if (!host) return;
    await this.authorizeCleanup(item);
    const window = (await this.listNativeWindows()).find(
      (window) =>
        window.ref.id === item.native_ref?.id && window.ref.epoch === item.native_ref.epoch,
    );
    if (!window) {
      const changed = (await this.listNativeWindows()).some(
        (candidate) => candidate.app.pid === item.pid,
      );
      await this.operations.update(item, {
        state: changed ? "unknown" : "closed",
        error_code: changed ? "RECONCILIATION_REQUIRED" : null,
      });
      return;
    }
    if (window.app.pid !== item.pid) {
      await this.operations.update(item, {
        state: "unknown",
        error_code: "RECONCILIATION_REQUIRED",
      });
      return;
    }
    await this.authorizeCleanup(item);
    item = await this.operations.update(item, { state: "closing" });
    try {
      const result = (await this.operations.execute(
        item.close_operation_id,
        item.generation,
        null,
        "window.cleanup",
        { resource_id: item.id, window: item.native_ref },
        async () => await this.authorizeCleanup(item),
        async () =>
          host.rpc("WindowsService/CloseWindow", { window: item.native_ref, force: false }),
      )) as { closed?: boolean };
      await this.operations.update(await this.lifecycle.store.get("machine_window", item.id), {
        state: result.closed ? "closed" : "blocked",
        error_code: result.closed ? null : "WINDOW_CLOSE_BLOCKED",
      });
    } catch (error) {
      await this.operations.update(await this.lifecycle.store.get("machine_window", item.id), {
        state: "unknown",
        error_code: "RECONCILIATION_REQUIRED",
      });
      throw error;
    }
  }
  private schedule(): void {
    if (this.#closed) return;
    this.#dirty = true;
    if (this.#pending || this.#timer) return;
    this.#timer = setTimeout(async () => {
      this.#timer = undefined;
      void this.idle().catch(() => {});
    }, 0);
    this.#timer.unref();
  }
  async idle(): Promise<void> {
    if (this.#timer) clearTimeout(this.#timer);
    this.#timer = undefined;
    if (this.#pending) return this.#pending;
    this.#dirty = true;
    this.#pending = (async () => {
      while (this.#dirty && !this.#closed && !this.lifecycle.store.closed) {
        this.#dirty = false;
        for (const item of await this.list()) {
          if (item.state !== "open" || item.keep_open || !(await this.isTaskComplete(item)))
            continue;
          await this.idleInput(async () => this.closeTemporaryWindow(item)).catch(() => {});
        }
      }
    })().finally(() => {
      this.#pending = undefined;
    });
    return this.#pending;
  }
  async close(): Promise<void> {
    this.#closed = true;
    await this.#unsubscribe();
    if (this.#timer) clearTimeout(this.#timer);
    await this.#pending;
  }

  private async initialize(lifecycle: Lifecycle, operations: MachineOperations) {
    for (const item of await this.list())
      if (["opening", "closing"].includes(item.state))
        await operations.update(item, { state: "unknown", error_code: "RECONCILIATION_REQUIRED" });
    this.#unsubscribe = lifecycle.store.subscribe(async () => await this.schedule());
  }

  static async open(
    lifecycle: Lifecycle,
    host: CuaMachine | null,
    operations: MachineOperations,
    snapshot: () => Promise<Entity<"machine">>,
    idleInput: (effect: () => Promise<void>) => Promise<void>,
  ): Promise<MachineDesktop> {
    const instance = new MachineDesktop(lifecycle, host, operations, snapshot, idleInput);
    await instance.initialize(lifecycle, operations);
    return instance;
  }
}
