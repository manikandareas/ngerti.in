import type { SessionLease } from "../auth/service";
import { DomainError } from "../contracts";
import type { Lifecycle } from "../lifecycle";
import { resolvedMachine } from "./domains";
import { MachineViews, type ViewerPeer } from "./view";

/** Opaque viewer handles route to one domain; cookies/organization headers cannot retarget them. */
export class MachineViewGateway {
  readonly #domains = new Map<string, MachineViews>();
  readonly #tickets = new Map<string, MachineViews>();
  readonly #peers = new Map<ViewerPeer, MachineViews>();
  constructor(readonly lifecycle: Lifecycle) {}
  private owner(id: string) {
    const views = this.#tickets.get(id);
    if (!views) throw new DomainError("UNAUTHORIZED", 401);
    const scope = this.lifecycle.store.dataContext;
    if (scope) {
      const bound = views.machines.lifecycle.store.dataContext;
      if (!bound || scope.userId !== bound.userId || scope.organizationId !== bound.organizationId)
        throw new DomainError("SCOPE_DENIED", 403);
    }
    return views;
  }
  async issue(origin: string, interactive: boolean, apiOrigin: string, lease?: SessionLease) {
    const machines = await resolvedMachine(this.lifecycle);
    if (!machines) throw new DomainError("MACHINE_UNAVAILABLE", 503);
    const id = (await machines.snapshot()).id;
    let views = this.#domains.get(id);
    if (views && views.machines !== machines) {
      await views.close();
      for (const [ticket, owner] of this.#tickets)
        if (owner === views) this.#tickets.delete(ticket);
      views = undefined;
    }
    if (!views) {
      views = new MachineViews(machines, (ticket) => {
        this.#tickets.delete(ticket);
      });
      this.#domains.set(id, views);
    }
    const scope = this.lifecycle.store.dataContext;
    const scopedLease =
      lease && scope
        ? {
            ...lease,
            organizationId: scope.organizationId,
            assert: async () => {
              await lease.assert();
              await scope.validate(true);
            },
          }
        : lease;
    const result = await views.issue(origin, interactive, apiOrigin, scopedLease);
    this.#tickets.set(result.viewer_id, views);
    return result;
  }
  async authorize(request: Request) {
    const id = new URL(request.url).pathname.split("/")[4] ?? "";
    return this.owner(id).authorize(request);
  }
  async proxy(request: Request) {
    const id = new URL(request.url).pathname.split("/")[4] ?? "";
    return this.owner(id).proxy(request);
  }
  async open(request: Request, peer: ViewerPeer) {
    try {
      const id = new URL(request.url).pathname.split("/")[4] ?? "";
      const views = this.owner(id);
      await views.authorize(request);
      this.#peers.set(peer, views);
      await views.open(request, peer, false);
    } catch {
      this.#peers.delete(peer);
      peer.close(1008, "Machine view denied.");
    }
  }
  async message(peer: ViewerPeer, message: unknown) {
    const views = this.#peers.get(peer);
    if (!views) return peer.close(1008, "Machine view denied.");
    await views.message(peer, message);
  }
  closePeer(peer: ViewerPeer) {
    this.#peers.get(peer)?.closePeer(peer);
    this.#peers.delete(peer);
  }
  async renew(id: string, origin: string, session?: string) {
    return this.owner(id).renew(id, origin, session);
  }
  async remove(id: string, session?: string) {
    const result = await this.owner(id).remove(id, session);
    this.#tickets.delete(id);
    return result;
  }
  async close() {
    await Promise.allSettled([...this.#domains.values()].map((views) => views.close()));
    this.#domains.clear();
    this.#tickets.clear();
    this.#peers.clear();
  }
}
