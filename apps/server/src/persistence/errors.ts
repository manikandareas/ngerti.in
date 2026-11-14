import { DomainError } from "../contracts/errors";

/** Translate SQL constraints without exposing relation names, identifiers or query text. */
export function databaseDomainError(error: unknown) {
  if (!error || typeof error !== "object" || !("code" in error)) return;
  if (["23505", "40001", "40P01"].includes(String(error.code)))
    return new DomainError("CONFLICT", 409);
  if (["23503", "23514", "42501"].includes(String(error.code)))
    return new DomainError("SCOPE_DENIED", 403);
}
