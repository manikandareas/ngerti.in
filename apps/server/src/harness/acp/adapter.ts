import { createHash } from "node:crypto";
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { z } from "zod";
import type { Entity } from "../../contracts";
import { nativeSkillMetadata } from "../../learning/contracts";
import type {
  HarnessAdapter,
  HarnessClient,
  Inspection,
  RecoveryObservation,
  SessionIdentity,
} from "../client";
import { codexModels } from "../codex/models";
import { HarnessError, type Settings, unknownCapabilities } from "../contracts";
import { localProviderKey } from "../local-profile";
import { credentialEnvironment } from "../providers";
import { SessionTools } from "../session-tools";
import { AcpConnection } from "./connection";
import { type AcpHarness, type ProfileLaunch, profileLaunch } from "./profiles";
import { AcpSession } from "./session";

type Context = Parameters<HarnessAdapter["connect"]>[0];
type Options = NonNullable<Parameters<typeof profileLaunch>[2]> & {
  launch?: typeof profileLaunch;
  diagnostic?: (line: string) => void;
  observeUpdate?: (kind: string, phase?: "commentary" | "final_answer") => void;
};
type Peer = { session: AcpSession; launch: ProfileLaunch };

export class AcpAdapter implements HarnessAdapter {
  readonly transport = "acp" as const;
  constructor(
    readonly harness: AcpHarness,
    private readonly endpoint: () => string,
    private readonly options: Options = {},
  ) {}
  async connect(context: Context): Promise<HarnessClient> {
    const client = new AcpClient(this.harness, context, this.endpoint, this.options);
    try {
      await client.initialize();
      return client;
    } catch (error) {
      await client.close();
      throw error;
    }
  }
}

