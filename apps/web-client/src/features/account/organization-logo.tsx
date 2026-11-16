import { useState } from "react";
import { cn } from "@/lib/utils";

export function OrganizationLogo({
  name,
  src,
  className,
}: {
  name: string;
  src?: string;
  className?: string;
}) {
  const [failedSource, setFailedSource] = useState<string | null>(null);
  const imageSource =
    src ||
    `https://api.dicebear.com/10.x/glass/svg?tags=animation&seed=${encodeURIComponent(name.trim() || "ngertiin")}`;
  return (
    <span className={cn("organization-logo", className)} aria-hidden="true">
      {failedSource !== imageSource ? (
        <img
          className="organization-logo-image"
          src={imageSource}
          alt=""
          referrerPolicy="no-referrer"
          onError={() => setFailedSource(imageSource)}
        />
      ) : (
        name.trim().charAt(0).toUpperCase() || "N"
      )}
    </span>
  );
}
