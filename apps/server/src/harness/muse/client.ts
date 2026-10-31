import { createHash } from "node:crypto";
import { mkdirSync } from "node:fs";
import { z } from "zod";
import type { Entity } from "../../contracts";
import type { HarnessClient, Inspection, RecoveryObservation, SessionIdentity } from "../broker";
import type { LaunchContext } from "../context";
import { HarnessError, type Settings } from "../contracts";
import { MuseTools } from "./tools";
import { MuseTransport } from "./transport";

export const museCapabilities = {
  resume: "supported",
  // R7309.1 can carry an admitted steer into a second native turn. Single-turn mapping is unverified.
  steer: "unknown",
  cancel: "supported",
  permission_requests: "supported",
  product_tools: "supported",
  settings: "supported",
  image_input: "unsupported",
  video_input: "unsupported",
  compaction: "unsupported",
} as const;

import { MuseInteractions } from "./interactions";
import { item, nativeId } from "./protocol";

type Prompt = Parameters<HarnessClient["prompt"]>[0];
type Active = {
  request: Prompt;
  turn: string;
  accepted: boolean;
  resolve(value: unknown): void;
  reject(error: HarnessError): void;
  items: Map<string, z.infer<typeof item>>;
  stopped: boolean;
  published: boolean;
};

/** MSP owns the inner agent loop. This client only maps native identities, observations and controls. */
export class MuseClient implements HarnessClient {
  readonly transport: MuseTransport;
  readonly tools: MuseTools;
  #session: string | null = null;
  #active: Active | null = null;
  #selected: Settings | null = null;
  #closed = false;
  #events = Promise.resolve();
  readonly #interactions = new MuseInteractions();
  constructor(
    executable: string,
    readonly context: LaunchContext,
    readonly workspace: string,
    endpoint: () => string,
    private readonly instructions = "",
    args: string[] = [],
    modelId?: string,
  ) {
    mkdirSync(workspace, { recursive: true, mode: 0o700 });
    this.transport = new MuseTransport(executable, context, args, modelId);
    try {
      this.tools = new MuseTools(endpoint);
      context.redactor.add(this.tools.token);
    } catch {
      void this.transport.close();
      throw new HarnessError("SERVICE_UNAVAILABLE");
    }
  }
  async initialize() {
    const host = await this.transport.initialize();
    if (
      host.initializeResult.sessionDurability === "ephemeral" ||
      !host.initializeResult.grantedCapabilities.includes("sessionMcp")
    )
      throw new HarnessError("CAPABILITY_UNSUPPORTED");
    host.connection.onNotification(({ method, params }) => this.enqueue(method, params));
    host.connection.onServerRequest(async ({ method, params }) => {
      if (method !== "approval/request" && method !== "userInput/request")
        throw new HarnessError("CAPABILITY_UNSUPPORTED");
      this.enqueue(
        method === "approval/request" ? "approval/requested" : "userInput/requested",
        params,
      );
      return {};
    });
    host.connection.onProtocolError(() => this.fail());
    void host.connection.closed.then(() => {
      if (!this.#closed) this.fail();
    });
  }
  private fail() {
    this.#active?.reject(new HarnessError("NATIVE_UNKNOWN", "unknown"));
    void this.close();
  }
  async inspect(): Promise<Inspection> {
    const state = z
      .object({
        state: z.enum(["loggedOut", "accountLogin", "apiKey", "envKey"]),
        credentialRequired: z.boolean(),
        label: z.string().optional(),
      })
      .parse(await this.transport.read("account/read"));
    const key = this.context.env.META_API_KEY;
    if (
      state.state !== "loggedOut" &&
      (key ? state.state !== "envKey" : state.state !== "accountLogin")
    )
      throw new HarnessError("BILLING_MISMATCH");
    if (state.state === "accountLogin" && !state.label) throw new HarnessError("AUTH_REJECTED");
    return {
      login: state.state === "loggedOut" ? "required" : "authenticated",
      account_id:
        state.state === "loggedOut"
          ? null
          : createHash("sha256")
              .update(key ?? (state.label as string))
              .digest("hex"),
      auth_method: key ? "api_key" : "native_login",
      billing_source: key ? "api_key" : "subscription",
      capabilities: { ...museCapabilities },
    };
  }
  async discoverModels(): Promise<Entity<"connection">["models"]> {
    const catalog = z
      .object({
        providerId: z.literal("meta"),
        models: z.array(
          z.object({
            providerId: z.literal("meta"),
            modelId: z.string().min(1),
            variants: z.union([z.array(z.string()), z.literal("unknown")]).optional(),
          }),
        ),
      })
      .parse(await this.transport.read("model/list"));
    return catalog.models.map((m) => ({
      id: m.modelId,
      reasoning: Array.isArray(m.variants) ? m.variants : [],
    }));
  }
  async start(settings: Settings) {
    return this.open(null, settings);
  }
  async resume(identity: SessionIdentity, settings: Settings) {
    return this.open(identity.native_session_id, settings);
  }
  private async open(previous: string | null, settings: Settings): Promise<SessionIdentity> {
    if (this.#session || this.#closed) throw new HarnessError("NATIVE_REJECTED");
    const id = previous ?? this.transport.connection.mintCommandId();
    // Set before sending: pending native questions may precede the resume response.
    this.#session = id;
    const result = z
      .object({
        session: z
          .object({ sessionId: nativeId, activeTurnId: nativeId.nullable().optional() })
          .passthrough(),
      })
      .parse(
        await this.transport.command(previous ? "session/resume" : "session/start", {
          sessionId: id,
          config: { mcpServers: this.tools.config },
          ...(previous
            ? { excludeItems: true }
            : {
                workspaceRoot: this.workspace,
                providerId: "meta",
                modelId: settings.model_id,
                approvalMode: "promptUnmatched",
              }),
        }),
      );
    if (result.session.sessionId !== id || result.session.activeTurnId)
      throw new HarnessError("NATIVE_UNKNOWN", "unknown");
    await this.settings({ native_session_id: id }, settings);
    return { native_session_id: id };
  }
  async settings(identity: SessionIdentity, settings: Settings) {
    if (identity.native_session_id !== this.#session || this.#closed || this.#active)
      throw new HarnessError("NATIVE_REJECTED");
    if (this.#selected?.model_id !== settings.model_id) {
      await this.transport.command("session/setModel", {
        sessionId: this.#session,
        model: { providerId: "meta", modelId: settings.model_id },
      });
      const result = z
        .object({
          session: z.object({
            sessionId: nativeId,
            modelId: z.string(),
            providerId: z.literal("meta"),
          }),
        })
        .parse(await this.transport.read("session/read", { sessionId: this.#session }));
      if (
        result.session.sessionId !== this.#session ||
        result.session.modelId !== settings.model_id
      )
        throw new HarnessError("PROTOCOL_ERROR");
    }
    this.#selected = { ...settings };
  }
  async prompt(request: Prompt) {
    await this.settings(request.identity, request.settings);
    if (request.signal.aborted)
      return {
        status: "cancelled",
        native_session_id: request.identity.native_session_id,
        native_run_id: null,
      };
    if (this.#active || this.#closed || this.#interactions.pending)
      throw new HarnessError("NATIVE_REJECTED");
    const turn = this.transport.connection.mintCommandId();
    let active!: Active;
    const done = new Promise<unknown>((resolve, reject) => {
      active = {
        request,
        turn,
        accepted: false,
        resolve,
        reject,
        items: new Map(),
        stopped: false,
        published: false,
      };
    });
    void done.catch(() => {});
    this.#active = active;
    this.tools.active = {
      lease: request.tools,
      signal: request.signal,
      accepted: () => this.#active === active && active.accepted,
    };
    try {
      request.onEvent({ type: "dispatch", native_run_id: active.turn });
      const result = z.object({ turnId: nativeId, disposition: z.literal("started") }).parse(
        await this.transport.command(
          "turn/start",
          {
            sessionId: this.#session,
            input: [
              ...(this.instructions ? [{ type: "text", text: this.instructions }] : []),
              { type: "text", text: request.text },
            ],
            ifBusy: "queue",
            workspaceRoots: [this.workspace],
            ...(request.settings.reasoning ? { reasoningEffort: request.settings.reasoning } : {}),
          },
          active.turn,
        ),
      );
      if (result.turnId !== active.turn) throw new HarnessError("NATIVE_UNKNOWN", "unknown");
      this.accept(active);
      if (active.stopped) await this.stop(request.identity, request.run_id);
      return await done;
    } catch (error) {
      // An uncertain command cannot leave a reusable live client behind.
      if (!(error instanceof HarnessError) || error.outcome === "unknown") await this.close();
      throw error;
    } finally {
      this.publish(active);
      if (this.#active === active) this.#active = null;
      this.tools.active = null;
      this.#interactions.clear();
    }
  }
  private accept(active: Active) {
    if (active.accepted) return;
    active.accepted = true;
    active.request.onEvent({
      type: "accepted",
      native_session_id: active.request.identity.native_session_id,
      native_run_id: active.turn,
    });
  }
  private publish(active: Active) {
    if (active.published) return;
    active.published = true;
    active.request.onEvent({
      type: "text_snapshot",
      text: [...active.items.values()]
        .filter((value) => value.kind === "agentMessage")
        .map((value) => value.text ?? "")
        .join(""),
    });
  }
  private preview(active: Active) {
    this.accept(active);
    active.request.onEvent({
      type: "text_snapshot",
      text: [...active.items.values()]
        .filter((value) => value.kind === "agentMessage")
        .map((value) => value.text ?? "")
        .join(""),
    });
  }
  private enqueue(method: string, params: unknown) {
    this.#events = this.#events.then(() => this.receive(method, params)).catch(() => this.fail());
  }
  private async receive(method: string, raw: unknown) {
    if (this.#closed) return;
    if (
      ![
        "view/gap",
        "turn/started",
        "turn/completed",
        "item/started",
        "item/updated",
        "item/completed",
        "item/delta",
        "approval/requested",
        "approval/updated",
        "approval/resolved",
        "userInput/requested",
        "userInput/settled",
      ].includes(method)
    )
      return;
    const params = z.object({ sessionId: nativeId }).passthrough().parse(raw);
    if (params.sessionId !== this.#session) return;
    if (method === "view/gap") throw new HarnessError("NATIVE_UNKNOWN", "unknown");
    if (this.#interactions.receive(method, raw, params)) return;
    const active = this.#active;
    if (!active) return;
    if (method === "turn/started") {
      if (params.turnId !== active.turn) throw new HarnessError("PROTOCOL_ERROR", "unknown");
      this.accept(active);
      return;
    }
    if (["item/started", "item/updated", "item/completed"].includes(method)) {
      const value = item.parse(params.item);
      if (value.turnId !== active.turn) return;
      const old = active.items.get(value.itemId);
      if (!old || old.revision < value.revision) {
        active.items.set(value.itemId, value);
        if (value.kind === "agentMessage") this.preview(active);
        else if (value.kind === "toolCall")
          active.request.onEvent({
            type: "activity",
            activity: method === "item/completed" ? "generating" : "tool_running",
          });
      }
      return;
    }
    if (method === "item/delta") {
      const delta = z
        .object({ itemId: nativeId, field: z.string(), delta: z.string().max(100_000) })
        .parse(raw);
      const held = active.items.get(delta.itemId);
      if (held?.turnId === active.turn && held.kind === "agentMessage" && delta.field === "text") {
        held.text = (held.text ?? "") + delta.delta;
        if (held.text.length > 100_000) throw new HarnessError("PROTOCOL_ERROR", "unknown");
        this.preview(active);
      }
      return;
    }
    if (method !== "turn/completed") return;
    const result = z
      .object({
        turnId: nativeId,
        terminal: z.string(),
        error: z.object({ kind: z.string(), retryable: z.boolean() }).optional(),
      })
      .parse(raw);
    if (result.turnId !== active.turn) throw new HarnessError("PROTOCOL_ERROR", "unknown");
    this.accept(active);
    if (result.terminal === "failed")
      active.request.onEvent({
        type: "failure",
        code:
          result.error?.kind === "authRequired"
            ? "LOGIN_REQUIRED"
            : result.error?.retryable
              ? "SERVICE_UNAVAILABLE"
              : "NATIVE_REJECTED",
      });
    // Deltas may be dropped. Read the durable final text, including failed/cancelled partial output.
    const history = z
      .object({
        session: z.object({ sessionId: nativeId }),
        history: z.object({
          mode: z.enum(["inline", "snapshot", "anchoredSnapshot"]),
          items: z.array(item).nullable(),
          snapshot: z.object({ state: z.object({ items: z.array(item) }) }).nullable(),
        }),
      })
      .parse(
        await this.transport.read("session/read", {
          sessionId: this.#session,
          excludeItems: false,
        }),
      );
    if (history.session.sessionId !== this.#session)
      throw new HarnessError("PROTOCOL_ERROR", "unknown");
    const finalItems = history.history.items ?? history.history.snapshot?.state.items;
    if (!finalItems) throw new HarnessError("NATIVE_UNKNOWN", "unknown");
    active.items.clear();
    for (const value of finalItems) {
      if (value.turnId === active.turn) active.items.set(value.itemId, value);
    }
    this.publish(active);
    active.resolve({
      status:
        result.terminal === "completed"
          ? "succeeded"
          : result.terminal === "failed"
            ? "failed"
            : result.terminal === "cancelled" && active.request.signal.aborted
              ? "cancelled"
              : "unknown",
      native_session_id: this.#session,
      native_run_id: active.turn,
    });
  }
  private active(identity: SessionIdentity, runId: string) {
    const active = this.#active;
    if (!active || identity.native_session_id !== this.#session || active.request.run_id !== runId)
      throw new HarnessError("NATIVE_REJECTED");
    return active;
  }
  async reconcile(identity: SessionIdentity, nativeRunId: string): Promise<RecoveryObservation> {
    const result = z
      .object({
        session: z.object({ sessionId: nativeId }),
        lastTurn: z
          .object({
            turnId: nativeId,
            terminal: z.string(),
            reason: z.string().optional(),
            error: z.object({ kind: z.string() }).optional(),
          })
          .optional(),
        history: z.object({
          items: z.array(item).nullable(),
          snapshot: z.object({ state: z.object({ items: z.array(item) }) }).nullable(),
        }),
      })
      .parse(
        await this.transport.read("session/read", {
          sessionId: identity.native_session_id,
          excludeItems: false,
        }),
      );
    if (result.session.sessionId !== identity.native_session_id)
      throw new HarnessError("PROTOCOL_ERROR", "unknown");
    const turn = result.lastTurn?.turnId === nativeRunId ? result.lastTurn : undefined;
    // A synthesized host-death failure does not prove the external effect failed.
    const status =
      !turn || (turn.terminal === "failed" && !turn.error)
        ? "unknown"
        : turn.terminal === "completed"
          ? "succeeded"
          : turn.terminal === "failed"
            ? "failed"
            : turn.terminal === "cancelled"
              ? "cancelled"
              : "unknown";
    return {
      ...identity,
      native_run_id: nativeRunId,
      status,
      text: (result.history.items ?? result.history.snapshot?.state.items ?? [])
        .filter((value) => value.turnId === nativeRunId && value.kind === "agentMessage")
        .map((value) => value.text ?? "")
        .join(""),
    };
  }
  async stop(identity: SessionIdentity, runId: string) {
    const active = this.active(identity, runId);
    active.stopped = true;
    if (active.accepted) {
      const result = await this.transport.command("turn/interrupt", {
        sessionId: this.#session,
        turnId: active.turn,
      });
      if (result.turnId !== active.turn) throw new HarnessError("NATIVE_UNKNOWN", "unknown");
    }
    return { confirmed: false };
  }
  async steer(identity: SessionIdentity, runId: string, text: string) {
    const active = this.active(identity, runId);
    const result = await this.transport.command("turn/steer", {
      sessionId: this.#session,
      expectedTurnId: active.turn,
      input: [{ type: "text", text }],
    });
    if (result.turnId !== active.turn) throw new HarnessError("NATIVE_UNKNOWN", "unknown");
  }
  interactions(runId: string) {
    if (this.#active?.request.run_id !== runId) throw new HarnessError("NATIVE_REJECTED");
    return JSON.parse(
      this.context.redactor.text(
        JSON.stringify({
          ...this.#interactions.snapshot(),
        }),
      ),
    );
  }
  async respond(runId: string, raw: unknown) {
    if (this.#active?.request.run_id !== runId || this.#active.request.signal.aborted)
      throw new HarnessError("NATIVE_REJECTED");
    return this.#interactions.respond(this.#session as string, raw, this.transport);
  }
  async close() {
    if (this.#closed) return;
    this.#closed = true;
    this.#active?.reject(new HarnessError("NATIVE_UNKNOWN", "unknown"));
    this.tools.close();
    await this.transport.close();
  }
}
