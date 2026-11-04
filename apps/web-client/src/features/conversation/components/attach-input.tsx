import { Add01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useRef } from "react";
import { Button } from "@/components/ui/button";
import type { Connection } from "@/types/workspace";

export function attachmentIssue(
  mediaType: string,
  connection?: Connection,
  modelId?: string | null,
) {
  const kind = mediaType.startsWith("image/")
    ? "image"
    : mediaType.startsWith("video/")
      ? "video"
      : null;
  if (!kind) return null;
  if (kind === "video") return "Input video belum didukung oleh harness yang tersedia.";
  if (
    connection?.state !== "active" ||
    connection.capabilities.image_input !== "supported" ||
    !connection.models.find((m) => m.id === modelId)?.input_modalities?.includes("image")
  )
    return "Input gambar belum didukung oleh koneksi dan model yang dipilih.";
  if (!["image/png", "image/jpeg", "image/webp"].includes(mediaType))
    return "Gunakan gambar PNG, JPEG, atau WebP.";
  return null;
}
export function AttachInput({
  disabled,
  count,
  addFiles,
}: {
  disabled: boolean;
  count: number;
  addFiles: (files: File[]) => void;
}) {
  const input = useRef<HTMLInputElement>(null);
  return (
    <>
      <input
        ref={input}
        type="file"
        aria-label="Lampirkan file ke pesan"
        className="sr-only"
        multiple
        disabled={disabled || count >= 20}
        onChange={(event) => {
          addFiles([...(event.target.files ?? [])]);
          event.target.value = "";
        }}
      />
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className="composer-aux composer-attach size-7 shrink-0 rounded-full"
        aria-label="Tambah lampiran"
        title="Working copies of attachments are shared on your agents’ machine."
        disabled={disabled || count >= 20}
        onMouseDown={(event) => event.preventDefault()}
        onClick={() => input.current?.click()}
      >
        <HugeiconsIcon icon={Add01Icon} size={18} strokeWidth={1.5} />
      </Button>
    </>
  );
}
