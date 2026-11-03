import "./agent-activity-bubble.css";

/** Shared text treatment for routing and agent activity in both conversation types. */
export function ActivityStatus({
  label,
  name,
  loading,
}: {
  label: string;
  name: string;
  loading: boolean;
}) {
  return (
    <div role="status" aria-live="polite" aria-atomic="true">
      <span className="sr-only">
        {name}: {label}
      </span>
      <span
        aria-hidden="true"
        data-activity-text
        data-text={label}
        className="agent-activity-label"
        data-shimmer={loading}
      >
        {label}
      </span>
    </div>
  );
}
