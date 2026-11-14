import { ApiError, request } from "@/lib/api-client";
import { assertScope, clientScope } from "@/lib/client-scope";
import { attachmentParts, attachmentReference } from "./attachment-references";

export interface MessageSubmission {
  id: string;
  scopeKey?: string;
  target?: "dm" | "group";
  body: {
    submission_id: string;
    thread_id: string;
    agent_id: string | null;
    text: string;
    artifact_ids: string[];
  };
  files: { id: string; file: File }[];
}
const DATABASE = "ngertiin-message-submissions";
const STORE = "pending";
async function database(scopeKey = clientScope()?.key) {
  return new Promise<IDBDatabase>((resolve, reject) => {
    const opening = indexedDB.open(scopeKey ? `${scopeKey}${DATABASE}` : DATABASE, 1);
    opening.onupgradeneeded = () => opening.result.createObjectStore(STORE);
    opening.onsuccess = () => resolve(opening.result);
    opening.onerror = () =>
      reject(new Error("Lampiran belum dapat disimpan untuk pengiriman. Coba lagi."));
  });
}
async function transaction<T>(
  mode: IDBTransactionMode,
  action: (store: IDBObjectStore, set: (value: T) => void) => void,
  scopeKey = clientScope()?.key,
) {
  const db = await database(scopeKey);
  try {
    return await new Promise<T>((resolve, reject) => {
      const tx = db.transaction(STORE, mode);
      let value: T;
      tx.oncomplete = () => resolve(value);
      tx.onerror = tx.onabort = () =>
        reject(new Error("Lampiran belum dapat disimpan untuk pengiriman. Coba lagi."));
      action(tx.objectStore(STORE), (result) => {
        value = result;
      });
    });
  } finally {
    db.close();
  }
}
export function pendingSubmission(threadId: string) {
  return transaction<MessageSubmission | null>("readonly", (store, set) => {
    const read = store.get(threadId);
    read.onsuccess = () => set(read.result ?? null);
  });
}
export function saveSubmission(operation: MessageSubmission) {
  if (operation.scopeKey !== clientScope()?.key)
    throw new Error("This submission belongs to another workspace.");
  return transaction<MessageSubmission>("readwrite", (store, set) => {
    const read = store.get(operation.body.thread_id);
    read.onsuccess = () => {
      if (read.result) set(read.result);
      else {
        store.put(operation, operation.body.thread_id);
        set(operation);
      }
    };
  });
}
export function clearSubmission(operation: MessageSubmission) {
  return transaction<void>(
    "readwrite",
    (store, set) => {
      const read = store.get(operation.body.thread_id);
      read.onsuccess = () => {
        if (read.result?.id === operation.id) store.delete(operation.body.thread_id);
        set(undefined);
      };
    },
    operation.scopeKey,
  );
}
export function prepareSubmission(
  threadId: string,
  agentId: string,
  text: string,
  sources: { id: string; file: File }[],
  target: "dm" | "group" = "dm",
): MessageSubmission {
  const id = crypto.randomUUID();
  const files = sources.map((source) => ({
    localId: source.id,
    id: crypto.randomUUID(),
    file: source.file,
  }));
  const byLocalId = new Map(files.map((file) => [file.localId, file]));
  const ids = new Set<string>();
  const body = attachmentParts(text)
    .map((part) => {
      if ("text" in part) return part.text;
      const artifactId = byLocalId.get(part.id)?.id ?? part.id;
      ids.add(artifactId);
      return attachmentReference(artifactId, part.name);
    })
    .join("");
  return {
    id,
    scopeKey: clientScope()?.key,
    target,
    body: {
      submission_id: id,
      thread_id: threadId,
      agent_id: target === "group" ? null : agentId,
      text: body,
      artifact_ids: [...ids],
    },
    files: files.map(({ id, file }) => ({ id, file })),
  };
}
async function base64(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(",")[1] ?? "");
    reader.onerror = () => reject(new Error("File belum dapat dibaca."));
    reader.readAsDataURL(file);
  });
}
export class RejectedSubmission extends Error {
  readonly operation: MessageSubmission;
  constructor(operation: MessageSubmission, message: string) {
    super(message);
    this.operation = operation;
  }
}
export async function executeSubmission(
  operation: MessageSubmission,
  progress: (id: string, state: "uploading" | "ready") => void,
) {
  const scope = clientScope();
  if (operation.scopeKey !== scope?.key)
    throw new Error("This submission belongs to another workspace.");
  try {
    // Upload recovery needs a receipt check to avoid re-uploading committed files.
    // Without uploads, the command itself replays the durable idempotency receipt.
    if (operation.files.length) {
      const status = await request<{
        state: "committed" | "pending" | "missing";
        result?: unknown;
      }>(`/v1/message-submissions/${operation.id}`);
      if (status.state === "committed") return status.result;
    }
    for (const source of operation.files) {
      progress(source.id, "uploading");
      await request(
        "/v1/message-uploads",
        {
          submission_id: operation.id,
          thread_id: operation.body.thread_id,
          agent_id: operation.body.agent_id,
          name: source.file.name,
          media_type: source.file.type || "application/octet-stream",
          content_base64: await base64(source.file).then((value) => {
            assertScope(scope);
            return value;
          }),
        },
        source.id,
      );
      progress(source.id, "ready");
    }
    if (operation.target === "group") {
      const { thread_id, ...body } = operation.body;
      return await request(`/v1/groups/${thread_id}/messages`, body, operation.id);
    }
    return await request("/v1/runs", operation.body, operation.id);
  } catch (error) {
    if (
      error instanceof ApiError &&
      [
        "INVALID_REQUEST",
        "SCOPE_DENIED",
        "UNAUTHORIZED",
        "NOT_FOUND",
        "CONFLICT",
        "IDEMPOTENCY_CONFLICT",
        "CAPABILITY_UNKNOWN",
        "CAPABILITY_UNSUPPORTED",
      ].includes(error.code)
    )
      throw new RejectedSubmission(
        operation,
        "Pesan belum terkirim. Periksa lampiran lalu coba lagi.",
      );
    throw error;
  }
}
