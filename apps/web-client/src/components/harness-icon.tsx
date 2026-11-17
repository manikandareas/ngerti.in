import { type HarnessId, harnesses } from "@/lib/harnesses";

export function HarnessIcon({
  id,
  size = 16,
  className = "",
}: {
  id: HarnessId;
  size?: number;
  className?: string;
}) {
  if (id === "codex" || id === "muse" || id === "claude")
    return (
      <img
        src={`/images/harnesses/${id}.png`}
        alt=""
        width={size}
        height={size}
        className={`shrink-0 object-contain ${className}`}
      />
    );
  return (
    <span
      aria-hidden="true"
      className={`inline-flex shrink-0 items-center justify-center font-mono font-semibold ${className}`}
      style={{ width: size, height: size, fontSize: size * 0.55 }}
    >
      {harnesses[id].mark}
    </span>
  );
}
