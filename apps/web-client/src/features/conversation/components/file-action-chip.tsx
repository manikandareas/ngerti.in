import { ArrowUpRight01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { Button } from "@/components/ui/button";
import { FileTypeIcon } from "./file-type-icon";
import "./conversation-interactions.css";

export function FileActionChip({
  name,
  mediaType,
  open,
}: {
  name: string;
  mediaType?: string;
  open: () => void;
}) {
  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      className="conversation-file-action"
      onClick={open}
      title={name}
    >
      <FileTypeIcon name={name} mediaType={mediaType} />
      <span className="truncate">{name}</span>
      <HugeiconsIcon icon={ArrowUpRight01Icon} size={12} aria-hidden="true" />
    </Button>
  );
}
