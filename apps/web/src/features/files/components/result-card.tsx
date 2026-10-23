import { useAuth } from "@clerk/tanstack-react-start";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { FileCheck, RefreshCw } from "lucide-react";
import { useRef, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useResourceContext } from "@/features/library/components/resource-context";
import { ApiError, api } from "@/lib/api";
import type { OutputSpec, ProductResult } from "../types";
import { DeleteResource } from "./delete-resource";
import { FilePreview } from "./file-preview";
import { ResultThumbnail } from "./result-thumbnail";

const labels = {
  constructing: "Sedang dibuat",
  ready: "Siap",
  updating: "Sedang diperbarui",
  failed: "Gagal",
  interrupted: "Terhenti",
};

export function ResultCard({
  resultId,
  inline = false,
  initialRevision,
  onRevisionChange,
}: {
  resultId: string;
  inline?: boolean;
  initialRevision?: number;
  onRevisionChange?: (revision: number) => void;
}) {
  const context = useResourceContext();
  const { getToken, userId } = useAuth();
  const client = useQueryClient();
  const [revision, setRevision] = useState<number | undefined>(initialRevision);
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
      <div role="status" className="space-y-2 text-sm text-muted-foreground">
        <p>
          {query.error instanceof ApiError && [404, 410].includes(query.error.status)
            ? "Hasil tidak tersedia atau telah dihapus."
            : "Hasil belum dapat dimuat. Periksa koneksi dan coba lagi."}
        </p>
        <Button variant="outline" onClick={() => void query.refetch()}>
          Coba lagi
        </Button>
      </div>
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
          runtime_kind: result.selected.runtime_kind ?? "text",
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
  if (!inline)
    return (
      <button
        type="button"
        className="group/artifact block w-full min-w-0 overflow-hidden rounded-[22px] bg-muted p-1.5 text-left transition-colors hover:bg-accent focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-ring motion-reduce:transition-none"
        onClick={() => context.open({ kind: "result", id: resultId, revision: selected?.revision })}
      >
        <ResultThumbnail
          file={selected?.status === "ready" ? selected.manifest.files[0] : undefined}
        />
        <span className="flex min-w-0 items-center gap-2.5 px-2.5 py-3">
          <FileCheck className="size-7 shrink-0 text-primary" />
          <span className="min-w-0 flex-1">
            <span
              className="block truncate text-sm font-bold"
              title={selected?.manifest.files[0]?.filename}
            >
              {selected?.manifest.files[0]?.filename ?? "Hasil percakapan"}
            </span>
            <span className="mt-0.5 block text-xs text-muted-foreground">
              Artifact{result.status !== "ready" ? ` · ${labels[result.status]}` : ""}
            </span>
          </span>
        </span>
      </button>
    );
  return (
    <section className="min-w-0 space-y-3" aria-label="Hasil tersimpan">
      {query.isError ? (
        <p role="status" className="text-xs text-danger">
          Sinkronisasi terganggu. Hasil terakhir ditampilkan; coba lagi saat koneksi pulih.
        </p>
      ) : null}
      {selected ? (
        <>
          <label className="flex items-center gap-2 text-xs text-muted-foreground">
            <Badge variant="secondary">{labels[result.status]}</Badge>
            Versi
            <select
              className="rounded-md border bg-card p-2 text-foreground"
              aria-label="Versi hasil"
              value={selected.revision}
              onChange={(event) => {
                const next = Number(event.target.value);
                setRevision(next);
                onRevisionChange?.(next);
              }}
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
              <FilePreview key={file.revision_id} file={file} inline />
            ))
          ) : (
            <p className="text-sm text-muted-foreground">
              Versi ini belum dipublikasikan sepenuhnya.
            </p>
          )}
          {result.status !== "ready" ? (
            <p className="text-xs text-muted-foreground">
              Berkas siap dari revision sebelumnya tetap dapat dibuka.
            </p>
          ) : null}
          <details className="text-xs text-muted-foreground">
            <summary className="cursor-pointer py-2">
              Detail hasil dan sumber ({selected.manifest.inputs.length})
            </summary>
            <p className="whitespace-pre-wrap wrap-anywhere">{selected.manifest.summary}</p>
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
      {result.status !== "ready" ? (
        <Button
          variant="outline"
          size="sm"
          onClick={() => context.open({ kind: "task", id: result.active_task_id })}
        >
          {active ? "Lihat progres pekerjaan" : "Tinjau pekerjaan dan pemulihan"}
        </Button>
      ) : null}
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
