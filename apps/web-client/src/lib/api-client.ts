import {
  assertScope,
  type ClientScope,
  clientScope,
  scopedFetch,
  scopedStorageKey,
} from "./client-scope";

export class ApiError extends Error {
  code: string;
  constructor(code: string, message: string) {
    super(message);
    this.code = code;
  }
}
async function withAbort<T>(signal: AbortSignal, operation: () => Promise<T>): Promise<T> {
  signal.throwIfAborted();
  let abort = () => {};
  const cancelled = new Promise<never>((_resolve, reject) => {
    abort = () => reject(signal.reason);
    signal.addEventListener("abort", abort, { once: true });
  });
  try {
    return await Promise.race([operation(), cancelled]);
  } finally {
    signal.removeEventListener("abort", abort);
  }
}
export async function request<T>(
  path: string,
  body?: unknown,
  key?: string,
  signal?: AbortSignal,
  timeoutMs = body === undefined ? 15_000 : 30_000,
  scope: ClientScope | null = clientScope(),
): Promise<T> {
  const deadline = new AbortController();
  const signals = [signal, deadline.signal, scope?.abort.signal].filter(
    (value): value is AbortSignal => !!value,
  );
  const connection = AbortSignal.any(signals);
  const timer = setTimeout(
    () => deadline.abort(new Error("Request timed out. Reconnecting…")),
    timeoutMs,
  );
  try {
    return await withAbort(connection, async () => {
      const response = await scopedFetch(
        path,
        {
          method: body === undefined ? "GET" : "POST",
          signal: connection,
          cache: "no-store",
          headers:
            body === undefined
              ? {}
              : { "Content-Type": "application/json", ...(key ? { "Idempotency-Key": key } : {}) },
          body: body === undefined ? undefined : JSON.stringify(body),
        },
        scope,
      );
      const value = await response.json().catch(() => {
        connection.throwIfAborted();
        if (response.ok)
          throw new ApiError("INVALID_RESPONSE", "Invalid server response. Reconnecting…");
        return null;
      });
      assertScope(scope);
      if (!response.ok)
        throw new ApiError(
          value?.error?.code ?? "API_UNAVAILABLE",
          value?.error?.message ??
            "Backend belum dapat dihubungi. Periksa service lokal lalu coba lagi.",
        );
      return value as T;
    });
  } finally {
    clearTimeout(timer);
  }
}
export function command<T>(path: string, body: unknown = {}) {
  return request<T>(path, body, crypto.randomUUID());
}

export function pendingMessage(threadId: string): string | null {
  return pendingText(`message:${threadId}`);
}
export function pendingText(slot: string): string | null {
  const saved = localStorage.getItem(scopedStorageKey(`ngertiin:pending:${slot}`));
  if (!saved) return null;
  try {
    return (JSON.parse(saved) as { body: { text: string } }).body.text;
  } catch {
    return null;
  }
}

// Persist the exact operation before sending. A lost acknowledgement reuses its body and key.
export async function durableCommand<T>(slot: string, path: string, body: unknown): Promise<T> {
  const scope = clientScope();
  const storageKey = scopedStorageKey(`ngertiin:pending:${slot}`, scope);
  const saved = localStorage.getItem(storageKey);
  const operation = saved
    ? (JSON.parse(saved) as { path: string; body: unknown; key: string })
    : { path, body, key: crypto.randomUUID() };
  localStorage.setItem(storageKey, JSON.stringify(operation));
  try {
    const result = await request<T>(
      operation.path,
      operation.body,
      operation.key,
      undefined,
      30_000,
      scope,
    );
    localStorage.removeItem(storageKey);
    return result;
  } catch (error) {
    // Explicit validation/auth/domain rejection is not a lost acknowledgement.
    if (
      error instanceof ApiError &&
      ["INVALID_REQUEST", "SCOPE_DENIED", "UNAUTHORIZED", "NOT_FOUND"].includes(error.code)
    )
      localStorage.removeItem(storageKey);
    throw error;
  }
}

/** Complete SSE frames only; UTF-8 and network chunks need not align with events. */
export interface WorkspaceEvent {
  conversation_part?: import("@/types/workspace").ConversationPart;
  conversation_thread_id?: string;
  cursor: number;
  entity_kind: string;
  entity_id: string;
  revision: number;
  data: {
    id: string;
    kind: string;
    revision: number;
    thread_id?: string;
    input_message_id?: string;
    message_id?: string;
    purpose?: string;
    [key: string]: unknown;
  };
}
export async function followEvents(
  after: number,
  signal: AbortSignal,
  update: (cursor: number, event: WorkspaceEvent) => Promise<void> | void,
  inactivityMs = 35_000,
) {
  const stalled = new AbortController();
  const scope = clientScope();
  const connection = AbortSignal.any([
    signal,
    stalled.signal,
    ...(scope ? [scope.abort.signal] : []),
  ]);
  // A proxy can leave an old response open across backend restart. Bound only
  // network waits; processing a batch must not consume the heartbeat budget.
  const receive = async <T>(operation: () => Promise<T>): Promise<T> => {
    const timer = setTimeout(
      () => stalled.abort(new Error("Event connection lost. Reconnecting…")),
      inactivityMs,
    );
    try {
      return await withAbort(connection, operation);
    } finally {
      clearTimeout(timer);
    }
  };
  const response = await receive(() =>
    scopedFetch(`/v1/events/stream?after=${after}`, { signal: connection }, scope),
  );
  if (!response.ok || !response.body) throw new Error("Event connection unavailable");
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  try {
    while (!signal.aborted) {
      const chunk = await receive(() => reader.read());
      if (chunk.done) break;
      buffer += decoder.decode(chunk.value, { stream: true }).replaceAll("\r\n", "\n");
      let boundary = buffer.indexOf("\n\n");
      while (boundary >= 0) {
        const frame = buffer.slice(0, boundary);
        buffer = buffer.slice(boundary + 2);
        const data = frame
          .split("\n")
          .filter((line) => line.startsWith("data:"))
          .map((line) => line.slice(5).trimStart())
          .join("\n");
        if (data) {
          const event = JSON.parse(data) as WorkspaceEvent;
          if (event.cursor > after) {
            await update(event.cursor, event);
            after = event.cursor;
          }
        }
        boundary = buffer.indexOf("\n\n");
      }
    }
  } finally {
    // A broken stream's cancellation must not hold the next connection hostage.
    void reader.cancel().catch(() => {});
    reader.releaseLock();
  }
}
