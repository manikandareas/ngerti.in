import { z } from "zod";
import { DomainError, type Entity } from "../contracts";
import type { Lifecycle } from "../lifecycle";
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
  #pending: Promise<void> | undefined;
  #timer: ReturnType<typeof setTimeout> | undefined;
  readonly #unsubscribe: () => void;
  constructor(
    readonly lifecycle: Lifecycle,
    readonly host: CuaMachine | null,
    readonly operations: MachineOperations,
    readonly snapshot: () => Entity<"machine">,
    readonly idleInput: (effect: () => Promise<void>) => Promise<void>,
  ) {
    for (const item of this.list())
      if (["opening", "closing"].includes(item.state))
        operations.update(item, { state: "unknown", error_code: "RECONCILIATION_REQUIRED" });
    this.#unsubscribe = lifecycle.store.subscribe(() => this.schedule());
  }
  taskKey(runId: string): string {
    const run = this.lifecycle.store.get("run", runId);
    return run.task_id ? this.lifecycle.store.get("peer_task", run.task_id).root_task_id : run.id;
  }
  list(actor?: Actor): ManagedWindow[] {
    return this.lifecycle.store
      .list("machine_window")
      .filter(
        (item) =>
          item.machine_id === this.operations.machineId &&
          (!actor ||
            (item.thread_id === actor.thread_id && item.task_key === this.taskKey(actor.run_id))),
      );
  }
  retain(resourceId: string, actor: Actor): ManagedWindow {
    const item = this.list(actor).find((item) => item.id === resourceId);
    if (item?.state !== "open") throw new DomainError("SCOPE_DENIED", 403);
    return item.keep_open ? item : this.operations.update(item, { keep_open: true });
  }
  /** Human input cannot be attributed to a particular tab; preserve potentially edited work. */
  preserveForHuman(): void {
    for (const item of this.list())
      if (item.state === "open" && !item.keep_open)
        this.operations.update(item, { keep_open: true });
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
    authorize();
    let item: ManagedWindow = this.lifecycle.store.put({
      ...this.operations.base(),
      kind: "machine_window",
      machine_id: this.operations.machineId,
      generation: this.snapshot().generation,
      ...actor,
      task_key: this.taskKey(actor.run_id),
      application,
      native_ref: null,
      pid: null,
      keep_open: keepOpen,
      state: "opening",
      close_operation_id: crypto.randomUUID(),
      error_code: null,
    });
    try {
      authorize();
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
      item = this.operations.update(item, {
        state: "open",
        native_ref: window.ref,
        pid: window.app.pid,
      });
      return item;
    } catch (error) {
      this.operations.update(item, { state: "unknown", error_code: "RECONCILIATION_REQUIRED" });
      throw error;
    }
  }
  private isTaskComplete(item: ManagedWindow): boolean {
    const store = this.lifecycle.store;
    const runs = store.list("run").filter((run) => this.taskKey(run.id) === item.task_key);
    if (!runs.length || runs.some((run) => run.status !== "succeeded")) return false;
    if (
      store
        .list("peer_task")
        .some((task) => task.root_task_id === item.task_key && task.state !== "completed")
    )
      return false;
    const runIds = new Set(runs.map((run) => run.id));
    if (
      store
        .list("machine_operation")
        .some(
          (operation) =>
            operation.run_id &&
            runIds.has(operation.run_id) &&
            ["dispatched", "unknown"].includes(operation.state),
        )
    )
      return false;
    return !store
      .list("machine_process")
      .some((process) => runIds.has(process.run_id) && process.state !== "exited");
  }
  private authorizeCleanup(item: ManagedWindow): void {
    const machine = this.snapshot();
    const current = this.lifecycle.store.get("machine_window", item.id);
    if (
      this.#closed ||
      machine.state !== "ready" ||
      machine.generation !== item.generation ||
      machine.lease.holder !== "none" ||
      machine.lease.state !== "active" ||
      current.keep_open ||
      !["open", "closing"].includes(current.state) ||
      !this.isTaskComplete(current)
    )
      throw new DomainError("MACHINE_INPUT_BUSY");
  }
  private async closeTemporaryWindow(item: ManagedWindow): Promise<void> {
    const host = this.host;
    if (!host) return;
    this.authorizeCleanup(item);
    const window = (await this.listNativeWindows()).find(
      (window) =>
        window.ref.id === item.native_ref?.id && window.ref.epoch === item.native_ref.epoch,
    );
    if (!window) {
      const changed = (await this.listNativeWindows()).some(
        (candidate) => candidate.app.pid === item.pid,
      );
      this.operations.update(item, {
        state: changed ? "unknown" : "closed",
        error_code: changed ? "RECONCILIATION_REQUIRED" : null,
      });
      return;
    }
    if (window.app.pid !== item.pid) {
      this.operations.update(item, { state: "unknown", error_code: "RECONCILIATION_REQUIRED" });
      return;
    }
    this.authorizeCleanup(item);
    item = this.operations.update(item, { state: "closing" });
    try {
      const result = (await this.operations.execute(
        item.close_operation_id,
        item.generation,
        null,
        "window.cleanup",
        { resource_id: item.id, window: item.native_ref },
        () => this.authorizeCleanup(item),
        () => host.rpc("WindowsService/CloseWindow", { window: item.native_ref, force: false }),
      )) as { closed?: boolean };
      this.operations.update(this.lifecycle.store.get("machine_window", item.id), {
        state: result.closed ? "closed" : "blocked",
        error_code: result.closed ? null : "WINDOW_CLOSE_BLOCKED",
      });
    } catch (error) {
      this.operations.update(this.lifecycle.store.get("machine_window", item.id), {
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
    this.#timer = setTimeout(() => {
      this.#timer = undefined;
      void this.idle();
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
        for (const item of this.list()) {
          if (item.state !== "open" || item.keep_open || !this.isTaskComplete(item)) continue;
          await this.idleInput(() => this.closeTemporaryWindow(item)).catch(() => {});
        }
      }
    })().finally(() => {
      this.#pending = undefined;
    });
    return this.#pending;
  }
  async close(): Promise<void> {
    this.#closed = true;
    this.#unsubscribe();
    if (this.#timer) clearTimeout(this.#timer);
    await this.#pending;
  }
}
