export const errorCodes = [
  "INVALID_REQUEST",
  "UNAUTHORIZED",
  "NOT_FOUND",
  "CONFLICT",
  "IDEMPOTENCY_CONFLICT",
  "SCOPE_DENIED",
  "STALE_DISPATCH",
  "RECONCILIATION_REQUIRED",
  "INTERNAL_ERROR",
  "CONTROL_AMBIGUOUS",
  "ROUTING_INVALID",
  "ROUTING_STALE",
  "RESPONSIBILITY_DEFERRED",
  "BROWSER_UNAVAILABLE",
  "BROWSER_UNKNOWN",
  "BROWSER_AUTH_REQUIRED",
  "BROWSER_ACTION_FAILED",
  "APP_UNAVAILABLE",
  "APP_AUTH_REQUIRED",
  "APP_UNKNOWN",
  "APP_TOOL_FAILED",
] as const;
export class DomainError extends Error {
  constructor(
    readonly code: (typeof errorCodes)[number],
    readonly status = 409,
  ) {
    super(code);
  }
}
