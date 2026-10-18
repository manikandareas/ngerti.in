import { useAuth } from "@clerk/tanstack-react-start";
import { useQuery } from "@tanstack/react-query";
import { WorkspaceState } from "@/components/workspace-state";
import { api } from "@/lib/api";
import { useAttachments } from "../hooks/use-attachments";
import { useFiles } from "../hooks/use-files";
import type { ProductResult } from "../types";
import { AttachmentPicker } from "./attachment-picker";
import { DeleteResource } from "./delete-resource";
import { FilePreview } from "./file-preview";
import { ResultCard } from "./result-card";

export function FilesPanel() {
  const { getToken, userId } = useAuth();
  const files = useFiles();
  const uploads = useAttachments("file-management");
  const results = useQuery({
    queryKey: ["results", userId],
    queryFn: async () => api<{ results: ProductResult[] }>("/results", await getToken()),
    enabled: Boolean(userId),
    refetchInterval: 10000,
  });
  return (
    <div className="space-y-8">
      <div className="space-y-3 rounded-2xl border p-4">
        <p className="text-sm">
          File asli dan hasil pekerjaan tersimpan sampai kamu menghapusnya. Upload yang belum
          digunakan dibersihkan setelah 24 jam.
        </p>
        <AttachmentPicker state={uploads} />
        <p className="text-xs text-muted-foreground">
          Gunakan File tersimpan dari composer atau form Task untuk memilih revision yang ingin
          dikerjakan.
        </p>
      </div>
      <section className="space-y-3" aria-label="File input tersimpan">
        <h2 className="text-base">File input</h2>
        {files.isPending ? (
          <WorkspaceState kind="loading" title="Memuat file…" />
        ) : files.isError ? (
          <WorkspaceState
            kind="error"
            title="File belum dapat dimuat"
            onRetry={() => void files.refetch()}
          />
        ) : !files.data?.files.length ? (
          <p className="text-sm text-muted-foreground">Belum ada file input.</p>
        ) : (
          files.data.files.map((file) => (
            <article key={file.id} className="space-y-2 rounded-2xl border p-4">
              {file.revisions.map((revision) => (
                <div key={revision.id} className="space-y-2">
                  <p className="text-xs text-muted-foreground">
                    Revision {revision.revision} ·{" "}
                    {revision.status === "ready" ? "Siap" : "Upload belum selesai"}
                  </p>
                  {revision.status === "ready" ? (
                    <FilePreview file={{ ...revision, revision_id: revision.id }} />
                  ) : (
                    <p>{revision.filename}</p>
                  )}
                </div>
              ))}
              <DeleteResource
                path={`/files/${file.id}`}
                name={file.revisions[0]?.filename ?? "file ini"}
              />
            </article>
          ))
        )}
      </section>
      <section className="space-y-3" aria-label="Daftar hasil tersimpan">
        <h2 className="text-base">Hasil pekerjaan</h2>
        {results.isPending ? (
          <WorkspaceState kind="loading" title="Memuat hasil…" />
        ) : results.isError ? (
          <WorkspaceState
            kind="error"
            title="Hasil belum dapat dimuat"
            onRetry={() => void results.refetch()}
          />
        ) : !results.data?.results.length ? (
          <p className="text-sm text-muted-foreground">
            Hasil berkas akan muncul setelah kamu membuat Task.
          </p>
        ) : (
          results.data.results.map((result) => <ResultCard key={result.id} resultId={result.id} />)
        )}
      </section>
      <p className="text-xs text-muted-foreground">
        Menampilkan 50 file dan hasil terbaru. Pencarian lintas percakapan dan resource mengikuti
        pengembangan Library berikutnya.
      </p>
    </div>
  );
}
