import { useEffect, useState } from "react";
import type { OutputSpec } from "@/features/files/types";

interface TaskDraft {
  instruction: string;
  review: boolean;
  requestKey: string;
  outputs: OutputSpec[];
}

function empty(): TaskDraft {
  return { instruction: "", review: true, requestKey: crypto.randomUUID(), outputs: [] };
}

export function useTaskDraft(storageKey: string) {
  const [draft, setDraft] = useState<TaskDraft>(empty);
  useEffect(() => {
    try {
      const saved = JSON.parse(sessionStorage.getItem(storageKey) ?? "null");
      if (
        typeof saved?.instruction === "string" &&
        typeof saved.review === "boolean" &&
        typeof saved.requestKey === "string"
      )
        setDraft({ ...saved, outputs: Array.isArray(saved.outputs) ? saved.outputs : [] });
    } catch {
      /* A missing or invalid browser draft starts empty. */
    }
  }, [storageKey]);

  function update(instruction: string, review: boolean, outputs = draft.outputs) {
    const next = { instruction, review, outputs, requestKey: crypto.randomUUID() };
    setDraft(next);
    try {
      sessionStorage.setItem(storageKey, JSON.stringify(next));
    } catch {
      /* Storage is optional. */
    }
  }
  function clear() {
    setDraft(empty());
    try {
      sessionStorage.removeItem(storageKey);
    } catch {
      /* Storage is optional. */
    }
  }
  return { ...draft, update, clear };
}
