import { useAuth } from "@clerk/tanstack-react-start";
import { useEffect, useState } from "react";
import type { ScheduleSpec } from "@/features/schedules/types";

function initial(): ScheduleSpec {
  const date = new Date();
  date.setMinutes(date.getMinutes() + 10);
  const localDate = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
  return {
    title: "",
    instruction: "",
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || "Asia/Makassar",
    frequency: "once",
    interval_hours: null,
    start_date: localDate,
    local_time: `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`,
    weekdays: [0],
    runtime_kind: "text",
    review_required: false,
    per_run_cap: 60000,
    inputs: [],
    outputs: [],
  };
}

export function useScheduleDraft(scope: string, original?: ScheduleSpec) {
  const { userId } = useAuth();
  const key = `schedule-draft:${userId}:${scope}`;
  const [value, setValue] = useState<ScheduleSpec>(original ?? initial);
  useEffect(() => {
    try {
      const saved = JSON.parse(sessionStorage.getItem(key) ?? "null");
      if (saved && typeof saved.instruction === "string" && Array.isArray(saved.weekdays))
        setValue(saved);
    } catch {
      /* Draft persistence is optional. */
    }
  }, [key]);
  function update(patch: Partial<ScheduleSpec>) {
    setValue((current) => {
      const next = { ...current, ...patch };
      try {
        sessionStorage.setItem(key, JSON.stringify(next));
      } catch {
        /* Keep the in-memory draft. */
      }
      return next;
    });
  }
  return { value, update };
}
