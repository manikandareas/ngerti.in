import { ProcessEventKind, ReplayMode, type SpacesdProcessLike } from "@trycua/cua";
import { z } from "zod";
import { DomainError, type Entity } from "../contracts";
import type { Lifecycle } from "../lifecycle";
import { machineCommand, machineProcessInput } from "./contracts";
import type { CuaMachine } from "./cua";
import type { MachineActor, MachineOperations } from "./operations";

/** Attributed, reconnectable processes; stopping one run never fences the whole machine. */
export class MachineProcesses {
  readonly #handles = new Map<string, SpacesdProcessLike>();
  readonly #stopping = new Set<string>();
  #closed = false;
  readonly #unsubscribe: () => void;
  constructor(
    readonly lifecycle: Lifecycle,
    readonly host: CuaMachine | null,
    readonly operations: MachineOperations,
    readonly generation: () => Promise<number>,
  ) {
    this.#unsubscribe = lifecycle.store.subscribe(async () => {
      for (const process of await this.list()) {
        if (!["running", "starting"].includes(process.state) || this.#stopping.has(process.id))
          continue;
        const run = await lifecycle.store.get("run", process.run_id);
        if (run.cancellation !== "requested" && run.status !== "cancelled") continue;
        this.#stopping.add(process.id);
        void this.stop(process)
          .catch(async () => await this.unknown(process.id))
          .catch(() => {
            if (!this.#closed && !this.lifecycle.store.closed)
              console.error(JSON.stringify({ event: "machine.process_stop_observation_failed" }));
          })
          .finally(() => this.#stopping.delete(process.id));
      }
    });
  }
  async list(actor?: MachineActor) {
    return (await this.lifecycle.store.list("machine_process")).filter(
      (item) =>
        item.machine_id === this.operations.machineId &&
        (!actor || (item.agent_id === actor.agent_id && item.thread_id === actor.thread_id)),
    );
  }
  private hostRequired() {
    if (!this.host) throw new DomainError("MACHINE_UNAVAILABLE", 503);
    return this.host;
  }
  private async current(id: string) {
    return await this.lifecycle.store.get("machine_process", id);
  }
  private async updateLive(
    id: string,
    change: (item: Entity<"machine_process">) => Partial<Entity<"machine_process">> | null,
  ) {
    await this.lifecycle.store.transaction(async () => {
      const current = await this.current(id);
      if (current.state === "exited") return;
      const fields = change(current);
      if (fields) await this.operations.update(current, fields);
    });
  }
  private async unknown(id: string) {
    if (this.#closed || this.lifecycle.store.closed) return;
    await this.updateLive(id, (current) =>
      current.state === "unknown" ? null : { state: "unknown" },
    );
  }
  private async handle(item: Entity<"machine_process">) {
    if (item.generation !== (await await this.generation()))
      throw new DomainError("STALE_DISPATCH");
    const existing = this.#handles.get(item.id);
    if (existing) return existing;
    const client = await this.hostRequired().client();
    const attached = await client.attach(
      undefined,
      item.tag,
      new ReplayMode.FromOffset({ offset: BigInt(item.output_offset) }),
    );
    this.#handles.set(item.id, attached);
    void this.collect(item.id, attached).catch(() => {});
    return attached;
  }
  private async collect(id: string, handle: SpacesdProcessLike) {
    const stdout = new TextDecoder();
    const stderr = new TextDecoder();
    try {
      for (;;) {
        const event = await handle.nextEvent();
        if (this.#closed || this.lifecycle.store.closed) return;
        if (!event) break;
        if (event.kind === ProcessEventKind.Exit) {
          await this.updateLive(id, () => ({
            state: event.exit?.error ? "unknown" : "exited",
            exit_code: event.exit?.code ?? null,
            exit_signal: event.exit?.signal ?? null,
            lost: /lost/i.test(event.exit?.error ?? ""),
          }));
          return;
        }
        const key = event.kind === ProcessEventKind.Stderr ? "stderr" : "stdout";
        const end = event.offset + BigInt(event.data.byteLength);
        await this.updateLive(id, (current) => {
          const seen = BigInt(current.output_offset);
          if (end <= seen) return null;
          const data = new Uint8Array(event.data).subarray(
            Number(seen > event.offset ? seen - event.offset : 0n),
          );
          const text =
            current[key] + (key === "stderr" ? stderr : stdout).decode(data, { stream: true });
          return {
            state: "running",
            [key]: text.slice(-131_072),
            output_offset: String(end),
            output_truncated:
              current.output_truncated || text.length > 131_072 || event.offset > seen,
          };
        });
      }
      await this.unknown(id);
    } catch {
      await this.unknown(id);
    } finally {
      this.#handles.delete(id);
    }
  }
  async execute(raw: unknown, actor: NonNullable<MachineActor>, authorize: () => void) {
    const data = machineCommand.parse(raw);
    await authorize();
    const host = this.hostRequired();
    await this.operations.execute(
      data.command_id,
      await await this.generation(),
      actor,
      "execute",
      data,
      authorize,
      async () => {
        const record = await this.lifecycle.store.put({
          ...this.operations.base(data.command_id),
          kind: "machine_process",
          machine_id: this.operations.machineId,
          generation: await await this.generation(),
          ...actor,
          tag: `ngertiin-${data.command_id}`,
          state: "starting",
          pid: null,
          stdout: "",
          stderr: "",
          output_truncated: false,
          output_offset: "0",
          exit_code: null,
          exit_signal: null,
          lost: false,
        });
        try {
          const handle = await host.spawn(data.command, {
            cwd: data.cwd ? host.files().path(data.cwd) : undefined,
            requestId: data.command_id,
            tag: record.tag,
            pty: data.pty,
            timeoutMs: data.timeout_ms,
          });
          await this.updateLive(record.id, () => ({
            pid: handle.pid(),
            state: "running",
          }));
          this.#handles.set(record.id, handle);
          void this.collect(record.id, handle).catch(() => {});
          return { process_id: record.id };
        } catch (error) {
          await this.unknown(record.id);
          throw error;
        }
      },
    );
    return this.read(data.command_id, actor, data.wait_ms, authorize);
  }
  async read(id: string, actor: MachineActor, waitMs: number, authorize: () => void) {
    await authorize();
    const initial = await this.current(id);
    if (
      initial.machine_id !== this.operations.machineId ||
      (actor && (initial.agent_id !== actor.agent_id || initial.thread_id !== actor.thread_id))
    )
      throw new DomainError("SCOPE_DENIED", 403);
    if (initial.generation !== (await await this.generation()))
      throw new DomainError("STALE_DISPATCH");
    const deadline = Date.now() + waitMs;
    while (
      ["starting", "running"].includes((await this.current(id)).state) &&
      Date.now() < deadline
    )
      await Bun.sleep(Math.min(50, deadline - Date.now()));
    await authorize();
    return await this.current(id);
  }
  private async stop(item: Entity<"machine_process">) {
    const handle = await this.handle(item);
    await handle.signal("term", true);
    // A signal request is not native exit confirmation. The collector records the exit.
  }
  async control(raw: unknown, actor: MachineActor, authorize: () => void) {
    const data = machineProcessInput.parse(raw);
    const item = await this.read(data.process_id, actor, 0, authorize);
    if (data.operation === "read") return this.read(item.id, actor, data.wait_ms, authorize);
    if (item.state === "unknown") throw new DomainError("RECONCILIATION_REQUIRED");
    if (item.state === "exited") return item;
    await this.operations.execute(
      data.command_id,
      await await this.generation(),
      actor,
      `process.${data.operation}`,
      data,
      authorize,
      async () => {
        const handle = await this.handle(item);
        await authorize();
        if (data.operation === "input")
          await handle.writeStdin(new TextEncoder().encode(data.text).buffer);
        else await handle.signal(data.operation === "interrupt" ? "int" : "term", true);
        return { process_id: item.id, requested: data.operation };
      },
    );
    return this.read(item.id, actor, data.wait_ms, authorize);
  }
  async recover() {
    if (!this.host) return;
    for (const item of await this.list()) {
      if (item.state === "exited" || item.generation !== (await await this.generation())) continue;
      try {
        const ledger = z
          .object({
            record: z
              .object({
                state: z.string(),
                end: z
                  .object({ exitCode: z.number().optional(), signal: z.string().optional() })
                  .optional(),
              })
              .passthrough()
              .optional(),
          })
          .parse(await this.host.rpc("ProcessService/GetExecRecord", { requestId: item.id }));
        if (ledger.record?.state === "EXEC_STATE_RUNNING") {
          await this.handle(item);
          await this.updateLive(item.id, () => ({ state: "running" }));
        } else if (ledger.record?.state === "EXEC_STATE_EXITED")
          await this.updateLive(item.id, () => ({
            state: "exited",
            exit_code: ledger.record?.end?.exitCode ?? null,
            exit_signal: ledger.record?.end?.signal ?? null,
          }));
        else
          await this.updateLive(item.id, () => ({
            state: "unknown",
            lost: true,
          }));
        if (
          ledger.record &&
          ["EXEC_STATE_RUNNING", "EXEC_STATE_EXITED"].includes(ledger.record.state)
        ) {
          const operation = await this.lifecycle.store.get("machine_operation", item.id);
          if (operation.name === "execute" && operation.state === "unknown")
            await this.operations.update(operation, {
              state: "succeeded",
              result: { process_id: item.id },
              error_code: null,
              reconciled_at: new Date().toISOString(),
            });
        }
      } catch {
        await this.unknown(item.id);
      }
    }
  }
  async close() {
    this.#closed = true;
    await this.#unsubscribe();
    await Promise.allSettled([...this.#handles.values()].map((handle) => handle.detach()));
    this.#handles.clear();
  }
}
