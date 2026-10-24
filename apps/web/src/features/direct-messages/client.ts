import { api } from "@/lib/api";
export const base = "/api/agent-engine/v1";
export function command(type: string, payload: object) {
  return {
    schema_version: "nma.v1",
    command_id: crypto.randomUUID(),
    type,
    expected_revision: null,
    payload,
  };
}
export function submit<T>(body: object, token: string | null) {
  return api<T>(`${base}/commands`, token, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}
export type ThreadItem = {
  thread_id: string;
  kind: "dm" | "group";
  title: string;
  dm_agent_id: string | null;
};
export async function listThreads(token: string | null) {
  const items: ThreadItem[] = [];
  let after: string | null = null;
  do {
    const page: { items: ThreadItem[]; next_cursor: string | null } = await api(
      `${base}/threads${after ? `?after=${encodeURIComponent(after)}` : ""}`,
      token,
    );
    items.push(...page.items);
    after = page.next_cursor;
  } while (after);
  return items;
}
