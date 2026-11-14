import type { Entity } from "../contracts";
import { DomainError } from "../contracts";
import type { Lifecycle } from "../lifecycle";
import type { DataContext } from "../persistence/access-context";
import type { CuaMachine } from "./cua";
import { DomainCuaMachine, DomainRuntime, readDomainPolicy } from "./domain-runtime";
import { Machines, machineFor } from "./service";

const resolvers = new WeakMap<Lifecycle, ExecutionDomains>();
export const domainsFor = (lifecycle: Lifecycle) => resolvers.get(lifecycle);
export async function resolvedMachine(lifecycle: Lifecycle): Promise<Machines | undefined> {
  if (!lifecycle.store.dataContext) return machineFor(lifecycle);
  // Never return the installation-wide machine for an authenticated organization scope.
  return resolvers.get(lifecycle)?.resolve();
}

/** Bind asynchronous machine collectors to their durable principal, independently of a login session. */
function resourceLifecycle(lifecycle: Lifecycle, source: DataContext): Lifecycle {
  const store = lifecycle.store;
  const scope: DataContext = {
    ...source,
    validate: source.validateResources ?? source.validate,
    acquire: source.acquireResources,
  };
  const run = <T>(action: () => T): T => {
    const active = store.dataContext;
    if (active) {
      if (active.organizationId !== scope.organizationId || active.userId !== scope.userId)
        throw new DomainError("SCOPE_DENIED", 403);
      return action();
    }
    return store.withDataContext(scope, action);
  };
  const boundStore = new Proxy(store, {
    get(target, key) {
      if (key === "dataContext") return scope;
      if (key === "subscribe")
        return (listener: () => unknown) =>
          target.subscribe(() => target.outsideDataContext(() => run(listener)));
      const value = Reflect.get(target, key, target);
      return typeof value === "function"
        ? (...args: unknown[]) => run(() => value.apply(target, args))
        : value;
    },
  });
  return new Proxy(lifecycle, {
    get(target, key) {
      if (key === "store") return boundStore;
      const value = Reflect.get(target, key, target);
      return typeof value === "function"
        ? (...args: unknown[]) => run(() => value.apply(target, args))
        : value;
    },
  });
}

type Entry = { generation: string; machine: Machines };
/** Durable metadata resolution is separate from lazy Docker provisioning and all native I/O. */
export class ExecutionDomains {
  readonly #machines = new Map<string, Entry>();
  readonly #opening = new Map<string, Promise<Machines>>();
  #closed = false;
  constructor(
    readonly lifecycle: Lifecycle,
    readonly runtime: DomainRuntime,
    readonly createHost?: (
      configuration: ReturnType<DomainRuntime["configuration"]>,
      lifecycle: Lifecycle,
    ) => CuaMachine,
  ) {
    if (resolvers.has(lifecycle)) throw new Error("Execution domains are already registered.");
    resolvers.set(lifecycle, this);
  }
  async resolve(): Promise<Machines> {
    if (this.#closed) throw new DomainError("MACHINE_UNAVAILABLE", 503);
    const scope = this.lifecycle.store.dataContext;
    if (!scope) throw new DomainError("SCOPE_DENIED", 403);
    await scope.validate(true);
    const key = `${scope.organizationId}:${scope.userId}`;
    const generation = `${scope.membershipGeneration}:${scope.authorizationGeneration}`;
    let existing = this.#machines.get(key);
    if (existing?.generation === generation) {
      try {
        await existing.machine.snapshot();
        return existing.machine;
      } catch (error) {
        if (!(error instanceof DomainError) || error.code !== "NOT_FOUND") throw error;
        // Metadata may have been resolved inside an outer command that rolled back.
        await existing.machine.close();
        this.#machines.delete(key);
        existing = undefined;
      }
    }
    const pending = this.#opening.get(key);
    if (pending) {
      await pending;
      return this.resolve();
    }
    const opening = (async () => {
      if (existing) {
        await existing.machine.close().catch(() => {});
        this.#machines.delete(key);
      }
      const store = this.lifecycle.store;
      const domain = await store.transaction(async () => {
        const previous = (await store.list("execution_domain"))[0];
        if (previous) {
          if (previous.state === "retired") throw new DomainError("MACHINE_UNAVAILABLE", 503);
          return previous;
        }
        const now = new Date().toISOString();
        return store.put({
          id: crypto.randomUUID(),
          kind: "execution_domain",
          owner_id: store.ownerId,
          revision: 1,
          created_at: now,
          updated_at: now,
          generation: 1,
          state: "pending",
          error_code: null,
        });
      });
      const bound = resourceLifecycle(this.lifecycle, scope);
      const configuration = this.runtime.configuration(domain.id, domain.state === "pending");
      if (configuration.id !== domain.id || configuration.generation !== domain.generation)
        throw new DomainError("RECONCILIATION_REQUIRED");
      const state = async (state: Entity<"execution_domain">["state"], error: string | null) => {
        const current = await bound.store.get("execution_domain", domain.id);
        if (current.state === "retired" || current.generation !== configuration.generation)
          throw new DomainError("RECONCILIATION_REQUIRED");
        if (current.state === state && current.error_code === error) return;
        await bound.store.put(
          {
            ...current,
            state,
            error_code: error,
            revision: current.revision + 1,
            updated_at: new Date().toISOString(),
          },
          current.revision,
        );
      };
      const host =
        this.createHost?.(configuration, bound) ??
        new DomainCuaMachine(this.runtime, configuration, state);
      const machine = await Machines.open(bound, configuration, host, domain.id);
      this.#machines.set(key, { generation, machine });
      return machine;
    })().finally(() => this.#opening.delete(key));
    this.#opening.set(key, opening);
    return opening;
  }
  async close() {
    this.#closed = true;
    await Promise.allSettled(this.#opening.values());
    await Promise.allSettled([...this.#machines.values()].map((entry) => entry.machine.close()));
    this.#machines.clear();
    resolvers.delete(this.lifecycle);
  }
  static open(lifecycle: Lifecycle, directory: string) {
    return new ExecutionDomains(
      lifecycle,
      new DomainRuntime(directory, lifecycle.store.ownerId, readDomainPolicy(directory)),
    );
  }
}
