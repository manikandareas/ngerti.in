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
  const selfPaced = schedule.type === "loop" && schedule.self_paced;
  const delay = selfPaced
    ? (routine.loop_pacing?.delay_ms ?? schedule.every_ms)
    : schedule.every_ms;
  const [divisor, unit] =
    intervalUnits.find(([value]) => delay >= value && delay % value === 0) ?? intervalUnits[3];
  const count = delay / divisor;
  const interval = `${count} ${unit}${count === 1 ? "" : "s"}`;
  if (selfPaced) return `Self-paced session loop · Current delay ${interval}`;
  return schedule.type === "loop"
    ? `Session loop · ${interval} after each check finishes`
    : `Every ${interval}`;
}
