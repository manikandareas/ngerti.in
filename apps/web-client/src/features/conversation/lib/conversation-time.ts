/** Calendar grouping and visible clocks always use the same device time zone. */
export const conversationTimeZone = new Intl.DateTimeFormat().resolvedOptions().timeZone;

const timeFormat = new Intl.DateTimeFormat("id-ID", {
  timeZone: conversationTimeZone,
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});
const dateFormat = new Intl.DateTimeFormat("id-ID", {
  timeZone: conversationTimeZone,
  dateStyle: "full",
  timeStyle: "short",
});
const dayFormat = new Intl.DateTimeFormat("id-ID", {
  timeZone: conversationTimeZone,
  day: "numeric",
  month: "long",
  year: "numeric",
});
const dayKeyFormat = new Intl.DateTimeFormat("en-CA", {
  timeZone: conversationTimeZone,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

function dateAt(at: string | undefined) {
  if (!at) return null;
  const date = new Date(at);
  return Number.isFinite(date.getTime()) ? date : null;
}

export function conversationDay(at?: string, timeZone = conversationTimeZone): string | null {
  const date = dateAt(at);
  if (!date) return null;
  const format =
    timeZone === conversationTimeZone
      ? dayKeyFormat
      : new Intl.DateTimeFormat("en-CA", {
          timeZone,
          year: "numeric",
          month: "2-digit",
          day: "2-digit",
        });
  return format.format(date);
}

export function conversationTime(at?: string) {
  const date = dateAt(at);
  return date ? { clock: timeFormat.format(date), title: dateFormat.format(date) } : null;
}

export function conversationDateLabel(at: string) {
  const date = dateAt(at);
  return date ? dayFormat.format(date) : null;
}
