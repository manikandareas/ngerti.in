import type { HarnessId } from "@/lib/harnesses";

export function HarnessIcon({
  id,
  size = 16,
  className = "",
}: {
  id: HarnessId;
  size?: number;
  className?: string;
}) {
  if (id === "opencode")
    return (
      <span
        aria-hidden="true"
        className={`inline-flex shrink-0 items-center justify-center ${className}`}
        style={{ width: size, height: size }}
      >
        <img
          src="/images/harnesses/opencode-light.svg"
          alt=""
          width={size * 0.8}
          height={size}
          className="h-full w-auto dark:hidden"
        />
        <img
          src="/images/harnesses/opencode-dark.svg"
          alt=""
          width={size * 0.8}
          height={size}
          className="hidden h-full w-auto dark:block"
        />
      </span>
    );
  return (
    <img
      src={`/images/harnesses/${id}.${id === "pi" ? "svg" : "png"}`}
      alt=""
      width={size}
      height={size}
      className={`shrink-0 object-contain ${id === "pi" ? "scale-[1.6] invert dark:invert-0" : ""} ${className}`}
    />
  );
}
