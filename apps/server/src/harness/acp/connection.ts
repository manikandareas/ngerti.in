import * as acp from "@agentclientprotocol/sdk/unstable";
import { z } from "zod";
import type { LaunchContext } from "../context";
import { HarnessError } from "../contracts";
import { OwnedProcess } from "../process";

const nativeEvent = z.discriminatedUnion("type", [
  z.strictObject({ type: z.literal("ready") }),
  z.strictObject({
    type: z.literal("failure"),
    sessionId: z.string().min(1).max(1000),
    code: z.literal("PROVIDER_LIMIT"),
  }),
]);

/** The SDK owns framing, validation and pending requests. Ngertiin owns the process lifetime. */
export class AcpConnection {
  readonly process: OwnedProcess;
  readonly peer: acp.ClientConnection;
  readonly generation = crypto.randomUUID();
  readonly nativeReady: Promise<void>;
  #closing?: Promise<void>;

  constructor(
    executable: string,
    args: string[],
    context: LaunchContext,
    handlers: {
      update(notification: acp.SessionNotification): Promise<void>;
      permission(
        request: acp.RequestPermissionRequest,
        signal: AbortSignal,
      ): Promise<acp.RequestPermissionResponse>;
      elicitation?(
        request: acp.CreateElicitationRequest,
        signal: AbortSignal,
      ): Promise<acp.CreateElicitationResponse>;
      refresh?(): Promise<{
        accessToken: string;
        chatgptAccountId: string;
        chatgptPlanType?: string;
      }>;
      nativeTurn?(event: { sessionId: string; turnId: string }): Promise<void>;
    },
    diagnostic: (line: string) => void = () => {},
    nativeEvents?: { prefix: string; failure(sessionId: string, code: "PROVIDER_LIMIT"): void },
  ) {
    let ready = () => {};
    this.nativeReady = nativeEvents
      ? new Promise<void>((resolve) => {
          ready = resolve;
        })
      : Promise.resolve();
    this.process = new OwnedProcess(
      executable,
      args,
      { ...context, ownedProcessTree: true },
      (line) => {
        if (!nativeEvents || !line.startsWith(`${nativeEvents.prefix} `)) {
          diagnostic(line);
          return;
        }
        // Only a private launch hook can emit these bounded, process-bound records.
        // Ordinary diagnostics and raw provider messages never establish a failure.
        if (line.length > 2048) return;
        try {
          const event = nativeEvent.parse(JSON.parse(line.slice(nativeEvents.prefix.length + 1)));
          if (event.type === "ready") ready();
          else nativeEvents.failure(event.sessionId, event.code);
        } catch {
          /* Invalid private records cannot settle a run. */
        }
      },
    );
    const child = this.process.child;
    const output = new WritableStream<Uint8Array>({
      async write(bytes) {
        child.stdin.write(bytes);
        await child.stdin.flush();
      },
      close() {
        child.stdin.end();
      },
    });
    const client = acp
      .client({ name: "ngertiin" })
      .onNotification(acp.methods.client.session.update, async ({ params }) => {
        try {
          await handlers.update(params);
        } catch {
          this.peer.close(new HarnessError("PROTOCOL_ERROR", "unknown"));
        }
      })
      .onRequest(acp.methods.client.session.requestPermission, ({ params, signal }) =>
        handlers.permission(params, signal),
      )
      .onRequest(
        acp.methods.client.elicitation.create,
        ({ params, signal }) => handlers.elicitation?.(params, signal) ?? { action: "cancel" },
      );
    if (handlers.refresh)
      client.onRequest("_ngertiin/refresh", z.strictObject({}), () => handlers.refresh?.());
    if (handlers.nativeTurn)
      client.onNotification(
        "_ngertiin/turn",
        z.object({ sessionId: z.string().min(1).max(1000), turnId: z.string().min(1).max(1000) }),
        async ({ params }) => {
          await handlers.nativeTurn?.(params);
        },
      );
    this.peer = client.connect(
      acp.ndJsonStream(output, child.stdout, { maxMessageBytes: 1_048_576 }),
    );
    void child.exited.then(async () => {
      // Let the SDK drain already-written final frames before closing pending requests.
      // A descendant retaining stdout cannot keep a dead peer alive indefinitely.
      const timer = setTimeout(() => this.peer.close(), 1000);
      try {
        await this.peer.closed;
      } finally {
        clearTimeout(timer);
      }
    });
    // Explicit close still reports cleanup failures; transport shutdown must not leak an unhandled rejection.
    void this.peer.closed.then(() => this.process.close()).catch(() => {});
  }

  get agent() {
    return this.peer.agent;
  }

  /** Prompt turns have no arbitrary inference deadline; setup and control requests are bounded. */
  async bounded<T>(operation: Promise<T>, timeoutMs = 30_000): Promise<T> {
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      return await Promise.race([
        operation,
        new Promise<never>((_, reject) => {
          timer = setTimeout(() => {
            this.peer.close();
            void this.process.close().catch(() => {});
            reject(new HarnessError("NATIVE_UNKNOWN", "unknown"));
          }, timeoutMs);
        }),
      ]);
    } finally {
      clearTimeout(timer);
    }
  }

  close() {
    this.#closing ??= (async () => {
      this.peer.close();
      await this.process.close();
      await this.peer.closed;
    })();
    return this.#closing;
  }
}
