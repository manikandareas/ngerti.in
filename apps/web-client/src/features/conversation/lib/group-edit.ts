import { ApiError, durableCommand } from "@/lib/api-client";
import { scopedStorageKey } from "@/lib/client-scope";
import type { Thread } from "@/types/workspace";

export type GroupDraft = { name: string; member_agent_ids: string[] };
export type GroupEdit = { base: GroupDraft & { revision: number }; draft: GroupDraft };
const journalKey = (id: string) => `ngertiin:group-edit:${id}`;
const operationSlot = (id: string, step: string) => `edit-group:${id}:${step}`;

export function groupEdit(thread: Thread): GroupEdit {
  const draft = { name: thread.name ?? "", member_agent_ids: thread.member_agent_ids };
  return { base: { ...draft, revision: thread.revision }, draft };
}

export function pendingGroupEdit(id: string): GroupEdit | null {
  try {
    const saved = JSON.parse(
      localStorage.getItem(scopedStorageKey(journalKey(id))) ?? "null",
    ) as GroupEdit | null;
    return saved &&
      typeof saved.draft?.name === "string" &&
      Array.isArray(saved.draft.member_agent_ids) &&
      saved.draft.member_agent_ids.every((id) => typeof id === "string") &&
      typeof saved.base?.name === "string" &&
      Array.isArray(saved.base.member_agent_ids) &&
      Number.isInteger(saved.base.revision) &&
      saved.base.revision > 0
      ? saved
      : null;
  } catch {
    return null;
  }
}

export function discardGroupEdit(id: string) {
  localStorage.removeItem(scopedStorageKey(journalKey(id)));
  for (const step of ["members", "name"])
    localStorage.removeItem(scopedStorageKey(`ngertiin:pending:${operationSlot(id, step)}`));
}

export function rejectedGroupEdit(error: unknown) {
  return (
    error instanceof ApiError &&
    [
      "CONFLICT",
      "IDEMPOTENCY_CONFLICT",
      "INVALID_REQUEST",
      "SCOPE_DENIED",
      "NOT_FOUND",
      "UNAUTHORIZED",
    ].includes(error.code)
  );
}

// Keep both the desired form and each exact command until its receipt is confirmed.
// Name and membership use separate existing APIs; resume from the last confirmed revision.
export async function saveGroupEdit(id: string, edit: GroupEdit) {
  let current = pendingGroupEdit(id) ?? edit;
  const remember = () =>
    localStorage.setItem(scopedStorageKey(journalKey(id)), JSON.stringify(current));
  const confirmed = (thread: Thread) => {
    current = { ...current, base: groupEdit(thread).base };
    remember();
  };
  remember();
  try {
    if (current.base.member_agent_ids.join() !== current.draft.member_agent_ids.join()) {
      confirmed(
        await durableCommand<Thread>(operationSlot(id, "members"), `/v1/groups/${id}/membership`, {
          expected_revision: current.base.revision,
          member_agent_ids: current.draft.member_agent_ids,
        }),
      );
    }
    if (current.base.name !== current.draft.name.trim()) {
      confirmed(
        await durableCommand<Thread>(operationSlot(id, "name"), `/v1/groups/${id}/configuration`, {
          expected_revision: current.base.revision,
          changes: { name: current.draft.name.trim() },
        }),
      );
    }
  } catch (error) {
    if (rejectedGroupEdit(error)) discardGroupEdit(id);
    throw error;
  }
}
