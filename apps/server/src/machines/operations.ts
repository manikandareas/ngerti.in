import { createHash } from "node:crypto";
import { DomainError, type Entity, errorCodes } from "../contracts";
import type { Lifecycle } from "../lifecycle";
import { canonical } from "../store";

export type MachineActor = { agent_id: string; thread_id: string; run_id: string } | null;
export class MachineEffectRefused extends DomainError {}

/** Durable dispatch-before-effect receipts. No remote call runs inside a database transaction. */
export class MachineOperations {
  readonly #pending = new Map<string, { fingerprint: string; promise: Promise<unknown> }>();
  readonly #paths = new Set<string>();
  private constructor(
    readonly lifecycle: Lifecycle,
    readonly machineId: string,
  ) {}
  async update<T extends Entity>(entity: T, fields: Partial<T>): Promise<T> {
    return await this.lifecycle.store.put(
      { ...entity, ...fields, revision: entity.revision + 1, updated_at: new Date().toISOString() },
      entity.revision,
    );
  }
  base(id: string = crypto.randomUUID()) {
    const now = new Date().toISOString();
    return {
      id,
      owner_id: this.lifecycle.store.ownerId,
      revision: 1,
      created_at: now,
      updated_at: now,
    };
  }
  async list(actor?: MachineActor) {
    return (await this.lifecycle.store.list("machine_operation"))
      .filter(
        (item) =>
          item.machine_id === this.machineId &&
          (!actor || (item.agent_id === actor.agent_id && item.thread_id === actor.thread_id)),
      )
      .slice(-200);
  }
  async path<T>(path: string, effect: () => Promise<T>): Promise<T> {
    if (this.#paths.has(path)) throw new DomainError("CONFLICT");
    this.#paths.add(path);
    try {
      return await effect();
    } finally {
      this.#paths.delete(path);
    }
  }
  async execute<T>(
    id: string,
    generation: number,
    actor: MachineActor,
    name: string,
    input: unknown,
    authorize: () => void,
    effect: () => Promise<T>,
    receipt: (result: T) => unknown = (result) => result,
    intent?: { resource: string; expected_sha256: string },
  ): Promise<T | unknown> {
    await authorize();
    const fingerprint = createHash("sha256")
      .update(canonical({ machine_id: this.machineId, generation, actor, name, input }))
      .digest("hex");
    const active = this.#pending.get(id);
    if (active) {
      if (active.fingerprint !== fingerprint) throw new DomainError("IDEMPOTENCY_CONFLICT");
      const result = await active.promise;
      await authorize();
      return result;
    }
    // Reserve the in-process identity before the first database read. Concurrent
    // exact retries must share admission as well as the already dispatched effect.
    const pending = Promise.resolve()
      .then(async () => {
        const previous = (await this.lifecycle.store.list("machine_operation")).find(
          (item) => item.id === id,
        );
        if (previous) {
          if (previous.fingerprint !== fingerprint) throw new DomainError("IDEMPOTENCY_CONFLICT");
          if (previous.state === "unknown" || previous.state === "dispatched")
            throw new DomainError("RECONCILIATION_REQUIRED");
          if (previous.state === "failed")
            throw new DomainError(
              errorCodes.find((code) => code === previous.error_code) ?? "MACHINE_UNKNOWN",
            );
          return previous.result;
        }
        if (
          intent &&
          (await this.lifecycle.store.list("machine_operation")).some(
            (item) =>
              item.machine_id === this.machineId &&
              item.generation === generation &&
              item.resource === intent.resource &&
              ["dispatched", "unknown"].includes(item.state) &&
              item.reconciled_at === null,
          )
        )
          throw new DomainError("RECONCILIATION_REQUIRED");
        await this.lifecycle.store.put({
          ...this.base(id),
          kind: "machine_operation",
          machine_id: this.machineId,
          generation,
          agent_id: actor?.agent_id ?? null,
          thread_id: actor?.thread_id ?? null,
          run_id: actor?.run_id ?? null,
          name,
          fingerprint,
          resource: intent?.resource ?? null,
          expected_sha256: intent?.expected_sha256 ?? null,
          reconciled_at: null,
          state: "dispatched",
          result: null,
          error_code: null,
        });
        let started = false;
        try {
          await authorize();
          started = true;
          const result = await effect();
          // A completed native effect is retained even if its caller was cancelled meanwhile.
          await this.update(await this.lifecycle.store.get("machine_operation", id), {
            state: "succeeded",
            result: await receipt(result),
            error_code: null,
          });
          return result;
        } catch (error) {
          const rejected =
            !started ||
            error instanceof MachineEffectRefused ||
            (error instanceof DomainError && error.code === "MACHINE_INPUT_BUSY");
          await this.update(await this.lifecycle.store.get("machine_operation", id), {
            state: rejected ? "failed" : "unknown",
            result: { error: error instanceof DomainError ? error.code : "MACHINE_UNKNOWN" },
            error_code: error instanceof DomainError ? error.code : "MACHINE_UNKNOWN",
          });
          throw error instanceof DomainError ? error : new DomainError("MACHINE_UNKNOWN");
        }
      })
      .finally(() => this.#pending.delete(id));
    this.#pending.set(id, { fingerprint, promise: pending });
    return pending;
  }

  private async initialize(lifecycle: Lifecycle, machineId: string) {
    for (const operation of await lifecycle.store.list("machine_operation")) {
      if (operation.machine_id === machineId && operation.state === "dispatched")
        await this.update(operation, { state: "unknown", error_code: "MACHINE_UNKNOWN" });
    }
  }

  static async open(lifecycle: Lifecycle, machineId: string): Promise<MachineOperations> {
    const instance = new MachineOperations(lifecycle, machineId);
    await instance.initialize(lifecycle, machineId);
    return instance;
  }
}
