import * as acp from "@agentclientprotocol/sdk/unstable";
import { z } from "zod";
import type { Entity } from "../../contracts";
import type { HarnessClient, SessionIdentity } from "../client";
import type { Redactor } from "../context";
import { HarnessError, interactionAnswer, NativeSessionMissing, type Settings } from "../contracts";
import { approvalDisplay, type InteractionSnapshot } from "../interaction-contracts";
import type { SessionTools } from "../session-tools";
import type { AcpConnection } from "./connection";
import { elicitationForm } from "./elicitation";
import { AcpProjection, promptOutcome } from "./projection";

type Prompt = Parameters<HarnessClient["prompt"]>[0];
type Permission = {
  view: InteractionSnapshot["approvals"][number];
  settle(value: acp.RequestPermissionResponse): void;
};
type ActivePrompt = {
  request: Prompt;
  observed: boolean;
  observing?: Promise<void>;
  cancelSent: boolean;
  projection: AcpProjection;
  lastTextAt: number;
  finishing: boolean;
  nativeTurnId?: string;
  failure?: "PROVIDER_LIMIT";
};

/** Application session behavior shared by every ACP launch/auth profile. One prompt per process. */
export class AcpSession {
  get closeAfterRun() {
    return !this.options.reusable || this.#spent;
  }
  readonly #seenTurns = new Set<string>();
  #session: string | null = null;
  #options: acp.SessionConfigOption[] = [];
  #commands: acp.AvailableCommand[] = [];
  readonly #setupCommands = new Map<string, acp.AvailableCommand[]>();
  #active: ActivePrompt | null = null;
  #spent = false;
  #updates = Promise.resolve();
  #pendingText?: {
    active: ActivePrompt;
    update: acp.SessionNotification["update"];
    completion: Promise<void>;
  };
  #updateError: unknown;
  #textTimer?: ReturnType<typeof setTimeout>;
  #closing?: Promise<void>;
  readonly #permissions = new Map<string, Permission>();
  readonly #forms = new Map<
    string,
    {
      form: ReturnType<typeof elicitationForm>;
      settle(value: acp.CreateElicitationResponse): void;
    }
  >();

  constructor(
    readonly connection: AcpConnection,
    readonly tools: SessionTools,
    readonly initialization: acp.InitializeResponse,
    readonly redactor: Redactor,
    private readonly cwd: string,
    private readonly instructions: string,
    private readonly options: {
      metadata?: Record<string, unknown>;
      instruction_route?: "system_prompt" | "profile";
      unknown_error_codes?: readonly number[];
      preview_roots?: readonly string[];
      message_phases?: boolean;
      reusable?: boolean;
    } = {},
  ) {}

  get supportsSteering() {
    return z
      .object({ steering: z.object({ supported: z.literal(true) }) })
      .safeParse(this.initialization._meta).success;
  }

  private setup() {
    const systemPrompt = this.initialization.agentCapabilities?.sessionCapabilities?.systemPrompt;
    // Profiles must supply a separately verified instruction route for peers without this capability.
    if (this.instructions && !systemPrompt && this.options.instruction_route !== "profile")
      throw new HarnessError("CAPABILITY_UNSUPPORTED");
    if (!this.initialization.agentCapabilities?.mcpCapabilities?.http)
      throw new HarnessError("CAPABILITY_UNSUPPORTED");
    const config = this.tools.config.ngertiin;
    return {
      cwd: this.cwd,
      mcpServers: [
        {
          type: "http" as const,
          name: "ngertiin",
          url: config.url,
          headers: [{ name: "Authorization", value: config.headers.Authorization }],
        },
      ],
      ...(this.instructions && this.options.instruction_route !== "profile"
        ? {
            systemPrompt: {
              mode: "append" as const,
              content: [{ type: "text" as const, text: this.instructions }],
            },
          }
        : {}),
      _meta: this.options.metadata ?? {},
    };
  }

  async open(identity?: SessionIdentity): Promise<SessionIdentity> {
    if (this.#session || this.#spent) throw new HarnessError("NATIVE_REJECTED");
    if (identity && !this.initialization.agentCapabilities?.loadSession)
      throw new HarnessError("CAPABILITY_UNSUPPORTED");
    // Replay is delivered while there is no active prompt and cannot publish answers or effects.
    let response: acp.LoadSessionResponse;
    if (identity) {
      try {
        response = await this.connection.bounded<acp.LoadSessionResponse>(
          this.connection.agent.request("session/load", {
            ...this.setup(),
            sessionId: identity.native_session_id,
          }),
        );
      } catch (error) {
        if (error instanceof acp.RequestError && error.code === -32002)
          throw new NativeSessionMissing();
        throw error;
      }
      this.#session = identity.native_session_id;
    } else {
      const created = await this.connection.bounded<acp.NewSessionResponse>(
        this.connection.agent.request("session/new", this.setup()),
      );
      this.#session = created.sessionId;
      response = created;
    }
    if (!this.#session || this.#session.length > 1000) throw new HarnessError("PROTOCOL_ERROR");
    await this.connection.bounded(this.connection.nativeReady);
    this.#options = response ? (response.configOptions ?? []) : [];
    this.#commands = this.#setupCommands.get(this.#session) ?? [];
    this.#setupCommands.clear();
    return { native_session_id: this.#session };
  }

  models(): Entity<"connection">["models"] {
    const selected = this.#options.find(
      (option) => option.category === "model" && option.type === "select",
    );
    const reasoning = this.#options.find(
      (option) => option.category === "thought_level" && option.type === "select",
    );
    const levels =
      reasoning?.type === "select" ? selectValues(reasoning).map((option) => option.value) : [];
    const modalities: ("text" | "image")[] = this.initialization.agentCapabilities
      ?.promptCapabilities?.image
      ? ["text", "image"]
      : ["text"];
    if (selected?.type === "select")
      return selectValues(selected).map((option) => ({
        id: option.value,
        reasoning: levels,
        input_modalities: modalities,
      }));
    return [];
  }

  async configure(identity: SessionIdentity, settings: Settings) {
    this.assertSession(identity);
    if (this.#active || this.#spent) throw new HarnessError("NATIVE_REJECTED");
    const model = this.#options.find((option) => option.category === "model");
    if (!model) throw new HarnessError("CAPABILITY_UNSUPPORTED");
    await this.select(model, settings.model_id);
    if (settings.reasoning !== null) {
      const reasoning = this.#options.find((option) => option.category === "thought_level");
      if (!reasoning) throw new HarnessError("CAPABILITY_UNSUPPORTED");
      await this.select(reasoning, settings.reasoning);
    }
  }

  private async select(option: acp.SessionConfigOption, value: string) {
    if (option.type !== "select" || !selectValues(option).some((entry) => entry.value === value))
      throw new HarnessError("MODEL_UNAVAILABLE");
    if (option.currentValue === value) return;
    const response = await this.connection.bounded(
      this.connection.agent.request("session/set_config_option", {
        sessionId: this.#session as string,
        configId: option.id,
        value,
      }),
    );
    this.#options = response.configOptions;
    if (!this.#options.some((entry) => entry.id === option.id && entry.currentValue === value))
      throw new HarnessError("MODEL_UNAVAILABLE");
  }

  private assertSession(identity: SessionIdentity) {
    if (!this.#session || identity.native_session_id !== this.#session)
      throw new HarnessError("NATIVE_REJECTED");
  }

  async update(notification: acp.SessionNotification) {
    if (notification.update.sessionUpdate === "available_commands_update") {
      const commands = notification.update.availableCommands;
      if (commands.length > 100 || commands.some((command) => command.name.length > 100))
        throw new HarnessError("PROTOCOL_ERROR", "unknown");
      if (notification.sessionId === this.#session) this.#commands = commands;
      else if (!this.#session && this.#setupCommands.size < 2)
        this.#setupCommands.set(notification.sessionId, commands);
      if (!this.#active) return;
    }
    const active = this.#active;
    if (!active || notification.sessionId !== this.#session) return;
    const incoming = notification.update;
    const pending = this.#pendingText;
    const isText =
      incoming.sessionUpdate === "agent_message_chunk" && incoming.content.type === "text";
    if (
      isText &&
      incoming.content.type === "text" &&
      pending?.active === active &&
      pending.update.sessionUpdate === "agent_message_chunk" &&
      pending.update.content.type === "text" &&
      pending.update.messageId === incoming.messageId &&
      JSON.stringify(pending.update._meta) === JSON.stringify(incoming._meta)
    ) {
      if (pending.update.content.text.length + incoming.content.text.length > 100_000) {
        this.updateFailed(new HarnessError("PROTOCOL_ERROR", "unknown"));
        return;
      }
      pending.update.content.text += incoming.content.text;
      return pending.completion;
    }
    const queued = { active, update: incoming, completion: Promise.resolve() };
    this.#pendingText = isText ? queued : undefined;
    this.#updates = this.#updates
      .then(async () => {
        if (this.#pendingText === queued) this.#pendingText = undefined;
        if (this.#active !== active) return;
        const update = queued.update;
        if (update.sessionUpdate === "config_option_update") {
          if (
            update.configOptions.some(
              (option) =>
                option.category === "model" &&
                option.currentValue !== active.request.settings.model_id,
            )
          )
            throw new HarnessError("BILLING_MISMATCH", "unknown");
          this.#options = update.configOptions;
          return;
        }
        await this.observed();
        const events = active.projection.update(update);
        if (update.sessionUpdate === "agent_message_chunk" && update.content.type === "text") {
          if (!active.finishing) {
            if (!active.lastTextAt || Date.now() - active.lastTextAt >= 40)
              await this.flushText(active);
            else this.scheduleText(active);
          }
        } else {
          await this.flushText(active);
          for (const event of events) await active.request.onEvent(event);
        }
      })
      .catch((error) => this.updateFailed(error));
    queued.completion = this.#updates;
    await this.#updates;
  }

  private updateFailed(error: unknown) {
    this.#updateError ??= error;
    this.tools.revoke();
    void this.connection.close().catch(() => {});
  }

  private async flushText(active: ActivePrompt) {
    clearTimeout(this.#textTimer);
    this.#textTimer = undefined;
    const event = active.projection.flush();
    if (!event) return;
    active.lastTextAt = Date.now();
    await active.request.onEvent(event);
  }

  private scheduleText(active: ActivePrompt) {
    if (this.#textTimer) return;
    this.#textTimer = setTimeout(
      () => {
        this.#textTimer = undefined;
        this.#updates = this.#updates
          .then(async () => {
            if (this.#active === active && !active.finishing) await this.flushText(active);
          })
          .catch((error) => this.updateFailed(error));
      },
      Math.max(1, 40 - (Date.now() - active.lastTextAt)),
    );
  }

  private async observed() {
    const active = this.#active;
    if (!active || active.observed) return;
    active.observing ??= (async () => {
      await active.request.onEvent({
        type: "accepted",
        native_session_id: this.#session as string,
        native_run_id: null,
      });
      active.observed = true;
      if (this.#commands.length)
        for (const event of active.projection.update({
          sessionUpdate: "available_commands_update",
          availableCommands: this.#commands,
        }))
          await active.request.onEvent(event);
    })();
    await active.observing;
  }

  async nativeTurn(event: { sessionId: string; turnId: string }) {
    const active = this.#active;
    if (!active || event.sessionId !== this.#session || this.#seenTurns.has(event.turnId)) return;
    if (active.nativeTurnId && active.nativeTurnId !== event.turnId)
      throw new HarnessError("PROTOCOL_ERROR", "unknown");
    active.nativeTurnId = event.turnId;
    this.#seenTurns.add(event.turnId);
    await this.observed();
    await active.request.onEvent({ type: "dispatch", native_run_id: event.turnId });
  }

  async prompt(request: Prompt) {
    this.assertSession(request.identity);
    if (this.#active || this.#spent || request.signal.aborted)
      throw new HarnessError("NATIVE_REJECTED");
    const command = /^\/([^/\s]+)(?:\s|$)/.exec(request.text.trimStart())?.[1];
    if (
      command &&
      (!["compact", "review"].includes(command) ||
        !this.#commands.some((entry) => entry.name === command))
    )
      throw new HarnessError("CAPABILITY_UNSUPPORTED");
    const images = (request.images ?? []).map((uri): acp.ContentBlock => {
      const match = /^data:(image\/[\w.+-]+);base64,([A-Za-z0-9+/=]+)$/.exec(uri);
      if (!match || !this.initialization.agentCapabilities?.promptCapabilities?.image)
        throw new HarnessError("CAPABILITY_UNSUPPORTED");
      return { type: "image", mimeType: match[1], data: match[2] };
    });
    this.#spent = true;
    this.#active = {
      request,
      observed: false,
      cancelSent: false,
      projection: new AcpProjection(
        this.redactor,
        this.options.preview_roots ?? [this.cwd],
        this.options.message_phases,
      ),
      lastTextAt: 0,
      finishing: false,
    };
    const active = this.#active;
    this.tools.active = {
      lease: request.tools,
      signal: request.signal,
      beforeCall: () => this.observed(),
      ...(this.options.reusable
        ? {
            validateCall: (metadata: unknown) => {
              const correlation = z
                .object({
                  "x-codex-turn-metadata": z.object({ thread_id: z.string(), turn_id: z.string() }),
                })
                .safeParse(metadata);
              if (
                !correlation.success ||
                !active.nativeTurnId ||
                correlation.data["x-codex-turn-metadata"].thread_id !== this.#session ||
                correlation.data["x-codex-turn-metadata"].turn_id !== active.nativeTurnId
              )
                throw new HarnessError("NATIVE_REJECTED");
            },
          }
        : {}),
      accepted: () => this.#active === active && active.observed,
      delivered: () => {
        void request.onEvent({ type: "activity", activity: "generating" });
      },
    };
    const cancel = () => {
      void this.stop(request.identity, request.run_id).catch(() => {});
    };
    request.signal.addEventListener("abort", cancel, { once: true });
    try {
      const response = await this.connection.agent.request("session/prompt", {
        sessionId: this.#session as string,
        prompt: [
          ...(request.learning_context
            ? [{ type: "text" as const, text: request.learning_context }]
            : []),
          { type: "text", text: request.text },
          ...images,
        ],
      });
      active.finishing = true;
      clearTimeout(this.#textTimer);
      await this.#updates;
      if (this.#updateError) throw this.#updateError;
      if (active.failure) throw new HarnessError(active.failure);
      const status = promptOutcome(response.stopReason);
      if (this.options.reusable && !active.nativeTurnId)
        throw new HarnessError("NATIVE_UNKNOWN", "unknown");
      await this.observed();
      await request.onEvent(active.projection.final());
      if (this.options.reusable && status === "succeeded" && !request.signal.aborted)
        this.#spent = false;
      return { status, native_session_id: this.#session, native_run_id: null };
    } catch (error) {
      active.finishing = true;
      clearTimeout(this.#textTimer);
      await this.#updates;
      if (active.observed) await request.onEvent(active.projection.final());
      if (active.failure) {
        await this.connection.close();
        await request.onEvent({ type: "failure", code: active.failure });
        return { status: "failed", native_session_id: this.#session, native_run_id: null };
      }
      if (error instanceof acp.RequestError && !this.connection.peer.signal.aborted) {
        if (this.options.unknown_error_codes?.includes(error.code))
          throw new HarnessError("NATIVE_UNKNOWN", "unknown");
        if (error.code === -32000)
          await request.onEvent({ type: "failure", code: "LOGIN_REQUIRED" });
        else await request.onEvent({ type: "failure", code: "NATIVE_REJECTED" });
        // An explicit peer error is terminal failure. A lost transport acknowledgement is unknown.
        return { status: "failed", native_session_id: this.#session, native_run_id: null };
      }
      throw new HarnessError("NATIVE_UNKNOWN", "unknown");
    } finally {
      clearTimeout(this.#textTimer);
      request.signal.removeEventListener("abort", cancel);
      if (this.options.reusable && !this.#spent) this.tools.active = null;
      else this.tools.revoke();
      this.clearPermissions();
      this.#active = null;
    }
  }

  nativeFailure(sessionId: string, code: "PROVIDER_LIMIT") {
    const active = this.#active;
    if (!active || active.finishing || sessionId !== this.#session) return;
    active.failure ??= code;
    this.tools.revoke();
    this.clearPermissions();
    // Stop the owned process while the SDK drains frames already written to stdout.
    // Closing the peer here would race a final text update on the separate pipe.
    void this.connection.process.close().catch(() => this.connection.peer.close());
  }

  async stop(identity: SessionIdentity, runId: string) {
    this.assertSession(identity);
    const active = this.#active;
    if (!active || active.request.run_id !== runId) throw new HarnessError("NATIVE_REJECTED");
    this.tools.revoke();
    this.clearPermissions();
    if (!active.cancelSent) {
      active.cancelSent = true;
      await this.connection.agent.notify("session/cancel", {
        sessionId: identity.native_session_id,
      });
    }
    return { confirmed: false };
  }

  async steer(identity: SessionIdentity, runId: string, text: string) {
    this.assertSession(identity);
    if (!this.supportsSteering) throw new HarnessError("CAPABILITY_UNSUPPORTED");
    const active = this.#active;
    if (
      !active ||
      active.request.run_id !== runId ||
      active.cancelSent ||
      active.request.signal.aborted ||
      !active.observed
    )
      throw new HarnessError("NATIVE_REJECTED");
    const response = await this.connection.bounded(
      this.connection.agent.request("_session/steering", {
        sessionId: identity.native_session_id,
        prompt: [{ type: "text", text }],
        // The app owns new admission. Never let an idle race start an unjournaled turn.
        _meta: { steering: { idleBehavior: "promptRequired" } },
      }),
    );
    const result = z
      .discriminatedUnion("outcome", [
        z.object({ outcome: z.literal("injected") }),
        z.object({ outcome: z.literal("promptRequired") }),
      ])
      .safeParse(response);
    if (!result.success) throw new HarnessError("PROTOCOL_ERROR", "unknown");
    if (result.data.outcome === "promptRequired") throw new HarnessError("NATIVE_REJECTED");
  }

  async permission(
    request: acp.RequestPermissionRequest,
    signal: AbortSignal,
  ): Promise<acp.RequestPermissionResponse> {
    const active = this.#active;
    if (!active || request.sessionId !== this.#session || signal.aborted)
      return { outcome: { outcome: "cancelled" } };
    await this.observed();
    if (
      this.#active !== active ||
      active.cancelSent ||
      signal.aborted ||
      active.request.signal.aborted
    )
      return { outcome: { outcome: "cancelled" } };
    if (
      this.#permissions.size >= 100 ||
      new Set(request.options.map((option) => option.optionId)).size !== request.options.length
    )
      throw new HarnessError("PROTOCOL_ERROR", "unknown");
    const id = crypto.randomUUID();
    const view = approvalDisplay.parse({
      approvalId: id,
      currentRequirementId: { approvalId: id, sourceIndex: 0 },
      availableChoices: request.options.map((option) => ({
        choiceId: option.optionId,
        decision: option.kind,
        scope: option.kind.endsWith("_always") ? "session" : "run",
        label: this.redactor.text(option.name),
      })),
      subject: {
        kind: "tool",
        toolName: this.redactor.text(request.toolCall.name ?? "Tool").slice(0, 200),
      },
    });
    let settle!: Permission["settle"];
    const response = new Promise<acp.RequestPermissionResponse>((resolve) => {
      settle = resolve;
    });
    this.#permissions.set(id, { view, settle });
    const cancel = () => settle({ outcome: { outcome: "cancelled" } });
    signal.addEventListener("abort", cancel, { once: true });
    if (signal.aborted) cancel();
    try {
      return await response;
    } finally {
      signal.removeEventListener("abort", cancel);
      this.#permissions.delete(id);
    }
  }

  interactions(runId: string): InteractionSnapshot {
    if (this.#active?.request.run_id !== runId) return { approvals: [], user_inputs: [] };
    return {
      approvals: [...this.#permissions.values()].map((entry) => entry.view),
      user_inputs: [...this.#forms.values()].map((entry) => entry.form.view),
    };
  }

  async respond(runId: string, raw: unknown) {
    const answer = interactionAnswer.parse(raw);
    if (
      this.#active?.request.run_id !== runId ||
      this.#active.cancelSent ||
      this.#active.request.signal.aborted
    )
      throw new HarnessError("NATIVE_REJECTED");
    if (answer.type === "user_input") {
      const pending = this.#forms.get(answer.request_id);
      if (!pending) throw new HarnessError("NATIVE_REJECTED");
      const response = pending.form.answer(answer);
      this.#forms.delete(answer.request_id);
      pending.settle(response);
      return { status: "submitted" };
    }
    const pending = this.#permissions.get(answer.request_id);
    if (
      !pending ||
      answer.source_index !== 0 ||
      !pending.view.availableChoices.some((option) => option.choiceId === answer.choice_id)
    )
      throw new HarnessError("NATIVE_REJECTED");
    this.#permissions.delete(answer.request_id);
    pending.settle({ outcome: { outcome: "selected", optionId: answer.choice_id } });
    return { status: "submitted" };
  }

  private clearPermissions() {
    for (const pending of this.#permissions.values())
      pending.settle({ outcome: { outcome: "cancelled" } });
    this.#permissions.clear();
    for (const pending of this.#forms.values()) pending.settle({ action: "cancel" });
    this.#forms.clear();
  }

  async elicitation(
    request: acp.CreateElicitationRequest,
    signal: AbortSignal,
  ): Promise<acp.CreateElicitationResponse> {
    const active = this.#active;
    if (
      !active ||
      !("sessionId" in request) ||
      request.sessionId !== this.#session ||
      request.mode !== "form" ||
      signal.aborted ||
      active.cancelSent ||
      active.request.signal.aborted
    )
      return { action: "cancel" };
    if (this.#forms.size >= 100) throw acp.RequestError.invalidParams();
    let form: ReturnType<typeof elicitationForm>;
    try {
      form = elicitationForm(request, this.redactor);
    } catch {
      throw acp.RequestError.invalidParams(undefined, "Unsupported or invalid form schema.");
    }
    await this.observed();
    if (
      this.#active !== active ||
      signal.aborted ||
      active.cancelSent ||
      active.request.signal.aborted
    )
      return { action: "cancel" };
    let settle!: (value: acp.CreateElicitationResponse) => void;
    const response = new Promise<acp.CreateElicitationResponse>((resolve) => {
      settle = resolve;
    });
    this.#forms.set(form.view.userInputId, { form, settle });
    const cancel = () => settle({ action: "cancel" });
    signal.addEventListener("abort", cancel, { once: true });
    if (signal.aborted) cancel();
    try {
      return await response;
    } finally {
      signal.removeEventListener("abort", cancel);
      this.#forms.delete(form.view.userInputId);
    }
  }

  close() {
    this.#closing ??= (async () => {
      clearTimeout(this.#textTimer);
      this.tools.revoke();
      this.clearPermissions();
      try {
        await this.connection.close();
      } finally {
        await this.tools.close();
      }
    })();
    return this.#closing;
  }
}

function selectValues(
  option: acp.SessionConfigOption & { type: "select" },
): acp.SessionConfigSelectOption[] {
  return option.options.flatMap((entry) => ("group" in entry ? entry.options : [entry]));
}
