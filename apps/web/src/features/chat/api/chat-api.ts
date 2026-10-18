import { api } from "@/lib/api";

export function postChatCommand(
  path: string,
  token: string | null,
  body?: unknown,
): Promise<unknown> {
  return api(path, token, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}
