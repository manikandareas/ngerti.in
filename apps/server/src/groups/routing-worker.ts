import { DomainError } from "../contracts";
import type { Lifecycle } from "../lifecycle";
import type { RoutingDecisionTrace } from "./decision-trace";
import { ROUTING_POLICY_VERSION, routingInputHash } from "./routing-policy";
import { Groups } from "./service";

/** Pure routing requests may be recomputed after restart; only one fenced decision admits work. */
export class RoutingWorker {
  readonly #pending = new Map<string, { controller: AbortController; done: Promise<void> }>();
  #closed = false;
  constructor(
    private readonly lifecycle: Lifecycle,
    private readonly wake: () => void,
  ) {}
  advance() {
    const router = this.lifecycle.groupRouter;
    if (this.#closed) return;
    const groups = new Groups(this.lifecycle);
    for (const route of this.lifecycle.store.list("group_route")) {
      if (this.#pending.size >= 4) break;
      if (
        route.state !== "pending" ||
        route.routing?.provider !== "jev" ||
        this.#pending.has(route.id)
      )
        continue;
      const attemptId = crypto.randomUUID();
      try {
        if (!router) {
          groups.fallbackRouting(route.id);
          continue;
        }
        const packet = groups.routingPacket(route.id);
        this.lifecycle.store.put(
          {
            ...route,
            revision: route.revision + 1,
            updated_at: new Date().toISOString(),
            routing: {
              ...route.routing,
              attempt_id: attemptId,
              started_at: new Date().toISOString(),
            },
          },
          route.revision,
        );
        const controller = new AbortController();
        const started = performance.now();
        const trace: RoutingDecisionTrace = {
          route_id: route.id,
          attempt_id: attemptId,
          policy_version: ROUTING_POLICY_VERSION,
          events: [],
        };
        const done = Promise.resolve()
          .then(() =>
            router.choose(packet, controller.signal, (event) => {
              if (this.#closed || this.lifecycle.store.closed) return;
              const current = this.lifecycle.store.get("group_route", route.id);
              if (current.state !== "pending" || current.routing?.attempt_id !== attemptId) return;
              const routing = current.routing;
              const entry = JSON.parse(
                JSON.stringify({
                  at: new Date().toISOString(),
                  ...event,
                  input_sha256: routingInputHash(event.request),
                }),
              );
              trace.events.push(entry);
              this.lifecycle.store.transaction(() => {
                this.lifecycle.store.recordRoutingTrace(trace);
                if (event.response === undefined)
                  this.lifecycle.store.put(
                    {
                      ...current,
                      revision: current.revision + 1,
                      updated_at: new Date().toISOString(),
                      routing: { ...routing, phase: event.phase },
                    },
                    current.revision,
                  );
              });
            }),
          )
          .then((decision) => {
            if (!this.#closed && !this.lifecycle.store.closed)
              groups.resolveRouting(route.id, attemptId, decision, performance.now() - started);
          })
          .catch((error) => {
            if (!this.#closed && !this.lifecycle.store.closed)
              groups.rejectRouting(
                route.id,
                attemptId,
                error instanceof DomainError ? error.code : "ROUTING_UNAVAILABLE",
              );
          })
          .finally(() => {
            this.#pending.delete(route.id);
            this.wake();
          });
        this.#pending.set(route.id, { controller, done });
      } catch (error) {
        groups.rejectRouting(
          route.id,
          route.routing.attempt_id,
          error instanceof DomainError ? error.code : "ROUTING_INVALID",
        );
      }
    }
  }
  async idle() {
    await Promise.all([...this.#pending.values()].map((work) => work.done));
  }
  async close() {
    this.#closed = true;
    for (const work of this.#pending.values()) work.controller.abort();
    await this.idle();
  }
}
