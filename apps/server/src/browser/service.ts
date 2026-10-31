import { createHash } from "node:crypto";
import { z } from "zod";
import { DomainError, type Entity } from "../contracts";
import { authorizeResponsibilityWork } from "../goals/work-fence";
import type { ToolAccess } from "../harness/tools";
import type { Lifecycle } from "../lifecycle";
import { canonical } from "../store";
import {
  type BrowserResult,
  browserActionInput,
  browserProfileInput,
  browserToolArguments,
} from "./contracts";
import type { BrowserHost } from "./host";

const readOnly = new Set(["browser_get_state", "browser_screenshot", "browser_list_tabs"]);
const bindingSchema = z.object({
  native_session_id: z.string(),
  target_id: z.string().nullable(),
  tabs: z.array(z.object({ target_id: z.string(), tab_id: z.string() })),
});
export type BrowserScope = { agent_id: string; thread_id: string };
/** Durable application ownership and action receipts. The native harness alone chooses actions. */
export class Browsers {
  readonly #busy = new Map<string, Promise<unknown>>();
  readonly #opening = new Map<string, Promise<Entity<"browser_session">>>();
  readonly #snapshots = new Map<
    string,
    { id: string; target_id: string | null; fingerprint: string }
  >();
  #closed = false;
  constructor(
    readonly lifecycle: Lifecycle,
    readonly host: BrowserHost,
  ) {
    for (const action of lifecycle.store.list("browser_action")) {
      if (action.state === "dispatched")
        this.update(action, { state: "unknown", error_code: "BROWSER_UNKNOWN" });
    }
    for (const session of lifecycle.store.list("browser_session")) {
      if (session.state === "ready")
        this.update(session, { state: "detached", active_run_id: null });
    }
  }
  private base() {
    const now = new Date().toISOString();
    return {
      id: crypto.randomUUID(),
      owner_id: this.lifecycle.store.ownerId,
      revision: 1,
      created_at: now,
      updated_at: now,
    };
  }
  private update<T extends Entity<"browser_profile" | "browser_session" | "browser_action">>(
    entity: T,
    fields: Partial<T>,
  ): T {
    return this.lifecycle.store.put(
      {
        ...entity,
        ...fields,
        revision: entity.revision + 1,
        updated_at: new Date().toISOString(),
      } as T,
      entity.revision,
    );
  }
  private scope(scope: BrowserScope) {
    const agent = this.lifecycle.store.get("agent", scope.agent_id);
    const thread = this.lifecycle.store.get("thread", scope.thread_id);
    if (!thread.member_agent_ids.includes(agent.id) || thread.purpose !== "conversation")
      throw new DomainError("SCOPE_DENIED", 403);
  }
  authorize(profileId: string, scope: BrowserScope, actions = false) {
    if (this.#closed) throw new DomainError("BROWSER_UNAVAILABLE");
    this.scope(scope);
    const profile = this.lifecycle.store.get("browser_profile", profileId);
    if (
      profile.state !== "active" ||
      !profile.grants.some(
        (g) =>
          g.agent_id === scope.agent_id &&
          g.thread_id === scope.thread_id &&
          (!actions || g.actions),
      )
    )
      throw new DomainError("SCOPE_DENIED", 403);
    return profile;
  }
  create(input: unknown) {
    const data = browserProfileInput.parse(input);
    for (const grant of data.grants) this.scope(grant);
    return this.lifecycle.store.put({
      ...this.base(),
      ...data,
      kind: "browser_profile",
      generation: 1,
      state: "active",
    });
  }
  grant(profileId: string, expected: number, input: unknown) {
    const data = browserProfileInput.parse(input);
    for (const grant of data.grants) this.scope(grant);
    const profile = this.lifecycle.store.get("browser_profile", profileId);
    if (expected !== profile.revision) throw new DomainError("CONFLICT");
    this.host.detach(profileId);
    return this.update(profile, { ...data, generation: profile.generation + 1 });
  }
  list(scope: BrowserScope) {
    this.scope(scope);
    return this.lifecycle.store
      .list("browser_profile")
      .filter(
        (p) =>
          p.state === "active" &&
          p.grants.some((g) => g.agent_id === scope.agent_id && g.thread_id === scope.thread_id),
      )
      .map((profile) => ({
        profile,
        sessions: this.lifecycle.store
          .list("browser_session")
          .filter((s) => s.profile_id === profile.id && s.generation === profile.generation),
      }));
  }
  session(id: string, scope: BrowserScope, generation?: number, actions = false) {
    const session = this.lifecycle.store.get("browser_session", id);
    const profile = this.authorize(session.profile_id, scope, actions);
    if (
      session.generation !== profile.generation ||
      (generation !== undefined && generation !== session.generation) ||
      session.state === "closed"
    )
      throw new DomainError("STALE_DISPATCH");
    return session;
  }
  async open(
    profileId: string,
    scope: BrowserScope,
    authorize = () => {},
  ): Promise<Entity<"browser_session">> {
    const profile = this.authorize(profileId, scope);
    if (
      this.lifecycle.store
        .list("browser_session")
        .some(
          (s) => s.profile_id === profileId && s.control_intent !== null && s.state === "unknown",
        )
    )
      throw new DomainError("RECONCILIATION_REQUIRED");
    const opening = this.#opening.get(profileId);
    if (opening) {
      await opening;
      authorize();
      return this.open(profileId, scope, authorize);
    }
    let current = this.lifecycle.store
      .list("browser_session")
      .find(
        (s) =>
          s.profile_id === profileId && s.generation === profile.generation && s.state !== "closed",
      );
    if (current?.state === "unknown") throw new DomainError("RECONCILIATION_REQUIRED");
    if (current?.state === "ready") {
      authorize();
      return current;
    }
    current ??= this.lifecycle.store.put({
      ...this.base(),
      kind: "browser_session",
      profile_id: profileId,
      generation: profile.generation,
      state: "detached",
      active_run_id: null,
      control_intent: null,
    });
    const session = current;
    const pending = (async () => {
      await this.host.connect(profileId, () => {
        authorize();
        this.session(session.id, scope, session.generation);
      });
      authorize();
      const latest = this.session(session.id, scope, session.generation);
      return this.update(latest, { state: "ready" });
    })();
    this.#opening.set(profileId, pending);
    try {
      return await pending;
    } catch (error) {
      this.host.detach(profileId);
      throw error;
    } finally {
      this.#opening.delete(profileId);
    }
  }
  private binding(result: BrowserResult) {
    for (const item of result.content)
      if (item.type === "text") {
        try {
          const value = bindingSchema.safeParse(JSON.parse(item.text).binding);
          if (value.success) return value.data;
        } catch {
          /* Other MCP text is not binding metadata. */
        }
      }
    throw new DomainError("BROWSER_UNKNOWN");
  }
  private stateFingerprint(result: BrowserResult) {
    const state = result.content.find((c) => c.type === "text");
    if (state?.type !== "text") throw new DomainError("BROWSER_UNKNOWN");
    const parsed = JSON.parse(state.text);
    delete parsed.screenshot_dimensions;
    return createHash("sha256").update(canonical(parsed)).digest("hex");
  }
  private auth(profileId: string, result: BrowserResult): "authenticated" | "required" | "unknown" {
    const policy = this.lifecycle.store.get("browser_profile", profileId).auth_policy;
    if (!policy) return "unknown";
    for (const item of result.content)
      if (item.type === "text") {
        try {
          const value = JSON.parse(item.text);
          const url = new URL(value.url);
          if (url.origin === new URL(policy.origin).origin) {
            if (url.pathname.startsWith(policy.login_path_prefix)) return "required";
            if (url.pathname.startsWith(policy.authenticated_path_prefix)) return "authenticated";
          }
        } catch {
          /* A site without an explicit signal remains unknown. */
        }
      }
    return "unknown";
  }
  async observe(id: string, scope: BrowserScope) {
    const initial = this.session(id, scope);
    if (initial.control_intent !== null) throw new DomainError("RECONCILIATION_REQUIRED");
    if (this.#busy.has(initial.profile_id)) throw new DomainError("CONFLICT");
    return this.exclusive(initial.profile_id, async () => {
      await this.host.connect(initial.profile_id);
      this.session(id, scope, initial.generation);
      let result: BrowserResult;
      try {
        result = await this.host.call(initial.profile_id, "browser_get_state", {
          include_screenshot: true,
        });
      } catch (error) {
        this.host.detach(initial.profile_id);
        throw error;
      }
      this.session(id, scope, initial.generation);
      return {
        session: this.lifecycle.store.get("browser_session", id),
        binding: this.binding(result),
        content: result.content,
        auth: this.auth(initial.profile_id, result),
      };
    });
  }
  private async exclusive<T>(profileId: string, fn: () => Promise<T>): Promise<T> {
    if (this.#busy.has(profileId)) throw new DomainError("CONFLICT");
    const pending = Promise.resolve().then(fn);
    this.#busy.set(profileId, pending);
    try {
      return await pending;
    } finally {
      this.#busy.delete(profileId);
    }
  }
  async action(input: unknown, access: ToolAccess) {
    const data = browserActionInput.parse(input);
    const args = browserToolArguments[data.tool].parse(data.arguments);
    if (data.tool === "browser_navigate") {
      const url = new URL((args as { url: string }).url);
      if (!["http:", "https:"].includes(url.protocol) || url.username || url.password)
        throw new DomainError("SCOPE_DENIED", 403);
    }
    access.authorize();
    authorizeResponsibilityWork(this.lifecycle, access.scope.run_id);
    const initial = this.session(
      data.session_id,
      access.scope,
      data.generation,
      !readOnly.has(data.tool),
    );
    const fingerprint = createHash("sha256")
      .update(canonical({ ...data, arguments: args, run_id: access.scope.run_id }))
      .digest("hex");
    const previous = this.lifecycle.store
      .list("browser_action")
      .find((a) => a.id === data.command_id);
    if (previous) {
      if (previous.fingerprint !== fingerprint) throw new DomainError("IDEMPOTENCY_CONFLICT");
      return {
        receipt: previous,
        content: [
          {
            type: "text" as const,
            text: "This action already has a durable receipt. Observe current state; do not submit a new command to retry an unknown outcome.",
          },
        ],
      };
    }
    return this.exclusive(initial.profile_id, async () => {
      access.authorize();
      const profile = this.authorize(initial.profile_id, access.scope, !readOnly.has(data.tool));
      if (
        this.lifecycle.store
          .list("browser_action")
          .some(
            (a) => a.profile_id === profile.id && ["unknown", "dispatched"].includes(a.state),
          ) &&
        !readOnly.has(data.tool)
      )
        throw new DomainError("RECONCILIATION_REQUIRED");
      await this.open(profile.id, access.scope, access.authorize);
      const check = () => {
        access.authorize();
        authorizeResponsibilityWork(this.lifecycle, access.scope.run_id);
        const latest = this.session(
          initial.id,
          access.scope,
          data.generation,
          !readOnly.has(data.tool),
        );
        if (
          latest.state !== "ready" ||
          profile.revision !== this.authorize(profile.id, access.scope).revision
        )
          throw new DomainError("STALE_DISPATCH");
      };
      let observed: BrowserResult;
      try {
        observed = await this.host.call(profile.id, "browser_get_state", {});
      } catch (error) {
        this.host.detach(profile.id);
        const current = this.lifecycle.store.get("browser_session", initial.id);
        this.update(current, { state: "detached" });
        throw error;
      }
      const binding = this.binding(observed);
      if (
        this.auth(profile.id, observed) === "required" &&
        !readOnly.has(data.tool) &&
        data.tool !== "browser_navigate"
      )
        throw new DomainError("BROWSER_AUTH_REQUIRED");
      check();
      if (data.expected_target_id && binding.target_id !== data.expected_target_id)
        throw new DomainError("STALE_DISPATCH");
      if (["browser_click", "browser_type"].includes(data.tool)) {
        const snapshot = this.#snapshots.get(initial.id);
        if (
          !snapshot ||
          snapshot.id !== data.observation_id ||
          !data.expected_target_id ||
          snapshot.target_id !== binding.target_id ||
          snapshot.fingerprint !== this.stateFingerprint(observed)
        )
          throw new DomainError("STALE_DISPATCH");
      }

      if ("tab_id" in args && binding.tabs.filter((t) => t.tab_id === args.tab_id).length !== 1)
        throw new DomainError("SCOPE_DENIED", 403);
      const started = performance.now();
      let receipt: Entity<"browser_action"> = this.lifecycle.store.put({
        ...this.base(),
        id: data.command_id,
        kind: "browser_action",
        session_id: initial.id,
        profile_id: profile.id,
        generation: data.generation,
        run_id: access.scope.run_id,
        agent_id: access.scope.agent_id,
        thread_id: access.scope.thread_id,
        fingerprint,
        native_session_id: binding.native_session_id,
        target_id: binding.target_id,
        tool: data.tool,
        state: "dispatched",
        error_code: null,
        elapsed_ms: 0,
      });
      // This commit precedes native dispatch. A crash or lost acknowledgement leaves a held receipt.
      let stopped = false;
      const timer = setInterval(() => {
        try {
          check();
        } catch {
          stopped = true;
          this.host.detach(profile.id);
        }
      }, 50);
      try {
        check();
        const result = await this.host.call(profile.id, data.tool, args);
        const error =
          result.isError ||
          result.content.some((c) => c.type === "text" && c.text.startsWith("Error:"));
        // Upstream exceptions can occur after an effect. They are unknown, never safe to retry.
        receipt = this.update(receipt, {
          state: error ? "unknown" : "succeeded",
          error_code: error ? "BROWSER_ACTION_FAILED" : null,
          elapsed_ms: performance.now() - started,
        });
        check();
        if (stopped) throw new DomainError("BROWSER_UNKNOWN");
        if (error) throw new DomainError("BROWSER_UNKNOWN");
        if (data.tool === "browser_get_state") {
          const snapshot = {
            id: crypto.randomUUID(),
            target_id: this.binding(result).target_id,
            fingerprint: this.stateFingerprint({
              ...result,
              content: result.content.filter((c) => c.type === "text"),
            }),
          };
          this.#snapshots.set(initial.id, snapshot);
          result.content.push({
            type: "text",
            text: JSON.stringify({
              observation_id: snapshot.id,
              expected_target_id: snapshot.target_id,
            }),
          });
        } else if (!readOnly.has(data.tool)) this.#snapshots.delete(initial.id);
        return { receipt, content: result.content };
      } catch (error) {
        const latest = this.lifecycle.store.get("browser_action", receipt.id);
        if (latest.state === "dispatched")
          this.update(latest, {
            state: "unknown",
            error_code: "BROWSER_UNKNOWN",
            elapsed_ms: performance.now() - started,
          });
        if (this.lifecycle.store.get("browser_action", receipt.id).state === "unknown") {
          this.host.detach(profile.id);
          const session = this.lifecycle.store.get("browser_session", initial.id);
          this.update(session, { state: "unknown" });
        }
        throw error instanceof DomainError ? error : new DomainError("BROWSER_UNKNOWN");
      } finally {
        clearInterval(timer);
      }
    });
  }
  receipts(id: string, scope: BrowserScope) {
    this.session(id, scope);
    return this.lifecycle.store.list("browser_action").filter((a) => a.session_id === id);
  }
  async control(id: string, scope: BrowserScope, operation: "detach" | "close" | "reset") {
    const session = this.session(id, scope);
    if (session.control_intent !== null) throw new DomainError("RECONCILIATION_REQUIRED");
    if (this.#busy.has(session.profile_id) || this.#opening.has(session.profile_id))
      throw new DomainError("CONFLICT");
    return this.exclusive(session.profile_id, async () => {
      const authorize = () => {
        this.session(id, scope, session.generation);
      };
      authorize();
      // A lost process-control acknowledgement must not let an observation restart the host.
      this.update(this.lifecycle.store.get("browser_session", id), {
        state: "unknown",
        control_intent: operation,
      });
      try {
        if (operation === "detach") this.host.detach(session.profile_id);
        else if (operation === "close") await this.host.close(session.profile_id, authorize);
        else await this.host.reset(session.profile_id, authorize);
      } catch (error) {
        throw error instanceof DomainError ? error : new DomainError("BROWSER_UNKNOWN");
      }
      this.session(id, scope, session.generation);
      const profile = this.lifecycle.store.get("browser_profile", session.profile_id);
      this.update(profile, { generation: profile.generation + 1 });
      return this.update(this.lifecycle.store.get("browser_session", id), {
        state: "closed",
        control_intent: null,
      });
    });
  }
  async shutdown() {
    this.#closed = true;
    for (const profile of this.lifecycle.store.list("browser_profile"))
      this.host.detach(profile.id);
    await Promise.allSettled([...this.#busy.values(), ...this.#opening.values()]);
  }
}
