const timeFormat = new Intl.DateTimeFormat("id-ID", {
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});
const dateFormat = new Intl.DateTimeFormat("id-ID", { dateStyle: "full", timeStyle: "short" });

export function MessageTime({ at, className = "" }: { at?: string; className?: string }) {
  if (!at) return null;
  const date = new Date(at);
  if (!Number.isFinite(date.getTime())) return null;
  return (
    <time className={`message-time ${className}`} dateTime={at} title={dateFormat.format(date)}>
      {timeFormat.format(date)}
    </time>
  );
}
