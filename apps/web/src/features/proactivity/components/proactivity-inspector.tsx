import { Button } from "@/components/ui/button";
import { useProactivity } from "@/features/proactivity/hooks/use-proactivity";
import type { ProactiveCandidate } from "@/features/proactivity/types";

function CandidateInspection({ candidate }: { candidate: ProactiveCandidate }) {
  return (
    <article className="min-w-0 space-y-3 rounded-xl border p-4 wrap-anywhere">
      <div>
        <p className="text-xs text-muted-foreground">
          {candidate.state} · {candidate.reason}
        </p>
        <h3 className="mt-1 font-semibold">{candidate.payload.title ?? "Konteks dicabut"}</h3>
      </div>
      {candidate.payload.preview && <p className="text-sm">{candidate.payload.preview}</p>}
      {candidate.payload.why_relevant && (
        <dl className="space-y-2 text-sm">
          <div>
            <dt className="font-medium">Mengapa relevan</dt>
            <dd>{candidate.payload.why_relevant}</dd>
          </div>
          <div>
            <dt className="font-medium">Mengapa sekarang</dt>
            <dd>{candidate.payload.why_now}</dd>
          </div>
          <div>
            <dt className="font-medium">Apa yang baru</dt>
            <dd>{candidate.payload.what_is_new}</dd>
          </div>
        </dl>
      )}
      <p className="text-xs text-muted-foreground">
        Thread {candidate.thread_id} · Berlaku sampai{" "}
        {new Date(candidate.expires_at).toLocaleString()}
      </p>
      <details className="text-xs">
        <summary className="cursor-pointer py-2 font-medium">Evidence dan penilaian Jev</summary>
        <ul className="space-y-2 py-2">
          {candidate.evidence_refs.map((ref) => (
            <li key={ref.key}>
              {ref.kind} · {ref.id} · revisi {ref.revision}
              <br />
              Hash {ref.hash}
            </li>
          ))}
        </ul>
        <dl className="grid grid-cols-2 gap-2 border-t pt-3">
          {Object.entries(candidate.judgment).map(([name, value]) => (
            <div key={name}>
              <dt>{name}</dt>
              <dd className="font-mono">
                {(value.score ?? value.noul ?? 0).toFixed(2)}
                {value.confidence !== undefined
                  ? ` · confidence ${value.confidence.toFixed(2)}`
                  : ""}
              </dd>
            </div>
          ))}
        </dl>
      </details>
    </article>
  );
}

export function ProactivityInspector() {
  const { query, command } = useProactivity();
  const data = query.data;
  return (
    <section
      aria-labelledby="proactive-title"
      className="mt-8 min-w-0 space-y-5 rounded-2xl border p-5"
    >
      <div>
        <p className="text-xs font-semibold text-muted-foreground">Development · NG-019</p>
        <h2 id="proactive-title" className="mt-1 text-xl font-bold">
          Pratinjau kandidat proaktif
        </h2>
        <p className="mt-2 text-sm text-muted-foreground">
          LLM menyiapkan usulan, Jev menilai, backend memilih. Pratinjau ini tidak mengirim pesan
          atau menjalankan pekerjaan.
        </p>
      </div>
      {query.isPending ? (
        <p role="status">Memuat evaluasi…</p>
      ) : !data ? (
        <div role="alert">
          <p>Evaluasi belum dapat dimuat.</p>
          <Button variant="outline" onClick={() => void query.refetch()}>
            Coba lagi
          </Button>
        </div>
      ) : (
        <>
          <p className="text-sm">
            Evaluasi background: {data.controls.enabled ? "aktif" : "nonaktif"} · Provider:{" "}
            {data.provider_ready ? "siap" : "belum dikonfigurasi"}
          </p>
          <div className="flex flex-wrap gap-2">
            <Button
              variant="outline"
              disabled={command.isPending}
              onClick={() =>
                command.mutate({
                  path: "settings",
                  body: {
                    enabled: !data.controls.enabled,
                    expected_revision: data.controls.revision,
                  },
                })
              }
            >
              {data.controls.enabled ? "Nonaktifkan evaluasi" : "Aktifkan evaluasi pratinjau"}
            </Button>
            <Button
              disabled={!data.controls.enabled || !data.provider_ready || command.isPending}
              onClick={() => command.mutate({ path: "evaluations", body: {} })}
            >
              Evaluasi sekarang
            </Button>
            <Button
              variant="ghost"
              disabled={query.isFetching}
              onClick={() => void query.refetch()}
            >
              Segarkan
            </Button>
          </div>
          {query.isError && <p role="alert">Pembaruan gagal. Data terakhir masih ditampilkan.</p>}
          {command.isError && (
            <p role="alert" className="text-sm text-destructive">
              {command.error.message}
            </p>
          )}
          <ul aria-label="Riwayat evaluasi proaktif" className="space-y-2 text-sm">
            {data.evaluations.slice(0, 6).map((e) => (
              <li key={e.id} className="wrap-anywhere">
                {new Date(e.created_at).toLocaleString()} · {e.status} ·{" "}
                {e.reason ?? "menunggu evaluasi"}
              </li>
            ))}
          </ul>
          <div className="grid min-w-0 gap-4 lg:grid-cols-2">
            {data.candidates.slice(0, 10).map((candidate) => (
              <CandidateInspection key={candidate.id} candidate={candidate} />
            ))}
          </div>
          {!data.evaluations.length && (
            <p className="text-sm text-muted-foreground">
              Belum ada evaluasi. Aktifkan pratinjau, lalu pilih Evaluasi sekarang.
            </p>
          )}
        </>
      )}
    </section>
  );
}
