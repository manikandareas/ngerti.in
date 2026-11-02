import { Plus } from "lucide-react";
import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { ensureWorkspace, uploadFile } from "@/lib/workspace-files";
import type { Artifact } from "@/types/work";
import type { Connection, Snapshot } from "@/types/workspace";

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
  snapshot,
  connection,
  disabled,
  count,
  imageCount,
  attach,
  report,
  refresh,
}: {
  snapshot: Snapshot;
  connection?: Connection;
  disabled: boolean;
  count: number;
  imageCount: number;
  attach: (a: Artifact) => void;
  report: (error: string) => void;
  refresh: () => Promise<unknown>;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const agent = snapshot.agents[0];
  // Routed group messages have no attachment field in the published API. Files remain available in the scoped File tab.
  if (snapshot.thread.type === "group") return null;
  return (
    <>
      <input
        ref={input}
        type="file"
        aria-label="Lampirkan file ke pesan"
        className="sr-only"
        disabled={disabled || busy || count >= 20}
        onChange={async (e) => {
          const file = e.target.files?.[0];
          if (!file || busy || !agent) return;
          const issue = attachmentIssue(file.type, connection, agent.model_id);
          if (issue) {
            report(issue);
            e.target.value = "";
            return;
          }
          if (file.type.startsWith("image/") && imageCount >= 4) {
            report("Maksimal empat gambar dalam satu pesan.");
            e.target.value = "";
            return;
          }
          setBusy(true);
          try {
            const workspace = await ensureWorkspace(
              agent.id,
              snapshot.thread.id,
              snapshot.workspaces,
            );
            const artifact = await uploadFile(workspace.id, file);
            attach(artifact);
            await refresh();
          } catch (e) {
            report(e instanceof Error ? e.message : "File belum terunggah.");
          } finally {
            setBusy(false);
            if (input.current) input.current.value = "";
          }
        }}
      />
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className="composer-aux composer-attach size-7 shrink-0 rounded-full"
        aria-label={busy ? "Mengunggah file" : "Tambah lampiran"}
        disabled={disabled || busy || count >= 20}
        onClick={() => input.current?.click()}
      >
        <Plus size={18} strokeWidth={1.5} />
      </Button>
    </>
  );
}
