import type { Routine } from "@/types/work";

const weekdays = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const intervalUnits = [
  [86400000, "day"],
  [3600000, "hour"],
  [60000, "minute"],
  [1000, "second"],
] as const;

export function routineSchedule(routine: Routine): string {
  const schedule = routine.schedule;
  if (schedule.type === "once")
    return new Intl.DateTimeFormat("en-US", {
      dateStyle: "medium",
      timeStyle: "short",
      timeZone: routine.timezone,
    }).format(new Date(schedule.at));
  if (schedule.type === "calendar") {
    const days = schedule.weekdays.map((day) => weekdays[day]);
    return `${days.length === 7 ? "Every day" : days.join(", ")} · ${schedule.local_time} · ${routine.timezone}`;
  }
  const [divisor, unit] =
    intervalUnits.find(
      ([value]) => schedule.every_ms >= value && schedule.every_ms % value === 0,
    ) ?? intervalUnits[3];
  const count = schedule.every_ms / divisor;
  return `Every ${count} ${unit}${count === 1 ? "" : "s"}`;
}
