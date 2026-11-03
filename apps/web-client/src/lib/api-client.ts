export class ApiError extends Error {
  code: string;
  constructor(code: string, message: string) {
    super(message);
    this.code = code;
  }
}
export async function request<T>(
  path: string,
  body?: unknown,
  key?: string,
  signal?: AbortSignal,
): Promise<T> {
  const response = await fetch(path, {
    method: body === undefined ? "GET" : "POST",
    signal,
    headers:
      body === undefined
        ? {}
        : { "Content-Type": "application/json", ...(key ? { "Idempotency-Key": key } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const value = await response.json().catch(() => null);
  if (!response.ok)
    throw new ApiError(
      value?.error?.code ?? "API_UNAVAILABLE",
      value?.error?.message ??
        "Backend belum dapat dihubungi. Periksa service lokal lalu coba lagi.",
    );
  return value as T;
}
export function command<T>(path: string, body: unknown = {}) {
  return request<T>(path, body, crypto.randomUUID());
}

export function pendingMessage(threadId: string): string | null {
  return pendingText(`message:${threadId}`);
}
export function pendingText(slot: string): string | null {
  const saved = localStorage.getItem(`ngertiin:pending:${slot}`);
  if (!saved) return null;
  try {
    return (JSON.parse(saved) as { body: { text: string } }).body.text;
  } catch {
    return null;
  }
}

// Persist the exact operation before sending. A lost acknowledgement reuses its body and key.
export async function durableCommand<T>(slot: string, path: string, body: unknown): Promise<T> {
  const storageKey = `ngertiin:pending:${slot}`;
  const saved = localStorage.getItem(storageKey);
  const operation = saved
    ? (JSON.parse(saved) as { path: string; body: unknown; key: string })
    : { path, body, key: crypto.randomUUID() };
  localStorage.setItem(storageKey, JSON.stringify(operation));
  try {
    const result = await request<T>(operation.path, operation.body, operation.key);
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
) {
  const response = await fetch(`/v1/events/stream?after=${after}`, { signal });
  if (!response.ok || !response.body) throw new Error("Event connection unavailable");
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  try {
    while (!signal.aborted) {
      const chunk = await reader.read();
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
    await reader.cancel().catch(() => {});
    reader.releaseLock();
  }
}
