import { type JSX, useRef, useState } from "react";
import { ApiError, durableCommand } from "@/lib/api-client";
import { scopedStorageKey } from "@/lib/client-scope";
import type { Agent, Thread } from "@/types/workspace";
import type { GroupDraft } from "../lib/group-edit";
import { GroupDialog } from "./group-dialog";

function savedDraft(): GroupDraft | null {
  try {
    const value = JSON.parse(
      localStorage.getItem(scopedStorageKey("ngertiin:pending:create-group")) ?? "null",
    );
    return value?.body ?? null;
  } catch {
    return null;
  }
}
type CreateGroupProps = {
  agents: Agent[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
  created: (thread: Thread) => Promise<void>;
};

export function CreateGroup({
  agents,
  open,
  onOpenChange,
  created,
}: CreateGroupProps): JSX.Element {
  const [initial] = useState(savedDraft);
  const [draft, setDraft] = useState<GroupDraft>(initial ?? { name: "", member_agent_ids: [] });
  const [pending, setPending] = useState(!!initial);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const lock = useRef(false);
  async function submit() {
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    setError("");
    setPending(true);
    try {
      const result = await durableCommand<{ thread: Thread }>(
        "create-group",
        "/v1/creation/groups",
        { ...draft, name: draft.name.trim() },
      );
      await created(result.thread);
      setDraft({ name: "", member_agent_ids: [] });
      setPending(false);
      onOpenChange(false);
    } catch (e) {
      setPending(!!savedDraft());
      if (e instanceof ApiError && ["SCOPE_DENIED", "NOT_FOUND"].includes(e.code)) {
        setError("Akses anggota berubah. Periksa pilihan anggota lalu coba lagi.");
      } else {
        setError(e instanceof Error ? e.message : "Grup belum dapat dibuat.");
      }
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }
  let submitLabel = "Buat grup";
  if (pending) submitLabel = "Periksa pembuatan grup";
  if (busy) submitLabel = "Memeriksa…";
  return (
    <GroupDialog
      title="Create group"
      description="Beri nama dan pilih agent. Satu anggota akan memandu percakapan."
      agents={agents}
      open={open}
      onOpenChange={onOpenChange}
      draft={draft}
      onDraftChange={setDraft}
      locked={pending || busy}
      busy={busy}
      submitLabel={submitLabel}
      onSubmit={submit}
      error={error}
      status={
        pending && !busy
          ? "Periksa operasi yang sama untuk memastikan hasilnya. Pilihan tersimpan sampai pembuatan terkonfirmasi."
          : undefined
      }
    />
  );
}
