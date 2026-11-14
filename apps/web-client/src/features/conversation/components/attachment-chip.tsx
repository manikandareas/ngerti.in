import { ArrowUpRight01Icon, Cancel01Icon, RotateRight01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useState } from "react";
import { ScopedImage } from "@/components/scoped-image";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import type { ComposerAttachment } from "@/features/conversation/lib/attachment-references";
import { artifactUrl } from "@/lib/workspace-files";
import { useContentViewer } from "../lib/content-viewer";
import { FileTypeIcon } from "./file-type-icon";

function attachmentStatus(file: ComposerAttachment) {
  if (file.state === "failed") return "Periksa pengiriman.";
  if (file.state === "uploading") return "Mengirim…";
  if (file.documentState === "preparing") return "Menyiapkan file…";
  if (file.documentState === "partial") return "Sebagian isi file belum bisa dibaca.";
  if (["failed", "empty", "unsupported"].includes(file.documentState ?? ""))
    return "File belum bisa dibaca.";
  return null;
}

function AttachmentPreview({ file }: { file: ComposerAttachment }) {
  const image = /^image\/(png|jpeg|webp)$/.test(file.mediaType);
  const url = file.previewUrl ?? (file.artifact ? artifactUrl(file.artifact) : undefined);
  const size =
    file.size === null
      ? ""
      : file.size < 1024
        ? `${file.size} B`
        : file.size < 1024 * 1024
          ? `${Math.round(file.size / 1024)} KB`
          : `${(file.size / (1024 * 1024)).toFixed(1)} MB`;
  const type = /\.([a-z0-9]{1,12})$/i.exec(file.name)?.[1].toUpperCase();
  const status = attachmentStatus(file);
  return (
    <div className="attachment-preview min-w-0 space-y-2">
      {image && url && (
        <ScopedImage
          src={url}
          alt={`Pratinjau ${file.name}`}
          className="max-h-44 max-w-full rounded-md object-contain"
        />
      )}
      <div className="break-words font-medium">{file.name}</div>
      {(type || size) && (
        <div className="opacity-80">{[type, size].filter(Boolean).join(" · ")}</div>
      )}
      {status && <p className="opacity-80">{status}</p>}
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
  const viewer = useContentViewer();
  const working = file.state === "uploading" || file.documentState === "preparing";
  return (
    <span
      className="attachment-chip"
      data-attachment-chip={file.id}
      data-upload-state={file.state}
      aria-busy={working}
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
                onClick={(event) => {
                  if (!viewer || (!file.artifact && !file.file)) return;
                  event.preventDefault();
                  const url = file.artifact
                    ? artifactUrl(file.artifact)
                    : file.file
                      ? URL.createObjectURL(file.file)
                      : null;
                  if (!url) return;
                  viewer.open(
                    {
                      id: file.id,
                      name: file.name,
                      file: { name: file.name, url, mediaType: file.mediaType },
                      release: file.artifact ? undefined : () => URL.revokeObjectURL(url),
                      info:
                        file.artifact && viewer.showInfo
                          ? () => viewer.showInfo?.(file.id)
                          : undefined,
                      resolve: async () => file,
                    },
                    event.currentTarget,
                  );
                }}
              >
                <FileTypeIcon name={file.name} mediaType={file.mediaType} />
                <span dir="auto" className="truncate">
                  {file.name}
                </span>
                <HugeiconsIcon icon={ArrowUpRight01Icon} size={12} aria-hidden="true" />
              </button>
            </TooltipTrigger>
          </PopoverTrigger>
          <TooltipContent side="top" sideOffset={8} className="max-w-64">
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
      {file.state === "failed" && !file.file && retry && (
        <button
          type="button"
          className="attachment-chip-action"
          aria-label={`Coba lagi ${file.name}`}
          disabled={disabled}
          onMouseDown={(event) => event.preventDefault()}
          onClick={retry}
        >
          <HugeiconsIcon icon={RotateRight01Icon} size={12} aria-hidden="true" />
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
          <HugeiconsIcon icon={Cancel01Icon} size={11} aria-hidden="true" />
        </button>
      )}
    </span>
  );
}
