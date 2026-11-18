import { ApiError, request } from "./api-client";
import { assertScope, type ClientScope, clientScope } from "./client-scope";
import { invalidateProviderConnections } from "./workspace-queries";

type Discovery =
  | { kind: "pending"; result: Promise<boolean> }
  | { kind: "observed"; available: boolean };

const discoveries = new WeakMap<ClientScope, Discovery>();

export async function refreshLocalModels({
  signal,
  scope = clientScope(),
  reuse = false,
}: {
  signal?: AbortSignal;
  scope?: ClientScope | null;
  reuse?: boolean;
} = {}) {
  signal?.throwIfAborted();
  if (!scope) return discoverLocalModels({ signal, scope });
  assertScope(scope);
  const previous = discoveries.get(scope);
  if (previous?.kind === "observed" && reuse) return previous.available;
  const operation =
    previous?.kind === "pending"
      ? previous.result
      : discoverLocalModels({ scope })
          .then((available) => {
            if (available) invalidateProviderConnections(scope);
            discoveries.set(scope, { kind: "observed", available });
            return available;
          })
          .catch((error: unknown) => {
            discoveries.delete(scope);
            throw error;
          });
  discoveries.set(scope, { kind: "pending", result: operation });
  const available = await operation;
  signal?.throwIfAborted();
  return available;
}

async function discoverLocalModels({
  signal,
  scope,
}: {
  signal?: AbortSignal;
  scope: ClientScope | null;
}) {
  try {
    const result = await request<unknown>(
      "/v1/connections/local/refresh",
      {},
      undefined,
      signal,
      60_000,
      scope,
    );
    if (
      !result ||
      typeof result !== "object" ||
      !("available" in result) ||
      typeof result.available !== "boolean"
    )
      throw new ApiError("INVALID_RESPONSE", "Could not read the local catalog status.");
    return result.available;
  } catch (error) {
    if (error instanceof ApiError && error.code === "NOT_FOUND") return false;
    throw error;
  }
}
