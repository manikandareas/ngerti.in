import { createHash, timingSafeEqual } from "node:crypto";
import type { z } from "zod";
import { Artifacts } from "../artifacts";
import { DomainError, type Entity } from "../contracts";
import type { Lifecycle } from "../lifecycle";
import type { channelEvent, channelStatus, ManagedChannel } from "./channel-contracts";
import { sendDelivery } from "./delivery-transport";

type Exchange = Entity<"channel_exchange">;
const hash = (value: string) => createHash("sha256").update(value).digest("hex");

function routeHash(route: ManagedChannel) {
  return hash(
    JSON.stringify([
      route.id,
      route.organization_id,
      route.user_id,
      route.thread_id,
      route.remote_thread,
      route.sender,
      route.endpoint,
    ]),
  );
}

function commandId(route: ManagedChannel, eventId: string) {
  const value = hash(JSON.stringify(["channel", route.id, eventId]));
  return `${value.slice(0, 8)}-${value.slice(8, 12)}-8${value.slice(13, 16)}-8${value.slice(17, 20)}-${value.slice(20, 32)}`;
}

export function channelReceipt(item: Exchange): z.infer<typeof channelStatus> {
  const { id, run_id, event_id, channel_label, state, attempts } = item;
  return { id, run_id, event_id, channel_label, state, attempts };
}

export class Channels {
  readonly #sending = new Map<string, Promise<void>>();

  constructor(private readonly lifecycle: Lifecycle) {}

  private get store() {
    return this.lifecycle.store;
  }

  authorize(request: Request, channelId: string) {
    const route = this.lifecycle.channels.find((value) => value.id === channelId);
    const key = request.headers.get("Authorization");
    if (
      !route ||
      !key ||
      key.length > 1031 ||
      !timingSafeEqual(Buffer.from(hash(key)), Buffer.from(hash(`Bearer ${route.receiveKey}`)))
    )
      throw new DomainError("UNAUTHORIZED", 401);
    if (request.headers.get("X-Ngertiin-Channel-Sender") !== route.sender)
      throw new DomainError("SCOPE_DENIED", 403);
    return route;
  }

  async admit(route: ManagedChannel, input: z.infer<typeof channelEvent>) {
    return await this.store.command(
      commandId(route, input.event_id),
      {
        route: routeHash(route),
        ...input,
      },
      async () => {
        const actor = this.store.dataContext;
        const thread = await this.store.get("thread", route.thread_id);
        if (
          !actor ||
          thread.actor_id !== actor.userId ||
          thread.type !== "dm" ||
          thread.purpose !== "conversation"
        )
          throw new DomainError("SCOPE_DENIED", 403);
        const { run } = await this.lifecycle.admit({
          thread_id: thread.id,
          agent_id: thread.member_agent_ids[0],
          text: input.text,
        });
        const now = new Date().toISOString();
        return await this.store.put({
          id: run.id,
          owner_id: this.store.ownerId,
          kind: "channel_exchange",
          revision: 1,
          created_at: now,
          updated_at: now,
          channel_id: route.id,
          channel_label: route.label,
          route_hash: routeHash(route),
          thread_id: thread.id,
          run_id: run.id,
          event_id: input.event_id,
          membership_generation: actor.membershipGeneration,
          state: "pending",
          attempts: 0,
          next_attempt_at: null,
        });
      },
    );
  }

  async exchange(route: ManagedChannel, id: string) {
    const item = await this.store.get("channel_exchange", id);
    if (!this.currentRoute(item, route)) throw new DomainError("SCOPE_DENIED", 403);
    return item;
  }

  async attachment(route: ManagedChannel, id: string, artifactId: string) {
    return await this.store.read(async () => {
      const item = await this.exchange(route, id);
      const run = await this.store.get("run", item.run_id);
      const artifact = await this.store.get("artifact", artifactId);
      if (
        run.status !== "succeeded" ||
        !artifact.workspace_id ||
        artifact.origin !== "native_output" ||
        artifact.run_id !== run.id ||
        artifact.thread_id !== route.thread_id
      )
        throw new DomainError("SCOPE_DENIED", 403);
      await this.store.assertInvocation(run.agent_id);
      return await new Artifacts(this.lifecycle).download(artifact.id, artifact.workspace_id);
    });
  }

