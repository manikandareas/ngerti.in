import { useAuth } from "@clerk/tanstack-react-start";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { FileCheck, RefreshCw } from "lucide-react";
import { useRef, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { ApiError, api } from "@/lib/api";
import type { OutputSpec, ProductResult } from "../types";
import { DeleteResource } from "./delete-resource";
import { FilePreview } from "./file-preview";

const labels = {
  constructing: "Sedang dibuat",
  ready: "Siap",
  updating: "Sedang diperbarui",
  failed: "Gagal",
  interrupted: "Terhenti",
};

export function ResultCard({ resultId }: { resultId: string }) {
  const { getToken, userId } = useAuth();
  const client = useQueryClient();
  const [revision, setRevision] = useState<number | undefined>();
  const [updating, setUpdating] = useState(false);
  const [instruction, setInstruction] = useState("");
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);
  const request = useRef<{ text: string; key: string } | null>(null);
  const query = useQuery({
    queryKey: ["result", userId, resultId, revision],
    queryFn: async () =>
      api<ProductResult>(
        `/results/${resultId}${revision ? `?revision=${revision}` : ""}`,
        await getToken(),
      ),
    enabled: Boolean(userId),
    refetchInterval: 5000,
    retry: false,
  });
  const result = query.data;
  if (query.isPending)
    return (
      <p role="status" className="text-sm text-muted-foreground">
        Membuka hasil…
      </p>
    );
  if (!result || (query.error instanceof ApiError && [404, 410].includes(query.error.status)))
    return (
      <p role="status" className="text-sm text-muted-foreground">
        Hasil tidak tersedia atau telah dihapus.
      </p>
    );
  const selected = result.selected;
  const active = result.status === "constructing" || result.status === "updating";
  async function update() {
    if (!result?.selected || !instruction.trim() || pending) return;
    const current =
      request.current?.text === instruction
        ? request.current
        : { text: instruction, key: crypto.randomUUID() };
    request.current = current;
    setPending(true);
    setError("");
    try {
      const manifest = result.selected.manifest;
      await api("/tasks", await getToken(), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          thread_id: result.thread_id,
          instruction,
          request_key: current.key,
          review_required: true,
          result_id: result.id,
          expected_result_revision: result.current_revision,
          inputs: manifest.inputs.map((v) => ({
            revision_id: v.revision_id,
            start: v.selection.start,
            end: v.selection.end,
          })),
          outputs: manifest.files.map((v) => ({
            filename: v.filename,
            format: v.filename.split(".").pop() as OutputSpec["format"],
          })),
        }),
      });
      setInstruction("");
      setUpdating(false);
      request.current = null;
      void query.refetch();
      void client.invalidateQueries({ queryKey: ["tasks", userId] });
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Pembaruan belum tersimpan.");
    } finally {
      setPending(false);
    }
  }
  return (
    <section className="space-y-3 rounded-2xl border bg-card p-4" aria-label="Hasil tersimpan">
      {query.isError ? (
        <p role="status" className="text-xs text-danger">
          Sinkronisasi terganggu. Hasil terakhir ditampilkan; coba lagi saat koneksi pulih.
        </p>
      ) : null}
      <div className="flex flex-wrap items-center gap-2">
        <FileCheck className="size-4" />
        <span className="text-sm font-bold">Hasil tersimpan</span>
        <Badge variant="secondary">{labels[result.status]}</Badge>
      </div>
      {selected ? (
        <>
          <p className="text-sm whitespace-pre-wrap wrap-anywhere">{selected.manifest.summary}</p>
          <label className="flex items-center gap-2 text-xs text-muted-foreground">
            Revision
            <select
              className="rounded-md border bg-card p-2 text-foreground"
              aria-label="Revision hasil"
              value={selected.revision}
              onChange={(event) => setRevision(Number(event.target.value))}
            >
              {result.revisions.map((v) => (
                <option key={v.revision} value={v.revision}>
                  v{v.revision} · {v.status === "ready" ? "Siap" : "Belum selesai"}
                </option>
              ))}
            </select>
          </label>
          {selected.status === "ready" ? (
            selected.manifest.files.map((file) => (
              <FilePreview key={file.revision_id} file={file} />
            ))
          ) : (
            <p className="text-sm text-muted-foreground">
              Revision ini belum dipublikasikan sepenuhnya.
            </p>
          )}
          {result.status !== "ready" ? (
            <p className="text-xs text-muted-foreground">
              Berkas siap dari revision sebelumnya tetap dapat dibuka.
            </p>
          ) : null}
          <details className="text-xs text-muted-foreground">
            <summary className="cursor-pointer py-2">
              Input yang digunakan ({selected.manifest.inputs.length})
            </summary>
            {selected.manifest.previous_result ? (
              <p className="py-1">
                Memperbarui hasil v{selected.manifest.previous_result.revision}.
              </p>
            ) : null}
            {selected.manifest.inputs.length ? (
              selected.manifest.inputs.map((v) => (
                <p key={v.revision_id} className="py-1 wrap-anywhere">
                  {v.filename} · v{v.revision} · {v.selection.unit === "page" ? "halaman" : "baris"}{" "}
                  {v.selection.start}–{v.selection.end ?? "akhir"} · SHA-256 {v.sha256.slice(0, 12)}{" "}
                  · revision {v.revision_id}
                </p>
              ))
            ) : (
              <p>Dibuat dari instruksi dan konteks percakapan.</p>
            )}
          </details>
        </>
      ) : (
        <p className="text-sm text-muted-foreground">
          Berkas belum siap. Ikuti progres dan draft pada Task.
        </p>
      )}
      <div className="flex flex-wrap gap-2">
        {selected?.status === "ready" ? (
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={active}
            onClick={() => setUpdating(!updating)}
          >
            <RefreshCw /> Perbarui hasil
          </Button>
        ) : null}
        <DeleteResource path={`/results/${resultId}`} name="hasil ini" result />
      </div>
      {updating ? (
        <form
          className="space-y-2"
          onSubmit={(event) => {
            event.preventDefault();
            void update();
          }}
        >
          <label className="block text-sm font-medium" htmlFor={`update-${resultId}`}>
            Perubahan yang kamu inginkan
          </label>
          <Textarea
            id={`update-${resultId}`}
            value={instruction}
            maxLength={6000}
            onChange={(event) => setInstruction(event.target.value)}
          />
          <p className="text-xs text-muted-foreground">
            Membuat Task baru dengan input yang sama dan review sebelum publikasi. Memakai 1 pesan;
            revision siap sebelumnya tetap tersedia.
          </p>
          <Button type="submit" disabled={pending || !instruction.trim()}>
            {pending ? "Menyimpan…" : "Buat pembaruan"}
          </Button>
        </form>
      ) : null}
      {error ? (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      ) : null}
    </section>
  );
}
