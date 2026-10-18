import { useState } from "react";
import type { BackgroundTask } from "@/features/tasks/types";

export function useTaskEditor(task: BackgroundTask) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const editKey = `task-edit:${task.id}:${task.revision}`;

  function beginEdit(): void {
    try {
      setDraft(sessionStorage.getItem(editKey) ?? task.draft);
    } catch {
      setDraft(task.draft);
    }
    setEditing(true);
  }

  function updateDraft(value: string): void {
    setDraft(value);
    try {
      sessionStorage.setItem(editKey, value);
    } catch {
      /* Storage is optional. */
    }
  }

  function finishEdit(): void {
    setEditing(false);
    try {
      sessionStorage.removeItem(editKey);
    } catch {
      /* Storage is optional. */
    }
  }

  return {
    editing,
    draft,
    beginEdit,
    updateDraft,
    finishEdit,
    cancelEdit: () => setEditing(false),
  };
}
