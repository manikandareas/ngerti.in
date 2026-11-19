import { createHash } from "node:crypto";
import type { z } from "zod";
import type { routineState, schedule } from "./contracts";

type Schedule = z.infer<typeof schedule>;
type RoutineState = z.infer<typeof routineState>;
export function routineIsTerminal(state: RoutineState) {
  return state === "stopped" || state === "completed";
}

export function routineCanRun(state: RoutineState, manual: boolean) {
  return state === "active" || (manual && state === "paused");
}

export function routineHasFuture(routine: {
  state: RoutineState;
  schedule: Schedule;
  next_run_at: string | null;
}) {
  return (
    routine.state === "active" && (routine.next_run_at !== null || routine.schedule.type === "loop")
  );
}

type LoopSchedule = Extract<Schedule, { type: "loop" }>;
type LoopPacing = { delay_ms: number; digest: string };

export function nextLoopWake(
  schedule: LoopSchedule,
  settledAt: string,
  pacing?: LoopPacing | null,
) {
  return new Date(Date.parse(settledAt) + (pacing?.delay_ms ?? schedule.every_ms)).toISOString();
}

export function updateLoopPacing(
  schedule: LoopSchedule,
  previous: LoopPacing | null,
  result: { reading: number } | { answer: string } | null,
): LoopPacing | null {
  if (!schedule.self_paced) return null;
  if (!result) return previous;
  const digest = createHash("sha256").update(JSON.stringify(result)).digest("hex");
  const ceiling = schedule.self_paced.max_every_ms ?? Math.max(schedule.every_ms, 900_000);
  return {
    digest,
    delay_ms:
      previous?.digest === digest ? Math.min(ceiling, previous.delay_ms * 2) : schedule.every_ms,
  };
}

const formatters = new Map<string, Intl.DateTimeFormat>();
function localParts(at: number, zone: string) {
  let formatter = formatters.get(zone);
  if (!formatter) {
    formatter = new Intl.DateTimeFormat("en-GB", {
      timeZone: zone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hourCycle: "h23",
    });
    formatters.set(zone, formatter);
  }
  const parts = Object.fromEntries(formatter.formatToParts(at).map((p) => [p.type, p.value]));
  return {
    year: Number(parts.year),
    month: Number(parts.month),
    day: Number(parts.day),
    hour: Number(parts.hour),
    minute: Number(parts.minute),
    second: Number(parts.second),
  };
}
function dayAt(at: number, zone: string) {
  const p = localParts(at, zone);
  return Date.UTC(p.year, p.month - 1, p.day);
}
/** A missing DST wall time is skipped; an ambiguous wall time fires only at its first instant. */
function calendarInstant(day: number, time: string, zone: string) {
  const [hour, minute] = time.split(":").map(Number);
  const wall = day + hour * 3_600_000 + minute * 60_000;
  const candidates = new Set<number>();
  for (const delta of [-36, -12, 0, 12, 36]) {
    const sample = wall + delta * 3_600_000;
    const p = localParts(sample, zone);
    const offset = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second) - sample;
    const instant = wall - offset;
    const actual = localParts(instant, zone);
    if (dayAt(instant, zone) === day && actual.hour === hour && actual.minute === minute)
      candidates.add(instant);
  }
  return candidates.size ? Math.min(...candidates) : null;
}
export function firstDue(value: Schedule, zone: string, now = new Date()): string {
  if (value.type === "once") return value.at;
  if (value.type === "loop") return value.anchor_at ?? now.toISOString();
  if (value.type !== "calendar") return value.anchor_at;
  const day = dayAt(now.getTime(), zone);
  for (let offset = 0; offset <= 14; offset++) {
    const candidateDay = day + offset * 86_400_000;
    if (!value.weekdays.includes(new Date(candidateDay).getUTCDay())) continue;
    const at = calendarInstant(candidateDay, value.local_time, zone);
    if (at !== null && at >= now.getTime()) return new Date(at).toISOString();
  }
  throw new Error("Calendar schedule has no reachable occurrence.");
}
/** Coalesce missed periodic work into one latest occurrence, never a catch-up burst. */
export function dueWindow(value: Schedule, zone: string, due: string, now: Date) {
  if (value.type === "once" || value.type === "loop") return { scheduled_for: due, next: null };
  if (value.type !== "calendar") {
    const latest =
      Date.parse(due) +
      Math.floor((now.getTime() - Date.parse(due)) / value.every_ms) * value.every_ms;
    return {
      scheduled_for: new Date(latest).toISOString(),
      next: new Date(latest + value.every_ms).toISOString(),
    };
  }
  let latest = Date.parse(due);
  const day = dayAt(now.getTime(), zone);
  for (let offset = 0; offset <= 14; offset++) {
    const candidateDay = day - offset * 86_400_000;
    if (!value.weekdays.includes(new Date(candidateDay).getUTCDay())) continue;
    const at = calendarInstant(candidateDay, value.local_time, zone);
    if (at !== null && at <= now.getTime()) {
      latest = Math.max(latest, at);
      break;
    }
  }
  return {
    scheduled_for: new Date(latest).toISOString(),
    next: firstDue(value, zone, new Date(latest + 1)),
  };
}
