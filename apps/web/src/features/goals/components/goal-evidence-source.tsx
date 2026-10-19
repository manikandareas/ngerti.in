import { useAuth } from "@clerk/tanstack-react-start";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { FilePreview } from "@/features/files/components/file-preview";
import type { ProductResult } from "@/features/files/types";
import type { EvidenceSource } from "@/features/goals/types";
import { api } from "@/lib/api";

export function GoalEvidenceSource({ source }: { source: EvidenceSource }) {
  const { userId, getToken } = useAuth();
  const [open, setOpen] = useState(false);
  const query = useQuery({
    queryKey: ["goal-source", userId, source],
    enabled: open,
    queryFn: async () =>
      source.result_id
        ? api<ProductResult>(
            `/results/${source.result_id}?revision=${source.result_revision}`,
            await getToken(),
          )
        : api<{ result: string | null }>(`/tasks/${source.task_id}`, await getToken()),
    retry: false,
  });
  if (source.kind === "user_report")
    return <p className="text-xs text-muted-foreground">Laporan pengguna</p>;
  return (
    <div className="space-y-2">
      <p className="text-xs text-muted-foreground wrap-anywhere">
        {source.title ?? "Hasil tersimpan"} · revisi {source.result_revision ?? source.revision}
      </p>
      <Button size="sm" variant="outline" onClick={() => setOpen(!open)}>
        {open ? "Tutup bukti" : "Lihat bukti"}
      </Button>
      {open ? (
        query.isPending ? (
          <p role="status">Membuka sumber…</p>
        ) : query.isError ? (
          <p role="alert">Sumber tidak tersedia. Muat ulang tujuan untuk meninjau dukungannya.</p>
        ) : query.data && "selected" in query.data ? (
          <div className="space-y-2">
            {query.data.selected?.manifest.files.map((file) => (
              <FilePreview key={file.revision_id} file={file} />
            ))}
          </div>
        ) : (
          <p className="whitespace-pre-wrap wrap-anywhere text-sm">
            {query.data && "result" in query.data ? query.data.result : "Hasil tidak tersedia."}
          </p>
        )
      ) : null}
    </div>
  );
}
