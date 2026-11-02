import { AlertCircle, FileText, Image as ImageIcon, RotateCw, X } from "lucide-react";
import { useState } from "react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import type { ComposerAttachment } from "@/features/conversation/lib/attachment-references";
import { artifactUrl } from "@/lib/workspace-files";

function AttachmentPreview({ file }: { file: ComposerAttachment }) {
  const image = /^image\/(png|jpeg|webp)$/.test(file.mediaType);
  const url = file.previewUrl ?? (file.artifact ? artifactUrl(file.artifact) : undefined);
  const size =
    file.size === null
      ? ""
      : file.size < 1024 * 1024
        ? `${Math.max(1, Math.round(file.size / 1024))} KB`
        : `${(file.size / (1024 * 1024)).toFixed(1)} MB`;
  return (
    <div className="attachment-preview min-w-0 space-y-2">
      {image && url && (
        <img
          src={url}
          alt={`Pratinjau ${file.name}`}
          className="max-h-44 w-full rounded-lg object-contain"
        />
      )}
      <div className="break-words text-[13px] font-medium leading-5">{file.name}</div>
      <div className="text-[11px] text-muted-foreground">
        {file.mediaType} {size ? `· ${size}` : ""}
      </div>
      {file.state === "uploading" && (
        <p className="text-[12px] text-muted-foreground">Mengunggah…</p>
      )}
      {file.error && <p className="text-[12px] text-destructive">{file.error}</p>}
    </div>
  );
}

export function AttachmentChip({
  file,
  disabled,
  remove,
  retry,
}: {
  file: ComposerAttachment;
  disabled?: boolean;
  remove?: () => void;
  retry?: () => void;
}) {
  const [open, setOpen] = useState(false);
  const Icon =
    file.state === "failed"
      ? AlertCircle
      : file.mediaType.startsWith("image/")
        ? ImageIcon
        : FileText;
  return (
    <span
      className="attachment-chip"
      data-attachment-chip={file.id}
      data-upload-state={file.state}
      aria-busy={file.state === "uploading"}
      contentEditable={false}
    >
      <Popover open={open} onOpenChange={setOpen}>
        <Tooltip open={open ? false : undefined} delayDuration={250}>
          <PopoverTrigger asChild>
            <TooltipTrigger asChild>
              <button
                type="button"
                className="attachment-chip-preview"
                aria-label={`Pratinjau ${file.name}`}
                onMouseDown={(event) => event.preventDefault()}
              >
                <Icon size={12} strokeWidth={1.7} aria-hidden="true" />
                <span dir="auto" className="truncate">
                  {file.name}
                </span>
                <span className="sr-only">
                  {file.state === "uploading"
                    ? "Mengunggah"
                    : file.state === "failed"
                      ? "Upload gagal"
                      : "Terunggah"}
                </span>
              </button>
            </TooltipTrigger>
          </PopoverTrigger>
          <TooltipContent
            side="top"
            sideOffset={8}
            className="block max-w-64 rounded-xl bg-popover p-3 text-popover-foreground shadow-lg ring-1 ring-border/50"
          >
            <AttachmentPreview file={file} />
          </TooltipContent>
        </Tooltip>
        <PopoverContent
          aria-label={`Pratinjau ${file.name}`}
          side="top"
          sideOffset={8}
          className="w-64 max-w-[calc(100vw-32px)]"
          onOpenAutoFocus={(event) => event.preventDefault()}
          onCloseAutoFocus={(event) => event.preventDefault()}
        >
          <AttachmentPreview file={file} />
        </PopoverContent>
      </Popover>
      {file.state === "failed" && retry && (
        <button
          type="button"
          className="attachment-chip-action"
          aria-label={`Coba lagi ${file.name}`}
          disabled={disabled}
          onMouseDown={(event) => event.preventDefault()}
          onClick={retry}
        >
          <RotateCw size={12} aria-hidden="true" />
        </button>
      )}
      {remove && file.state !== "uploading" && (
        <button
          type="button"
          className="attachment-chip-action attachment-chip-remove"
          aria-label={`Hapus lampiran ${file.name}`}
          disabled={disabled}
          onMouseDown={(event) => event.preventDefault()}
          onClick={remove}
        >
          <X size={11} aria-hidden="true" />
        </button>
      )}
    </span>
  );
}
