import { File, Image as ImageIcon, X } from "lucide-react";
import { useState } from "react";
import { artifactUrl } from "@/lib/workspace-files";
import type { Artifact } from "@/types/work";
import { type FileView, FileViewer } from "./file-viewer";

/** Source ComposerAttachments chips, backed by Ngertiin's scoped uploaded artifacts. */
export function DraftAttachments({
  attachments,
  disabled,
  remove,
}: {
  attachments: Artifact[];
  disabled: boolean;
  remove: (artifact: Artifact) => void;
}) {
  const [preview, setPreview] = useState<FileView | null>(null);
  if (!attachments.length) return null;
  return (
    <>
      <fieldset aria-label="Lampiran pesan" className="mb-2 flex flex-wrap gap-2">
        {attachments.map((artifact) => {
          const image = /^(image\/(png|jpeg|webp))$/.test(artifact.media_type);
          const Icon = image ? ImageIcon : File;
          const size =
            artifact.size_bytes === null
              ? ""
              : artifact.size_bytes < 1024
                ? `${artifact.size_bytes} B`
                : artifact.size_bytes < 1024 * 1024
                  ? `${(artifact.size_bytes / 1024).toFixed(1)} KB`
                  : `${(artifact.size_bytes / (1024 * 1024)).toFixed(1)} MB`;
          return (
            <div
              key={artifact.id}
              title={artifact.name}
              className="group relative w-[172px] rounded-xl border border-border/40 bg-secondary px-2.5 py-2 transition-colors hover:border-border"
            >
              {image ? (
                <button
                  type="button"
                  aria-label={`Pratinjau ${artifact.name}`}
                  className="relative flex h-[76px] w-full items-center justify-center overflow-hidden rounded-lg bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60"
                  onClick={() =>
                    setPreview({
                      name: artifact.name,
                      mediaType: artifact.media_type,
                      url: artifactUrl(artifact),
                    })
                  }
                >
                  <img
                    src={artifactUrl(artifact)}
                    alt={artifact.name}
                    loading="eager"
                    className="max-h-[76px] max-w-full object-contain"
                  />
                </button>
              ) : (
                <div className="flex h-[76px] items-center gap-2">
                  <File size={16} className="shrink-0 text-muted-foreground" />
                  <div className="min-w-0">
                    <div className="truncate text-[12px]">{artifact.name}</div>
                    <div className="text-[11px] text-muted-foreground">{size}</div>
                  </div>
                </div>
              )}
              {image && (
                <div className="mt-1 truncate text-[11px] text-muted-foreground">{size}</div>
              )}
              <div className="mt-1 flex items-center gap-1 text-muted-foreground">
                <Icon size={11} />
                <span className="rounded border border-border/60 px-1 py-px text-[10px] font-medium tracking-wide">
                  {image ? "IMAGE" : "FILE"}
                </span>
              </div>
              <button
                type="button"
                aria-label={`Hapus lampiran ${artifact.name}`}
                disabled={disabled}
                onClick={() => remove(artifact)}
                className="absolute -right-1.5 -top-1.5 flex size-5 items-center justify-center rounded-full border border-border/60 bg-panel text-muted-foreground opacity-0 transition-opacity hover:text-foreground focus-visible:opacity-100 group-hover:opacity-100 [@media(hover:none)]:opacity-100 disabled:cursor-not-allowed"
              >
                <X size={11} />
              </button>
            </div>
          );
        })}
      </fieldset>
      <FileViewer file={preview} close={() => setPreview(null)} />
    </>
  );
}
