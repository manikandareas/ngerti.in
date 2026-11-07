import { File02Icon, Folder01Icon, Image01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useTheme } from "next-themes";
import { useState } from "react";
import { cn } from "@/lib/utils";
import { resolveFileIcon } from "../lib/file-icon-manifest";
import { useFileIcons } from "../lib/use-file-icons";

export function FileTypeIcon({
  name,
  mediaType,
  className,
  folder = false,
  expanded = false,
}: {
  name: string;
  mediaType?: string;
  className?: string;
  folder?: boolean;
  expanded?: boolean;
}) {
  const manifest = useFileIcons();
  const { resolvedTheme } = useTheme();
  const [failed, setFailed] = useState<string>();
  const url = manifest
    ? resolveFileIcon(manifest, name, {
        folder,
        expanded,
        mediaType,
        light: resolvedTheme !== "dark",
      })
    : undefined;
  const type =
    mediaType === "application/pdf" ? "PDF" : /\.([a-z0-9]{1,12})$/i.exec(name)?.[1].toUpperCase();
  return (
    <span
      aria-hidden="true"
      data-file-type={folder ? undefined : type}
      className={cn("inline-flex size-[18px] shrink-0 items-center justify-center", className)}
    >
      {url && failed !== url ? (
        <img
          src={url}
          alt=""
          width={18}
          height={18}
          draggable={false}
          loading="lazy"
          className="size-full object-contain"
          onError={() => setFailed(url)}
        />
      ) : (
        <HugeiconsIcon
          icon={folder ? Folder01Icon : mediaType?.startsWith("image/") ? Image01Icon : File02Icon}
          size={17}
          className="text-muted-foreground"
        />
      )}
    </span>
  );
}
