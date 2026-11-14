import { toast } from "sonner";
/** One immutable request context per mounted workspace; organization choice is tab-local. */
export interface ClientIdentity {
  server: string;
  user: string;
  organization: string;
  session: string;
  generation: string;
}
export interface ClientScope {
  identity: ClientIdentity;
  epoch: number;
  key: string;
  abort: AbortController;
  eventContext: string | null;
}
let active: ClientScope | null = null;
let epoch = 0;
const listeners = new Set<() => void>();

export function clientScope() {
  return active;
}
export function scopeKey(identity: Pick<ClientIdentity, "server" | "user" | "organization">) {
  return `ngertiin:scope:${encodeURIComponent(JSON.stringify([identity.server, identity.user, identity.organization]))}:`;
}
export function setClientScope(identity: ClientIdentity | null) {
  if (JSON.stringify(active?.identity ?? null) === JSON.stringify(identity)) return active;
  active?.abort.abort(new DOMException("Workspace changed", "AbortError"));
  active = identity
    ? {
        identity,
        epoch: ++epoch,
        key: scopeKey(identity),
        abort: new AbortController(),
        eventContext: null,
      }
    : null;
  for (const listener of listeners) listener();
  return active;
}
export function onScopeChange(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
export function scopedStorageKey(key: string, scope = active) {
  return scope ? `${scope.key}${key.replace(/^ngertiin:/, "")}` : key;
}
export function assertScope(scope: ClientScope | null) {
  scope?.abort.signal.throwIfAborted();
  if (scope !== active) throw new DOMException("Workspace changed", "AbortError");
}
export async function scopedFetch(path: string, init: RequestInit = {}, scope = active) {
  assertScope(scope);
  const origin = globalThis.location?.origin ?? "http://localhost";
  const url = new URL(path, origin);
  const headers = new Headers(init.headers);
  if (url.origin === origin && url.pathname.startsWith("/v1/") && scope) {
    headers.set("X-Ngertiin-Organization", scope.identity.organization);
    if (scope.eventContext) headers.set("X-Ngertiin-Event-Context", scope.eventContext);
  }
  const signals = [init.signal, scope?.abort.signal].filter(
    (value): value is AbortSignal => !!value,
  );
  const response = await fetch(path, {
    ...init,
    headers,
    credentials: "same-origin",
    signal: signals.length ? AbortSignal.any(signals) : undefined,
  });
  assertScope(scope);
  if (scope && url.origin === origin && url.pathname.startsWith("/v1/")) {
    const context = response.headers.get("X-Ngertiin-Event-Context");
    if (context) scope.eventContext = context;
    const viewerGrant = /^\/v1\/machine\/views\//.test(url.pathname);
    if (!viewerGrant && (response.status === 401 || response.status === 403))
      window.dispatchEvent(new CustomEvent("ngertiin:access-changed", { detail: response.status }));
  }
  return response;
}
export async function downloadFile(path: string, name: string) {
  try {
    const scope = active;
    const response = await scopedFetch(path, {}, scope);
    if (!response.ok) throw new Error("File unavailable. Reopen the file and try again.");
    const blob = await response.blob();
    assertScope(scope);
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = name;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  } catch (error) {
    if (!(error instanceof DOMException && error.name === "AbortError"))
      toast.error(error instanceof Error ? error.message : "Could not download this file.");
  }
}
export async function clearPrivateStorage() {
  if (typeof globalThis.indexedDB !== "undefined" && typeof indexedDB.databases === "function") {
    const databases = await indexedDB.databases();
    await Promise.all(
      databases
        .filter((database) => database.name?.startsWith("ngertiin:scope:"))
        .map(
          (database) =>
            new Promise<void>((resolve) => {
              const deletion = indexedDB.deleteDatabase(database.name as string);
              deletion.onsuccess = deletion.onerror = deletion.onblocked = () => resolve();
            }),
        ),
    );
  }
  for (const storage of [localStorage, sessionStorage]) {
    for (const key of Object.keys(storage)) {
      if (key.startsWith("ngertiin:scope:")) storage.removeItem(key);
    }
  }
}
