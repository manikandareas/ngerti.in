import { CalendarClock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { WorkEstimate } from "@/features/quotas/components/work-estimate";
import { useScheduleCommands, useSchedules } from "@/features/schedules/hooks/use-schedules";
import type { ScheduleProposal } from "@/features/schedules/types";
import {
  operationLabels,
  recurrenceLabel,
  timeLabel,
} from "@/features/schedules/utils/presentation";

export function ScheduleProposalCard({ proposal }: { proposal: ScheduleProposal }) {
  const { pending, error, decide } = useScheduleCommands();
  const { preview } = proposal;
  return (
    <article className="space-y-3 rounded-2xl border border-primary/30 bg-card p-5 text-sm">
      <h3 className="flex items-center gap-2 font-bold">
        <CalendarClock className="size-4" /> Tinjau jadwal · {operationLabels[preview.operation]}
      </h3>
      <p className="font-bold wrap-anywhere">{preview.spec.title}</p>
      <p className="whitespace-pre-wrap wrap-anywhere">{preview.spec.instruction}</p>
      <p>{recurrenceLabel(preview.spec)}</p>
      <p>Hasil ke: {preview.target_thread_title}</p>
      {preview.goal ? (
        <p className="wrap-anywhere">
          Tujuan: {preview.goal.title} · target v{preview.goal.revision}. Eksekusi mengikuti status
          dan sisa batas kerja tujuan.
        </p>
      ) : null}
      {preview.next_times.length ? (
        <div>
          <p className="font-medium">Waktu berikutnya</p>
          <ul className="mt-1 list-inside list-disc">
            {preview.next_times.map((t) => (
              <li key={t}>{timeLabel(t, preview.spec.timezone)}</li>
            ))}
          </ul>
        </div>
      ) : null}
      <p className="text-muted-foreground">{preview.permissions.scope}</p>
      {preview.inputs?.length ? (
        <ul className="space-y-1 text-xs">
          {preview.inputs.map((file) => (
            <li key={file.id} className="wrap-anywhere">
              {file.filename} · v{file.revision} · halaman/baris {file.start}–{file.end ?? "akhir"}{" "}
              · SHA-256 {file.sha256.slice(0, 12)}
            </li>
          ))}
        </ul>
      ) : null}
      {preview.spec.outputs.length ? (
        <p className="text-xs wrap-anywhere">
          Berkas hasil: {preview.spec.outputs.map((file) => file.filename).join(", ")}
        </p>
      ) : null}
      {["pause", "delete"].includes(preview.operation) ? (
        <p className="text-muted-foreground">
          Keputusan ini tidak menjalankan pekerjaan baru atau memakai kredit komputasi.
        </p>
      ) : (
        <WorkEstimate
          scheduled
          runtimeKind={preview.spec.runtime_kind}
          perRunCap={preview.permissions.per_run_cap}
          inputs={preview.spec.inputs.map((item) => item.revision_id)}
        />
      )}
      <p className="text-xs text-muted-foreground">{preview.permissions.resource_policy}</p>
      <details className="text-xs text-muted-foreground">
        <summary className="cursor-pointer">Aturan waktu dan eksekusi</summary>
        <p className="mt-2">{preview.execution_policy}</p>
        <p className="mt-1">{preview.timing_policy}</p>
      </details>
      <p className="text-xs text-muted-foreground">
        Usulan berlaku sampai {timeLabel(proposal.expires_at, preview.spec.timezone)}.{" "}
        {preview.spec.review_required
          ? "Hasil Task juga menunggu review."
          : "Hasil disimpan setelah selesai."}
      </p>
      <div className="flex flex-wrap gap-2">
        <Button disabled={pending} onClick={() => void decide(proposal.id, true)}>
          {pending ? "Menyimpan…" : operationLabels[preview.operation]}
        </Button>
        <Button
          variant="outline"
          disabled={pending}
          onClick={() => void decide(proposal.id, false)}
        >
          Tolak usulan
        </Button>
      </div>
      {error ? (
        <p role="alert" className="text-danger">
          {error}
        </p>
      ) : null}
    </article>
  );
}

export function ThreadScheduleProposals({ threadId }: { threadId: string }) {
  const schedules = useSchedules();
  const proposals = schedules.data?.proposals.filter((p) => p.thread_id === threadId) ?? [];
  if (!proposals.length) return null;
  return (
    <section className="mt-6 space-y-3" aria-label="Usulan jadwal">
      <h2 className="text-sm font-bold">Jadwal yang perlu ditinjau</h2>
      {proposals.map((p) => (
        <ScheduleProposalCard key={p.id} proposal={p} />
      ))}
    </section>
  );
}
