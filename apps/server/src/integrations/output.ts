import { Redactor } from "../harness/context";

/** Never forward SDK objects: connection state and MCP headers can contain bearer credentials. */
export function appOutput(value: unknown, secret = process.env.COMPOSIO_API_KEY ?? ""): unknown {
  const redactor = new Redactor();
  redactor.add(secret);
  const visit = (item: unknown, depth: number): unknown => {
    if (depth > 20) return "[TRUNCATED]";
    if (typeof item === "string")
      return redactor
        .text(item)
        .replace(/\bhttps?:\/\/[^\s<>"']+/g, (raw) => {
          try {
            const url = new URL(raw);
            if (url.username || url.password) return "[REDACTED URL]";
            for (const key of [...url.searchParams.keys()])
              if (/token|key|secret|auth|code|signature|credential/i.test(key))
                url.searchParams.set(key, "[REDACTED]");
            if (/token|secret|credential|(?:^|[&#])(?:code|key)=/i.test(url.hash))
              url.hash = "[REDACTED]";
            return url.toString();
          } catch {
            return "[INVALID URL]";
          }
        })
        .replace(/\b(?:ak_|ck_|ghp_|gho_)[A-Za-z0-9_-]{12,}/g, "[REDACTED]");
    if (Array.isArray(item)) return item.slice(0, 200).map((x) => visit(x, depth + 1));
    if (item && typeof item === "object")
      return Object.fromEntries(
        Object.entries(item)
          .slice(0, 200)
          .map(([key, x]) => [
            key,
            /token|secret|password|credential|authorization|cookie|api[_-]?key|headers|mcp|redirect|auth[_-]?config|environment/i.test(
              key,
            )
              ? "[REDACTED]"
              : visit(x, depth + 1),
          ]),
      );
    return item;
  };
  const safe = visit(value, 0);
  return JSON.stringify(safe).length <= 100_000
    ? safe
    : {
        truncated: true,
        message: "Result exceeded the application response limit. Use a narrower query.",
      };
}