/** Small compatibility seam for the application's lifecycle. No second ACP execution loop. */
export class AcpClient implements HarnessClient {
  get closeAfterRun() {
    return (
      this.context.connection?.authentication === "local_config" ||
      (this.#peer?.session.closeAfterRun ?? true)
    );
  }
  #peer: Peer | null = null;
  #opening: Promise<Peer> | null = null;
  #closed = false;
  #catalog: Entity<"connection">["models"] | null = null;
  #prepared: SessionIdentity | null = null;
  #externalAccount: string | null = null;
  #closing?: Promise<void>;

  constructor(
    readonly harness: AcpHarness,
    readonly context: Context,
    private readonly endpoint: () => string,
    private readonly options: Options = {},
  ) {}

  async initialize() {
    await this.peer();
  }

  private async peer(): Promise<Peer> {
    if (this.#closed || this.context.signal?.aborted) throw new HarnessError("ADAPTER_UNAVAILABLE");
    if (this.#peer) return this.#peer;
    this.#opening ??= this.openPeer();
    try {
      return await this.#opening;
    } finally {
      this.#opening = null;
    }
  }

  private async openPeer(): Promise<Peer> {
    const selection = this.context.connection;
    if (!selection || selection.harness !== this.harness)
      throw new HarnessError("BILLING_MISMATCH");
    if (selection.authentication === "native_login" && this.harness !== "codex")
      throw new HarnessError("CAPABILITY_UNSUPPORTED");
    const cwd =
      this.context.workspace?.root ??
      join(
        this.context.state_directory,
        "lanes",
        this.context.agent_id,
        this.context.thread_id,
        "control",
      );
    mkdirSync(cwd, { recursive: true, mode: 0o700 });
    const launch = await (this.options.launch ?? profileLaunch)(
      this.harness,
      this.context,
      this.options,
    );
    const tools = new SessionTools(
      this.endpoint,
      this.context.purpose !== "routing",
      !!this.context.machine,
      this.harness === "codex",
    );
    this.context.redactor.add(tools.token);
    let session: AcpSession | undefined;
    let correlatedTools = false;
    let connection: AcpConnection | undefined;
    try {
      connection = new AcpConnection(
        launch.executable,
        launch.args,
        launch.context,
        {
          update: async (update) => {
            const meta = update.update._meta?.ngertiin;
            const phase = meta && typeof meta === "object" && "phase" in meta ? meta.phase : null;
            this.options.observeUpdate?.(
              update.update.sessionUpdate,
              phase === "commentary" || phase === "final_answer" ? phase : undefined,
            );
            await session?.update(update);
          },
          permission: async (request, signal) =>
            session ? session.permission(request, signal) : { outcome: { outcome: "cancelled" } },
          elicitation: async (request, signal) =>
            session ? session.elicitation(request, signal) : { action: "cancel" },
          ...(this.harness === "codex"
            ? {
                refresh: async () => {
                  if (!this.context.codexAuth || this.#closed)
                    throw new HarnessError("AUTH_REJECTED");
                  const tokens = await this.context.codexAuth(true);
                  if (this.#closed || tokens.chatgptAccountId !== this.#externalAccount)
                    throw new HarnessError("AUTH_REJECTED");
                  return tokens;
                },
                nativeTurn: async (event: { sessionId: string; turnId: string }) => {
                  await session?.nativeTurn(event);
                },
              }
            : {}),
        },
        this.options.diagnostic,
        launch.native_event_prefix
          ? {
              prefix: launch.native_event_prefix,
              failure: (sessionId, code) => session?.nativeFailure(sessionId, code),
            }
          : undefined,
      );
      const initialization = await connection.bounded(
        connection.agent.request("initialize", {
          protocolVersion: 1,
          clientInfo: { name: "ngertiin", version: "2.4.0" },
          clientCapabilities: { elicitation: { form: {} }, plan: {}, session: { compaction: {} } },
        }),
      );
      if (initialization.protocolVersion !== 1) throw new HarnessError("PROTOCOL_ERROR");
      if (initialization.agentInfo?.version !== launch.adapter_version)
        throw new HarnessError("VERSION_UNKNOWN");
      if (this.harness === "codex") {
        const hook = z
          .object({
            version: z.literal(1),
            externalTokens: z.literal(true),
            turnReceipts: z.literal(true),
            turnToolCorrelation: z.boolean().optional(),
            accountCatalog: z.literal(true),
            messagePhases: z.literal(true),
            skillCatalog: z.literal(true),
          })
          .parse(await connection.bounded(connection.agent.request("_ngertiin/capabilities", {})));
        if (!hook) throw new HarnessError("CAPABILITY_UNSUPPORTED");
        correlatedTools = hook.turnToolCorrelation === true;
        if (selection.authentication === "native_login") {
          if (!this.context.codexAuth) throw new HarnessError("CAPABILITY_UNSUPPORTED");
          const tokens = await this.context.codexAuth();
          this.#externalAccount = tokens.chatgptAccountId;
          await connection.bounded(connection.agent.request("_ngertiin/external_tokens", tokens));
        } else {
          if (!initialization.authMethods?.some((method) => method.id === "api-key"))
            throw new HarnessError("CAPABILITY_UNSUPPORTED");
          await connection.bounded(
            connection.agent.request("authenticate", { methodId: "api-key" }),
          );
        }
      }
      session = new AcpSession(
        connection,
        tools,
        initialization,
        this.context.redactor,
        cwd,
        this.context.instructions ?? "",
        {
          metadata: launch.metadata,
          instruction_route: launch.instruction_route,
          unknown_error_codes: this.harness === "codex" ? [1001] : [],
          preview_roots: [cwd, ...(this.context.machine ? [this.context.machine.root] : [])],
          message_phases: this.harness === "codex",
          reusable: correlatedTools,
        },
      );
      const peer = { session, launch };
      if (this.#closed || this.context.signal?.aborted)
        throw new HarnessError("ADAPTER_UNAVAILABLE");
      this.#peer = peer;
      return peer;
    } catch (error) {
      try {
        await connection?.close();
      } finally {
        await tools.close();
      }
      throw error;
    }
  }

  async inspect(): Promise<Inspection> {
    const { session } = await this.peer();
    const selected = this.context.connection;
    if (!selected) throw new HarnessError("BILLING_MISMATCH");
    let login: Inspection["login"] = "unknown";
    let plan: string | null = null;
    let identity: string | null = null;
    const key =
      selected.authentication === "api_key" ||
      (this.harness === "codex" && selected.authentication === "local_config")
        ? this.context.env[credentialEnvironment(this.harness, selected.provider_id)]
        : undefined;
    if (this.harness === "codex") {
      const response = z
        .object({
          account: z
            .discriminatedUnion("type", [
              z.object({ type: z.literal("apiKey") }),
              z.object({ type: z.literal("chatgpt"), planType: z.string() }),
            ])
            .nullable(),
        })
        .parse(
          await session.connection.bounded(
            session.connection.agent.request("_ngertiin/account", {}),
          ),
        );
      if (
        response.account &&
        (response.account.type === "apiKey") !== (selected.billing_source === "api_key")
      )
        throw new HarnessError("BILLING_MISMATCH");
      login = response.account ? "authenticated" : "required";
      identity = response.account
        ? selected.billing_source === "api_key"
          ? (key ?? null)
          : this.#externalAccount
        : null;
      plan = response.account?.type === "chatgpt" ? response.account.planType : null;
    } else if (this.harness === "claude") {
      if (!session.initialization.agentCapabilities?.auth?.status)
        throw new HarnessError("CAPABILITY_UNKNOWN");
      const response = await session.connection.bounded(
        session.connection.agent.request("auth/status", {}),
      );
      const account = response.accounts?.find((entry) => entry.active);
      const kind = z
        .object({ claudeCode: z.object({ kind: z.string() }) })
        .safeParse(account?._meta);
      if (response.state === "authenticated") {
        if (!kind.success || kind.data.claudeCode.kind !== "api_key" || !key)
          throw new HarnessError("BILLING_MISMATCH");
        login = "authenticated";
        identity = key;
      } else login = response.state === "unauthenticated" ? "required" : "unknown";
    } else if (
      selected.authentication === "local_config" &&
      selected.billing_source === "api_key"
    ) {
      if (this.context.localProvider?.harness !== this.harness)
        throw new HarnessError("BILLING_MISMATCH");
      login = "authenticated";
      identity = localProviderKey(this.context.localProvider);
    } else if (selected.authentication === "harness_config") {
      if (this.harness !== "pi" || !this.context.nativeConfiguration)
        throw new HarnessError("BILLING_MISMATCH");
      login = "authenticated";
      identity = this.context.nativeConfiguration.apiKey;
    } else if (selected.billing_source === "free") {
      if (
        this.harness !== "opencode" ||
        selected.provider_id !== "opencode" ||
        selected.billing_source !== "free" ||
        key
      )
        throw new HarnessError("BILLING_MISMATCH");
      // The selected public provider has no login/account identity. Authentication
      // requirements are satisfied; catalog and completed inference remain separate observations.
      login = "authenticated";
    } else if (key) {
      // These peers expose no standalone remote credential check. This records only the selected
      // private key's configuration; catalog and inference remain independent observations.
      login = "authenticated";
      identity = key;
    } else login = "required";
    if (login === "authenticated" && !identity && selected.billing_source !== "free")
      throw new HarnessError("AUTH_REJECTED");
    const capabilities = session.initialization.agentCapabilities;
    return {
      login,
      account_id: identity ? createHash("sha256").update(identity).digest("hex") : null,
      account_plan: plan,
      auth_method: selected.authentication,
      billing_source: selected.billing_source,
      capabilities: {
        ...unknownCapabilities,
        resume: capabilities?.loadSession ? "supported" : "unsupported",
        product_tools: capabilities?.mcpCapabilities?.http ? "supported" : "unsupported",
        image_input: capabilities?.promptCapabilities?.image ? "supported" : "unsupported",
        video_input: "unsupported",
        steer: session.supportsSteering ? "supported" : "unsupported",
        compaction: "unknown",
        settings: "supported",
        cancel: "supported",
        permission_requests: "supported",
        native_shell: "unsupported",
        native_files: "unsupported",
        native_code: "unsupported",
        native_git: "unsupported",
      },
    };
  }

  async skills() {
    if (this.harness !== "codex") throw new HarnessError("CAPABILITY_UNKNOWN");
    const { session } = await this.peer();
    const cwd = this.context.workspace?.root ?? this.context.state_directory;
    const result = await session.connection.bounded(
      session.connection.agent.request("_ngertiin/skills", { cwd }),
    );
    return z.object({ skills: z.array(nativeSkillMetadata).max(500) }).parse(result).skills;
  }

  async discoverModels() {
    if (this.#catalog) return this.#catalog;
    const peer = await this.peer();
    if (this.harness === "codex") {
      this.#catalog = await codexModels((cursor) =>
        peer.session.connection.bounded(
          peer.session.connection.agent.request("_ngertiin/models", { cursor }),
        ),
      );
    } else {
      // This private session has not dispatched. Reuse its negotiated setup for a new run.
      // It still receives only one immutable tool lease and one prompt during this process lifetime.
      this.#prepared = await peer.session.open();
      const provider = this.context.connection?.provider_id;
      this.#catalog = peer.session
        .models()
        .filter(
          (model) =>
            !["opencode", "pi"].includes(this.harness) || model.id.startsWith(`${provider}/`),
        );
      if (this.context.connection?.billing_source === "free")
        this.#catalog = this.#catalog.filter((model) => model.id.endsWith("-free"));
    }
    return this.#catalog;
  }

  async start(settings: Settings) {
    const { session } = await this.peer();
    const identity = this.#prepared ?? (await session.open());
    this.#prepared = null;
    await session.configure(identity, settings);
    return identity;
  }
  async resume(identity: SessionIdentity, settings: Settings) {
    if (this.#prepared && this.#peer) {
      const previous = this.#peer;
      this.#prepared = null;
      this.#peer = null;
      await previous.session.close();
    }
    const { session } = await this.peer();
    const resumed = await session.open(identity);
    await session.configure(resumed, settings);
    return resumed;
  }
  async settings(identity: SessionIdentity, settings: Settings) {
    await (await this.peer()).session.configure(identity, settings);
  }
  bindingMetadata() {
    if (!this.#peer) throw new HarnessError("NATIVE_REJECTED");
    return {
      transport: "acp" as const,
      adapter_version: this.#peer.launch.adapter_version,
      native_runtime_version: this.#peer.launch.runtime_version,
      protocol_version: this.#peer.session.initialization.protocolVersion,
      process_generation: this.#peer.session.connection.generation,
      instruction_revision: createHash("sha256")
        .update(this.context.instructions ?? "")
        .digest("hex"),
    };
  }
  async prompt(request: Parameters<HarnessClient["prompt"]>[0]) {
    const selected = this.context.connection;
    if (
      ["opencode", "pi"].includes(this.harness) &&
      !request.settings.model_id.startsWith(`${selected?.provider_id}/`)
    )
      throw new HarnessError("MODEL_UNAVAILABLE");
    return (await this.peer()).session.prompt(request);
  }
  async stop(identity: SessionIdentity, runId: string) {
    return (await this.peer()).session.stop(identity, runId);
  }
  async steer(identity: SessionIdentity, runId: string, text: string) {
    if (!this.#peer) throw new HarnessError("NATIVE_REJECTED");
    return this.#peer.session.steer(identity, runId, text);
  }
  interactions(runId: string) {
    return this.#peer?.session.interactions(runId) ?? { approvals: [], user_inputs: [] };
  }
  async respond(runId: string, answer: unknown) {
    if (!this.#peer) throw new HarnessError("NATIVE_REJECTED");
    return this.#peer.session.respond(runId, answer);
  }

  async reconcile(identity: SessionIdentity, nativeRunId: string): Promise<RecoveryObservation> {
    if (this.harness !== "codex") throw new HarnessError("CAPABILITY_UNKNOWN");
    const { session } = await this.peer();
    const receipt = z
      .object({
        sessionId: z.string(),
        turn: z
          .object({
            id: z.string(),
            status: z.enum(["inProgress", "completed", "interrupted", "failed"]),
            items: z
              .array(
                z.object({
                  type: z.literal("agentMessage"),
                  text: z.string().max(100_000),
                  phase: z.string().nullable(),
                }),
              )
              .max(1000),
          })
          .nullable(),
      })
      .parse(
        await session.connection.bounded(
          session.connection.agent.request("_ngertiin/receipt", {
            sessionId: identity.native_session_id,
            turnId: nativeRunId,
          }),
        ),
      );
    if (
      receipt.sessionId !== identity.native_session_id ||
      (receipt.turn && receipt.turn.id !== nativeRunId)
    )
      throw new HarnessError("PROTOCOL_ERROR", "unknown");
    const final = receipt.turn?.items.filter((item) => item.phase === "final_answer") ?? [];
    const text = (
      final.length
        ? final
        : (receipt.turn?.items.filter((item) => item.phase !== "commentary") ?? [])
    )
      .map((item) => item.text)
      .join("\n\n");
    if (text.length > 100_000) throw new HarnessError("PROTOCOL_ERROR", "unknown");
    return {
      ...identity,
      native_run_id: nativeRunId,
      status:
        receipt.turn?.status === "completed"
          ? "succeeded"
          : receipt.turn?.status === "failed"
            ? "failed"
            : receipt.turn?.status === "interrupted"
              ? "cancelled"
              : "unknown",
      text: this.context.redactor.text(text),
    };
  }

  close() {
    this.#closed = true;
    this.#closing ??= (async () => {
      await this.#opening?.catch(() => {});
      await this.#peer?.session.close();
      this.#peer = null;
    })();
    return this.#closing;
  }
}
