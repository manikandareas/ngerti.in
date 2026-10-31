import type { BrowserResult } from "./contracts";

const sensitive =
  /^(?:access_token|refresh_token|id_token|token|authorization|auth|code|state|password|secret|api_key|key|cookie|session|sid)$/i;
function safeUrl(value: string) {
  try {
    const absolute = /^https?:\/\//.test(value);
    const url = new URL(value, "https://relative.invalid");
    url.username = "";
    url.password = "";
    for (const key of [...url.searchParams.keys()])
      if (sensitive.test(key)) url.searchParams.set(key, "[redacted]");
    if (url.hash) url.hash = "";
    return absolute ? url.toString() : `${url.pathname}${url.search}`;
  } catch {
    return value;
  }
}
function redact(value: unknown, key = ""): unknown {
  if (typeof value === "string") {
    if (["url", "href"].includes(key)) return safeUrl(value);
    return value.replace(/https?:\/\/[^\s<>"']+/g, safeUrl);
  }
  if (Array.isArray(value)) return value.map((item) => redact(item));
  if (value && typeof value === "object")
    return Object.fromEntries(
      Object.entries(value).map(([name, item]) => [
        name,
        sensitive.test(name) ? "[redacted]" : redact(item, name),
      ]),
    );
  return value;
}
/** No raw MCP errors, profile files or callback credentials cross the application gateway. */
export function safeBrowserOutput(result: BrowserResult): BrowserResult {
  if (result.isError)
    return {
      content: [
        { type: "text", text: "Error: Browser operation outcome requires reconciliation." },
      ],
      isError: true,
    };
  return {
    ...result,
    content: result.content.map((item) => {
      if (item.type !== "text") return item;
      if (item.text.startsWith("Error:"))
        return { type: "text", text: "Error: Browser operation outcome requires reconciliation." };
      try {
        return { type: "text", text: JSON.stringify(redact(JSON.parse(item.text))) };
      } catch {
        return { type: "text", text: String(redact(item.text)) };
      }
    }),
  };
}
