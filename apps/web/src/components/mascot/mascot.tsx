import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";
import { ClayAvatar } from "./clay-avatar";
import type { FaceId } from "./engine";

/** Shared animated mascot; reads the brand token for the engine's shaded material. */
export function Mascot({ className, face = "neutral" }: { className?: string; face?: FaceId }) {
  const [color, setColor] = useState("#b8d993");
  useEffect(() => {
    const root = document.documentElement;
    const sync = () => {
      const value = getComputedStyle(root).getPropertyValue("--primary").trim();
      if (/^#[\da-f]{6}$/i.test(value)) setColor(value);
    };
    sync();
    const observer = new MutationObserver(sync);
    observer.observe(root, { attributes: true, attributeFilter: ["data-theme", "class", "style"] });
    return () => observer.disconnect();
  }, []);
  return (
    <span aria-hidden="true" className={cn("inline-flex shrink-0", className)}>
      <ClayAvatar className="size-full" shape="cloud" face={face} color={color} track="cursor" />
    </span>
  );
}