  private currentRoute(item: Exchange, route: ManagedChannel) {
    const actor = this.store.dataContext;
    return (
      actor?.organizationId === route.organization_id &&
      actor.userId === route.user_id &&
      item.channel_id === route.id &&
      item.route_hash === routeHash(route) &&
      item.thread_id === route.thread_id &&
      item.membership_generation === actor.membershipGeneration
    );
  }

  async advance(now: Date, report: (code: string) => void) {
    if (!this.store.dataContext || !this.lifecycle.channels.length || this.#sending.size >= 4)
      return;
    const due = now.toISOString();
    for (const state of ["sending", "retrying", "pending"]) {
      for (const item of await this.store.list("channel_exchange", { state })) {
        if (this.#sending.size >= 4) return;
        if (this.#sending.has(item.id) || (item.next_attempt_at && item.next_attempt_at > due))
          continue;
        if (
          item.state === "pending" &&
          ["queued", "dispatching", "running", "cancel_requested", "unknown"].includes(
            (await this.store.get("run", item.run_id)).status,
          )
        )
          continue;
        const work = this.deliver(item.id, due)
          .catch(() => report("CHANNEL_DELIVERY_ERROR"))
          .finally(() => this.#sending.delete(item.id));
        this.#sending.set(item.id, work);
      }
    }
  }

  async idle() {
    await Promise.all(this.#sending.values());
  }

  private async update(item: Exchange, changes: Partial<Exchange>) {
    return await this.store.put(
      {
        ...item,
        ...changes,
        revision: item.revision + 1,
        updated_at: new Date().toISOString(),
      },
      item.revision,
    );
  }

  private async deliver(id: string, due: string) {
    const claim = await this.store.transaction(async () => {
      const item = await this.store.get("channel_exchange", id);
      if (item.state === "sending") {
        await this.update(item, { state: "unknown" });
        return null;
      }
      if (
        !["pending", "retrying"].includes(item.state) ||
        (item.next_attempt_at && item.next_attempt_at > due)
      )
        return null;
      const route = this.lifecycle.channels.find((candidate) => candidate.id === item.channel_id);
      await this.store.validateDataContext(true);
      if (!route || !this.currentRoute(item, route)) {
        await this.update(item, { state: "cancelled", next_attempt_at: null });
        return null;
      }
      const run = await this.store.get("run", item.run_id);
      if (["failed", "cancelled", "steered"].includes(run.status)) {
        await this.update(item, { state: "cancelled", next_attempt_at: null });
        return null;
      }
      if (run.status !== "succeeded") return null;
      await this.store.assertInvocation(run.agent_id);
      const answer = await this.store.answer(run.id);
      const attachments = (
        await this.store.list("artifact", { run_id: run.id, thread_id: run.thread_id })
      )
        .filter((file) => file.origin === "native_output")
        .map(({ id, name, media_type, size_bytes }) => ({ id, name, media_type, size_bytes }));
      if (answer?.state !== "complete" && !attachments.length) {
        await this.update(item, { state: "failed", next_attempt_at: null });
        return null;
      }
      const sending = await this.update(item, {
        state: "sending",
        attempts: item.attempts + 1,
        next_attempt_at: null,
      });
      return {
        item: sending,
        route,
        payload: {
          event_id: item.id,
          source_event_id: item.event_id,
          remote_thread: route.remote_thread,
          text: answer?.state === "complete" ? answer.text : "",
          attachments,
        },
      };
    });
    if (!claim) return;
    await this.store.assertAuthority();
    await this.store.validateDataContext(true);
    const result = await sendDelivery(claim.route, claim.payload, this.store.signal);
    await this.store.transaction(async () => {
      const item = await this.store.get("channel_exchange", claim.item.id);
      if (item.state !== "sending" || item.revision !== claim.item.revision) return;
      const retry = result === "retrying" && item.attempts < 7;
      await this.update(item, {
        state: retry ? "retrying" : result === "retrying" ? "failed" : result,
        next_attempt_at: retry
          ? new Date(Date.now() + Math.min(60, 5 * 2 ** (item.attempts - 1)) * 1000).toISOString()
          : null,
      });
    });
  }
}
