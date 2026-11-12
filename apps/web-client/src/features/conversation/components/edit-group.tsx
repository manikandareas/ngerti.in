import { type JSX, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { ApiError, request } from "@/lib/api-client";
import type { Agent, Snapshot, Thread } from "@/types/workspace";
import {
  discardGroupEdit,
  groupEdit,
  pendingGroupEdit,
  rejectedGroupEdit,
  saveGroupEdit,
} from "../lib/group-edit";
import { GroupDialog } from "./group-dialog";

type EditGroupProps = {
  thread: Thread;
  agents: Agent[];
  onOpenChange: (open: boolean) => void;
  refresh: () => Promise<unknown>;
  returnFocus: () => void;
};

export function EditGroup({
  thread,
  agents,
  onOpenChange,
  refresh,
  returnFocus,
}: EditGroupProps): JSX.Element {
  const [edit, setEdit] = useState(() => pendingGroupEdit(thread.id) ?? groupEdit(thread));
  const [pending, setPending] = useState(() => !!pendingGroupEdit(thread.id));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [reloadRequired, setReloadRequired] = useState(false);
  const lock = useRef(false);
  async function submit() {
    if (lock.current || reloadRequired) return;
    lock.current = true;
    setBusy(true);
    setError("");
    setPending(true);
    try {
      await saveGroupEdit(thread.id, edit);
      await refresh();
      discardGroupEdit(thread.id);
      onOpenChange(false);
    } catch (error) {
      const retained = pendingGroupEdit(thread.id);
      if (retained) setEdit(retained);
      setPending(!!retained);
      const rejected = rejectedGroupEdit(error);
      setReloadRequired(rejected);
      if (error instanceof ApiError && error.code === "CONFLICT") {
        setError(
          "This group changed while you were editing. Reload the group before saving again.",
        );
      } else if (rejected) {
        setError(
          "Could not finish saving. Reload the group to review its current name and members.",
        );
      } else {
        setError("Could not confirm the save. Check save to continue the same changes.");
      }
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }
  async function reload() {
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    try {
      const snapshot = await request<Snapshot>(`/v1/threads/${thread.id}/snapshot`);
      await refresh();
      setEdit(groupEdit(snapshot.thread));
      setError("");
      setReloadRequired(false);
    } catch {
      setError("Could not reload the group. Try again.");
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }
  let submitLabel = "Save changes";
  if (pending) submitLabel = "Check save";
  if (busy) submitLabel = "Saving…";
  return (
    <GroupDialog
      title="Edit group"
      description="Edit the group name and choose its agents."
      returnFocus={returnFocus}
      agents={agents}
      open
      onOpenChange={(open) => {
        if (!lock.current) onOpenChange(open);
      }}
      draft={edit.draft}
      onDraftChange={(draft) => setEdit((current) => ({ ...current, draft }))}
      locked={busy || pending || reloadRequired}
      busy={busy}
      blocked={reloadRequired}
      submitLabel={submitLabel}
      onSubmit={submit}
      error={error}
      status={pending && !busy ? "Your changes are retained until saving is confirmed." : undefined}
      recovery={
        reloadRequired ? (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            disabled={busy}
            onClick={() => void reload()}
          >
            Reload group
          </Button>
        ) : undefined
      }
    />
  );
}
