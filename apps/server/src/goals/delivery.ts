import { createHash } from "node:crypto";
import { DomainError, type Entity } from "../contracts";
import { sendDelivery } from "../integrations/delivery-transport";
import type { Lifecycle } from "../lifecycle";
import { type RoutineDeliveryDestination, setRoutineDelivery } from "./delivery-contracts";
import { routineIsTerminal } from "./schedule";
import { ResponsibilityScope } from "./scope";

type Delivery = Entity<"routine_delivery">;
function selection({ id, label, endpoint }: RoutineDeliveryDestination) {
  return { id, label, endpoint_hash: createHash("sha256").update(endpoint).digest("hex") };
}

/** An acknowledged remote send belongs to the settled answer, with its own retry ledger. */
export class RoutineDelivery {
  readonly #active = new Map<string, Promise<void>>();

  constructor(readonly lifecycle: Lifecycle) {}

  private get store() {
    return this.lifecycle.store;
  }

  private get destinations() {
    const actor = this.store.dataContext;
    if (!actor) return [];
    return this.lifecycle.routineDeliveryDestinations.filter(
      (item) => item.organization_id === actor.organizationId && item.user_id === actor.userId,
    );
  }

  options() {
    return this.destinations.map(({ id, label }) => ({ id, label }));
  }

  async setTarget(id: string, input: unknown) {
    const { target_id, expected_revision } = setRoutineDelivery.parse(input);
    return await this.store.transaction(async () => {
      await this.store.validateDataContext(true);
      const routine = await this.store.get("routine", id);
      await new ResponsibilityScope(this.store).require(routine, routine);
      if (expected_revision !== routine.revision || routineIsTerminal(routine.state))
        throw new DomainError("CONFLICT");
      const destination = this.destinations.find((item) => item.id === target_id);
      if (target_id && !destination) throw new DomainError("NOT_FOUND", 404);
      return await this.store.put(
        {
          ...routine,
          delivery_target: destination ? selection(destination) : null,
          revision: routine.revision + 1,
          updated_at: new Date().toISOString(),
        },
        routine.revision,
      );
    });
  }

  async enqueue(routine: Entity<"routine">, run: Entity<"run">, answer: Entity<"message">) {
    if (!routine.delivery_target || !this.store.dataContext) return;
    const now = new Date().toISOString();
    await this.store.put({
      id: run.id,
      owner_id: this.store.ownerId,
      kind: "routine_delivery",
      thread_id: run.thread_id,
      routine_id: routine.id,
      run_id: run.id,
      message_id: answer.id,
      target: routine.delivery_target,
      state: "queued",
      attempts: 0,
      next_attempt_at: now,
      authority_epoch: null,
      revision: 1,
      created_at: now,
      updated_at: now,
    });
  }

  async statuses(threadId: string) {
    return (await this.store.list("routine_delivery", { thread_id: threadId })).map(
      ({ id, routine_id, run_id, state, target }) => ({
        id,
        routine_id,
        run_id,
        state,
        destination: target.label,
      }),
    );
  }

  async advance(now: Date, report: (code: string) => void) {
    if (!this.store.dataContext || this.#active.size >= 4) return;
    const due = now.toISOString();
    const byState = await Promise.all(
      ["sending", "queued", "retrying"].map((state) =>
        this.store.list("routine_delivery", { state }),
      ),
    );
    for (const item of byState.flat()) {
      if (this.#active.size >= 4) break;
      if (this.#active.has(item.id) || (item.next_attempt_at && item.next_attempt_at > due))
        continue;
      const work = this.deliver(item.id, due)
        .catch(() => report("ROUTINE_DELIVERY_ERROR"))
        .finally(() => this.#active.delete(item.id));
      this.#active.set(item.id, work);
    }
  }

  async idle() {
    await Promise.all(this.#active.values());
  }

  private async update(item: Delivery, fields: Partial<Delivery>) {
    return await this.store.put(
      { ...item, ...fields, revision: item.revision + 1, updated_at: new Date().toISOString() },
      item.revision,
    );
  }

  private async deliver(id: string, due: string) {
    const claim = await this.store.transaction(async () => {
      const item = await this.store.get("routine_delivery", id);
      if (item.state === "sending") {
        // A durable claim without an active sender may have received an unrecorded ACK.
        await this.update(item, { state: "unknown" });
        return null;
      }
      if (
        !["queued", "retrying"].includes(item.state) ||
        !item.next_attempt_at ||
        item.next_attempt_at > due
      )
        return null;
      await this.store.validateDataContext(true);
      const routine = await this.store.get("routine", item.routine_id);
      const run = await this.store.get("run", item.run_id);
      const answer = await this.store.get("message", item.message_id);
      const destination = this.destinations.find((option) => option.id === item.target.id);
      if (
        !destination ||
        routine.delivery_target?.id !== item.target.id ||
        routine.delivery_target.endpoint_hash !== item.target.endpoint_hash ||
        selection(destination).endpoint_hash !== item.target.endpoint_hash ||
        run.status !== "succeeded" ||
        run.routine_id !== routine.id ||
        answer.run_id !== run.id ||
        answer.author !== "agent" ||
        answer.purpose !== "conversation" ||
        answer.state !== "complete"
      ) {
        await this.update(item, { state: "cancelled", next_attempt_at: null });
        return null;
      }
      await this.store.assertInvocation(run.agent_id);
      const claimed = await this.update(item, {
        state: "sending",
        attempts: item.attempts + 1,
        authority_epoch: this.lifecycle.epoch,
        next_attempt_at: null,
      });
      return { item: claimed, destination, text: answer.text };
    });
    if (!claim) return;
    await this.store.assertAuthority();
    await this.store.validateDataContext(true);
    const state = await sendDelivery(
      claim.destination,
      { event_id: claim.item.id, text: claim.text },
      this.store.signal,
    );
    await this.store.transaction(async () => {
      const item = await this.store.get("routine_delivery", id);
      if (
        item.state !== "sending" ||
        item.revision !== claim.item.revision ||
        item.authority_epoch !== this.lifecycle.epoch
      )
        return;
      const retry = state === "retrying" && item.attempts < 7;
      await this.update(item, {
        state: retry ? "retrying" : state === "retrying" ? "failed" : state,
        next_attempt_at: retry
          ? new Date(Date.now() + Math.min(60, 5 * 2 ** (item.attempts - 1)) * 1000).toISOString()
          : null,
      });
    });
  }
}
