import { ApiError, request } from "./api-client";
import { type ClientScope, clientScope } from "./client-scope";

export async function refreshLocalModels({
  signal,
  scope = clientScope(),
}: {
  signal?: AbortSignal;
  scope?: ClientScope | null;
} = {}) {
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
