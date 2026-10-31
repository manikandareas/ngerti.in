import { createHash } from "node:crypto";
import { mkdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { z } from "zod";
import type { Entity } from "../../contracts";
import type { HarnessClient, Inspection, RecoveryObservation, SessionIdentity } from "../broker";
import type { LaunchContext } from "../context";
import { HarnessError, type Settings } from "../contracts";
import { productToolNames } from "../product-tool-contracts";
import { toolContentBlock } from "../tool-results";
import { CodexRpc, type RpcMessage } from "./rpc";

export const codexCapabilities = {
  resume: "supported",
  steer: "supported",
  cancel: "supported",
  permission_requests: "unsupported",
  image_input: "supported",
  video_input: "unsupported",
  compaction: "unsupported",
  product_tools: "supported",
  settings: "supported",
  native_files: "supported",
  native_shell: "supported",
  native_code: "supported",
  native_git: "supported",
  web_search: "supported",
  web_read: "supported",
} as const;
const nativeId = z.string().min(1).max(1000);
const threadResponse = z.object({
  thread: z.object({ id: nativeId }),
  model: z.string(),
  modelProvider: z.literal("openai"),
});
const toolSpec = {
  type: "function",
  name: "ngertiin_product_tool",
  description:
    "Call a scoped Ngertiin product tool. Use ngertiin.read_run_context with empty arguments for current run identity. Call ngertiin.describe_tools with empty arguments for exact product-tool argument schemas; do not infer argument names from the downstream service. Use ngertiin.list_agents to inspect profiles and revisions.",
  inputSchema: {
    type: "object",
    properties: {
      name: { type: "string", enum: productToolNames },
      arguments: { type: "object", additionalProperties: true },
    },
    required: ["name", "arguments"],
    additionalProperties: false,
  },
};
type Prompt = Parameters<HarnessClient["prompt"]>[0];
type Active = {
  request: Prompt;
  turn: string | null;
  accepted: boolean;
  stopRequested: boolean;
  resolve(value: unknown): void;
  reject(error: HarnessError): void;
  negotiated: Promise<void> | null;
};

/** Native Codex owns inference and its tool loop; this client maps observations and scoped calls. */
export class CodexClient implements HarnessClient {
  readonly rpc: CodexRpc;
  #session: string | null = null;
  #selected: Settings | null = null;
  #active: Active | null = null;
  #closed = false;
  constructor(
    executable: string,
    readonly context: LaunchContext,
    readonly workspace: string,
    private readonly toolEndpoint: () => string,
    private readonly instructions = "",
    args: string[] = [],
  ) {
    mkdirSync(workspace, { recursive: true, mode: 0o700 });
    this.rpc = new CodexRpc(executable, context, args);
    this.rpc.onMessage = (message) => {
      try {
        this.receive(message);
      } catch {
        this.#active?.reject(new HarnessError("PROTOCOL_ERROR", "unknown"));
        void this.close();
      }
    };
    this.rpc.onFailure = () => this.#active?.reject(new HarnessError("NATIVE_UNKNOWN", "unknown"));
  }
  async initialize() {
    await this.rpc.initialize();
    if (this.context.env.OPENAI_API_KEY)
      await this.rpc.request("account/login/start", {
        type: "apiKey",
        apiKey: this.context.env.OPENAI_API_KEY,
      });
  }
  async inspect(): Promise<Inspection> {
    const result = z
      .object({
        account: z
          .discriminatedUnion("type", [
            z.object({ type: z.literal("apiKey") }),
            z.object({
              type: z.literal("chatgpt"),
              email: z.string().nullable(),
              planType: z.string(),
            }),
          ])
          .nullable(),
      })
      .parse(await this.rpc.request("account/read", { refreshToken: false }));
    const key = !!this.context.env.OPENAI_API_KEY;
    if (result.account && (result.account.type === "apiKey") !== key)
      throw new HarnessError("BILLING_MISMATCH");
    let accountIdentity = result.account?.type === "chatgpt" ? result.account.email : null;
    if (!key && result.account) {
      // The native file store carries the workspace/account identity missing from account/read.
      // Read only that identifier; never publish or copy its credential payload.
      try {
        const stored = JSON.parse(
          readFileSync(join(this.context.env.CODEX_HOME, "auth.json"), "utf8"),
        );
        const accountId = stored?.tokens?.account_id;
        if (typeof accountId === "string" && accountId) accountIdentity = accountId;
      } catch {
        /* A protocol fixture or an older login may only supply an email identity. */
      }
      if (!accountIdentity) throw new HarnessError("AUTH_REJECTED");
    }
    return {
      login: result.account ? "authenticated" : "required",
      account_id: result.account
        ? createHash("sha256")
            .update(key ? this.context.env.OPENAI_API_KEY : (accountIdentity as string))
            .digest("hex")
        : null,
      auth_method: key ? "api_key" : "native_login",
      billing_source: key ? "api_key" : "subscription",
      capabilities: { ...codexCapabilities },
    };
  }
  async skills() {
    const response = z
      .object({
        data: z.array(
          z.object({
            cwd: z.string(),
            skills: z.array(
              z.object({
                name: z.string(),
                description: z.string(),
                scope: z.string(),
                enabled: z.boolean(),
              }),
            ),
            errors: z.array(z.unknown()),
          }),
        ),
      })
      .parse(await this.rpc.request("skills/list", { cwds: [this.workspace], forceReload: true }));
    if (response.data.some((item) => item.errors.length)) throw new HarnessError("PROTOCOL_ERROR");
    return response.data.flatMap((item) =>
      item.skills.map((skill) => ({
        key: `native:codex:${skill.scope}:${skill.name}`,
        name: skill.name,
        description: skill.description,
        native_source: skill.scope,
        enabled: skill.enabled,
      })),
    );
  }
  async discoverModels(): Promise<Entity<"connection">["models"]> {
    const models: Entity<"connection">["models"] = [];
    const seen = new Set<string>();
    let cursor: string | null = null;
    do {
      const page = z
        .object({
          data: z.array(
            z.object({
              model: z.string().min(1),
              inputModalities: z.array(z.enum(["text", "image"])).optional(),
              supportedReasoningEfforts: z.array(z.object({ reasoningEffort: z.string() })),
            }),
          ),
          nextCursor: z.string().nullable(),
        })
        .parse(await this.rpc.request("model/list", { cursor, limit: 100, includeHidden: false }));
      models.push(
        ...page.data.map((model) => ({
          id: model.model,
          ...(model.inputModalities ? { input_modalities: model.inputModalities } : {}),
          reasoning: model.supportedReasoningEfforts.map((effort) => effort.reasoningEffort),
        })),
      );
      cursor = page.nextCursor;
      if (models.length > 1000 || (cursor && seen.has(cursor)))
        throw new HarnessError("PROTOCOL_ERROR");
      if (cursor) seen.add(cursor);
    } while (cursor);
    return models;
  }
  private threadParams(selected: Settings) {
    return {
      model: selected.model_id,
      modelProvider: "openai",
      cwd: this.workspace,
      approvalPolicy: "never",
      ...(this.context.workspace
        ? { permissions: "ngertiin", runtimeWorkspaceRoots: [this.workspace] }
        : { sandbox: "read-only" }),
      developerInstructions: this.instructions,
      // The application supplies confined workspace guidance. Native ancestor discovery can
      // otherwise read host/repository instructions outside this conversation's grant.
      config: {
        model_reasoning_effort: selected.reasoning,
        project_doc_max_bytes: 0,
        web_search: this.context.purpose === "routing" ? "disabled" : "live",
        ...(this.context.purpose === "routing"
          ? { "features.shell_tool": false, "features.unified_exec": false, web_search: "disabled" }
          : {}),
      },
    };
  }
  private bind(result: unknown, selected: Settings, expected?: string): SessionIdentity {
    const response = threadResponse.parse(result);
    if ((expected && response.thread.id !== expected) || response.model !== selected.model_id)
      throw new HarnessError("PROTOCOL_ERROR");
    this.#session = response.thread.id;
    this.#selected = { ...selected };
    return { native_session_id: response.thread.id };
  }
  async start(selected: Settings) {
    return this.bind(
      await this.rpc.request("thread/start", {
        ...this.threadParams(selected),
        allowProviderModelFallback: false,
        ephemeral: false,
        dynamicTools: this.context.purpose === "routing" ? [] : [toolSpec],
      }),
      selected,
    );
  }
  async resume(identity: SessionIdentity, selected: Settings) {
    return this.bind(
      await this.rpc.request("thread/resume", {
        ...this.threadParams(selected),
        threadId: identity.native_session_id,
        excludeTurns: true,
      }),
      selected,
      identity.native_session_id,
    );
  }
  async settings(identity: SessionIdentity, selected: Settings) {
    if (
      identity.native_session_id !== this.#session ||
      selected.model_id !== this.#selected?.model_id ||
      selected.reasoning !== this.#selected.reasoning
    )
      throw new HarnessError("PROTOCOL_ERROR");
    // Applied atomically on each native turn. Never update process-global model settings.
  }
  async prompt(request: Prompt) {
    await this.settings(request.identity, request.settings);
    if (this.#closed || this.#active) throw new HarnessError("NATIVE_REJECTED");
    let complete: (value: unknown) => void = () => {};
    let fail: (error: HarnessError) => void = () => {};
    const done = new Promise<unknown>((resolve, reject) => {
      complete = resolve;
      fail = reject;
    });
    const active: Active = {
      request,
      turn: null,
      accepted: false,
      stopRequested: false,
      resolve: complete,
      reject: fail,
      negotiated: null,
    };
    this.#active = active;
    // Attach immediately so an event preceding the turn/start response cannot reject unobserved.
    void done.catch(() => {});
    try {
      const response = z.object({ turn: z.object({ id: nativeId }) }).parse(
        await this.rpc.request("turn/start", {
          threadId: this.#session,
          clientUserMessageId: request.run_id,
          input: [
            ...(request.learning_context
              ? [{ type: "text", text: request.learning_context, text_elements: [] }]
              : []),
            { type: "text", text: request.text, text_elements: [] },
            ...(request.images ?? []).map((url) => ({ type: "image", url })),
          ],
          model: request.settings.model_id,
          effort: request.settings.reasoning,
          approvalPolicy: "never",
          ...(this.context.workspace
            ? {
                permissions: "ngertiin",
                runtimeWorkspaceRoots: [this.workspace],
                cwd: this.workspace,
              }
            : { sandboxPolicy: { type: "readOnly", networkAccess: false } }),
        }),
      );
      this.accept(active, response.turn.id);
      if (active.stopRequested) void this.stop(request.identity, request.run_id).catch(() => {});
      return await done;
    } finally {
      if (this.#active === active) this.#active = null;
    }
  }
  private accept(active: Active, turn: string) {
    if (active.turn && active.turn !== turn) throw new HarnessError("PROTOCOL_ERROR", "unknown");
    active.turn = turn;
    if (!active.accepted) {
      active.accepted = true;
      active.request.onEvent({
        type: "accepted",
        native_session_id: active.request.identity.native_session_id,
        native_run_id: turn,
      });
    }
  }
  private receive(message: RpcMessage) {
    const active = this.#active;
    if (message.id !== undefined) {
      if (message.method === "item/tool/call") {
        const requestId = message.id;
        void this.tool(message).catch(() => {
          try {
            this.rpc.reject(requestId);
          } catch {
            /* The owned transport may already be closed. */
          }
        });
        return;
      }
      // Interactive native permissions are explicitly unsupported at this phase. Never grant escalation implicitly.
      if (
        message.method === "item/commandExecution/requestApproval" ||
        message.method === "item/fileChange/requestApproval"
      )
        this.rpc.respond(message.id, { decision: "decline" });
      else if (message.method === "item/permissions/requestApproval")
        this.rpc.respond(message.id, { permissions: {}, scope: "turn" });
      else this.rpc.reject(message.id);
      return;
    }
    if (
      !active ||
      ![
        "turn/started",
        "turn/completed",
        "item/agentMessage/delta",
        "item/started",
        "item/completed",
      ].includes(message.method ?? "")
    )
      return;
    const params = z.object({ threadId: nativeId }).passthrough().parse(message.params);
    if (params.threadId !== this.#session) return;
    if (message.method === "item/started" || message.method === "item/completed") {
      const event = z
        .object({
          turnId: nativeId,
          item: z.object({
            id: nativeId,
            type: z.string(),
            status: z.string().optional(),
            command: z.string().optional(),
            exitCode: z.number().int().nullable().optional(),
            action: z
              .object({ type: z.string(), url: z.string().nullable().optional() })
              .nullable()
              .optional(),
          }),
        })
        .parse(params);
      if (event.turnId !== active.turn) throw new HarnessError("PROTOCOL_ERROR", "unknown");
      if (event.item.type === "webSearch" && message.method === "item/completed") {
        active.request.onEvent({
          type: "native_tool",
          item_id: event.item.id,
          name: "webSearch",
          command: null,
          state: "completed",
          exit_code: null,
        });
        const action = event.item.action;
        if (action?.url && ["openPage", "findInPage"].includes(action.type)) {
          const parsed = z.url().safeParse(action.url);
          if (parsed.success)
            active.request.onEvent({
              type: "web_source",
              url: parsed.data,
              title: "Native web source",
              operation: action.type as "openPage" | "findInPage",
            });
        }
      }
      if (["commandExecution", "fileChange"].includes(event.item.type))
        active.request.onEvent({
          type: "native_tool",
          item_id: event.item.id,
          name: event.item.type,
          command: event.item.command
            ? this.context.redactor.text(event.item.command).slice(0, 8000)
            : null,
          state:
            message.method === "item/started"
              ? "started"
              : event.item.status === "failed"
                ? "failed"
                : "completed",
          exit_code: event.item.exitCode ?? null,
        });
    } else if (message.method === "turn/started") {
      this.accept(active, z.object({ id: nativeId }).parse(params.turn).id);
    } else if (message.method === "item/agentMessage/delta") {
      const delta = z.object({ turnId: nativeId, delta: z.string() }).parse(params);
      if (delta.turnId !== active.turn) throw new HarnessError("PROTOCOL_ERROR", "unknown");
      active.request.onEvent({ type: "text", text: delta.delta });
    } else {
      const turn = z
        .object({ id: nativeId, status: z.enum(["completed", "failed", "interrupted"]) })
        .parse(params.turn);
      this.accept(active, turn.id);
      if (turn.status === "failed")
        active.request.onEvent({ type: "failure", code: "NATIVE_REJECTED" });
      active.resolve({
        status:
          turn.status === "completed"
            ? "succeeded"
            : turn.status === "interrupted" && active.request.signal.aborted
              ? "cancelled"
              : turn.status === "interrupted"
                ? "unknown"
                : "failed",
        native_session_id: this.#session,
        native_run_id: turn.id,
      });
    }
  }
  private async tool(message: RpcMessage) {
    if (message.id === undefined) throw new HarnessError("PROTOCOL_ERROR");
    const active = this.#active;
    const params = z
      .object({
        threadId: nativeId,
        turnId: nativeId,
        tool: z.literal("ngertiin_product_tool"),
        namespace: z.null().optional(),
        arguments: z.object({
          name: z.string().refine((name) => productToolNames.includes(name)),
          arguments: z.record(z.string(), z.unknown()),
        }),
      })
      .parse(message.params);
    if (
      !active ||
      params.threadId !== this.#session ||
      params.turnId !== active.turn ||
      !active.accepted ||
      active.request.signal.aborted
    )
      throw new HarnessError("PROTOCOL_ERROR", "unknown");
    active.request.onEvent({ type: "activity", activity: "tool_running" });
    const rpc = async (method: string, body: unknown, notification = false) => {
      if (this.#active !== active || active.request.signal.aborted)
        throw new HarnessError("NATIVE_REJECTED");
      const response = await fetch(this.toolEndpoint(), {
        method: "POST",
        headers: {
          Authorization: `Bearer ${active.request.tools.token}`,
          "Content-Type": "application/json",
          "MCP-Protocol-Version": "2025-06-18",
        },
        body: JSON.stringify({
          jsonrpc: "2.0",
          ...(notification ? {} : { id: crypto.randomUUID() }),
          method,
          params: body,
        }),
        signal: AbortSignal.any([active.request.signal, AbortSignal.timeout(30_000)]),
      });
      if (!response.ok) throw new HarnessError("NATIVE_REJECTED");
      return notification ? null : response.json();
    };
    active.negotiated ??= (async () => {
      await rpc("initialize", {
        protocolVersion: "2025-06-18",
        capabilities: {},
        clientInfo: { name: "ngertiin-codex", version: "1.0.0" },
      });
      await rpc("notifications/initialized", {}, true);
    })();
    await active.negotiated;
    const result = z
      .object({
        result: z.object({
          content: z.array(toolContentBlock),
          isError: z.boolean(),
        }),
      })
      .parse(await rpc("tools/call", params.arguments)).result;
    if (this.#active !== active || active.request.signal.aborted)
      throw new HarnessError("NATIVE_REJECTED");
    this.rpc.respond(message.id, {
      contentItems: result.content.map((item) =>
        item.type === "text"
          ? {
              type: "inputText",
              text: this.context.redactor.text(item.text),
            }
          : { type: "inputImage", imageUrl: `data:${item.mimeType};base64,${item.data}` },
      ),
      success: !result.isError,
    });
    active.request.onEvent({ type: "activity", activity: "generating" });
  }
  async reconcile(identity: SessionIdentity, nativeRunId: string): Promise<RecoveryObservation> {
    const result = z
      .object({
        thread: z.object({
          id: nativeId,
          turns: z.array(
            z.object({
              id: nativeId,
              status: z.string(),
              items: z.array(z.object({ type: z.string(), text: z.string().optional() })),
            }),
          ),
        }),
      })
      .parse(
        await this.rpc.request("thread/read", {
          threadId: identity.native_session_id,
          includeTurns: true,
        }),
      );
    if (result.thread.id !== identity.native_session_id)
      throw new HarnessError("PROTOCOL_ERROR", "unknown");
    const turn = result.thread.turns.find((value) => value.id === nativeRunId);
    return {
      ...identity,
      native_run_id: nativeRunId,
      status:
        turn?.status === "completed"
          ? "succeeded"
          : turn?.status === "failed"
            ? "failed"
            : turn?.status === "interrupted"
              ? "cancelled"
              : "unknown",
      text:
        turn?.items
          .filter((value) => value.type === "agentMessage")
          .map((value) => value.text ?? "")
          .join("") ?? "",
    };
  }
  async steer(identity: SessionIdentity, runId: string, text: string) {
    const active = this.#active;
    if (
      !active?.turn ||
      active.request.run_id !== runId ||
      identity.native_session_id !== this.#session
    )
      throw new HarnessError("NATIVE_REJECTED");
    const result = z.object({ turnId: nativeId }).parse(
      await this.rpc.request("turn/steer", {
        threadId: this.#session,
        expectedTurnId: active.turn,
        input: [{ type: "text", text, text_elements: [] }],
      }),
    );
    if (result.turnId !== active.turn) throw new HarnessError("PROTOCOL_ERROR", "unknown");
  }
  async stop(identity: SessionIdentity, runId: string) {
    const active = this.#active;
    if (!active || active.request.run_id !== runId || identity.native_session_id !== this.#session)
      return { confirmed: false };
    active.stopRequested = true;
    if (active.turn)
      await this.rpc.request("turn/interrupt", { threadId: this.#session, turnId: active.turn });
    // Interrupt acknowledgement is intent. Only turn/completed interrupted confirms a stop.
    return { confirmed: false };
  }
  async close() {
    this.#closed = true;
    await this.rpc.close();
  }
}
