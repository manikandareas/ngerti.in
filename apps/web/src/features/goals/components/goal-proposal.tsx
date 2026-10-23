import { Target } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useGoalCommands, useGoals } from "@/features/goals/hooks/use-goals";
import { evidenceLabels, type GoalProposal, goalOperationLabels } from "@/features/goals/types";
import { usageDate } from "@/features/quotas/utils/format";

export function GoalProposalCard({ proposal }: { proposal: GoalProposal }) {
  const command = useGoalCommands();
  const p = proposal.preview;
  const actionLabel =
    p.operation === "update" && !p.plan_changed
      ? "Simpan perubahan"
      : goalOperationLabels[p.operation];
  return (
    <article
      data-goal-proposal={proposal.id}
      tabIndex={-1}
      className="space-y-3 rounded-2xl border border-primary/30 bg-card p-5 text-sm"
      aria-label="Tinjau tujuan"
    >
      <h3 className="flex items-center gap-2 font-bold">
        <Target className="size-4" />
        Tujuan · {actionLabel}
      </h3>
      <p className="font-bold wrap-anywhere">{p.spec.title}</p>
      <p className="whitespace-pre-wrap wrap-anywhere">{p.spec.target}</p>
      <ul className="list-inside list-disc space-y-1 wrap-anywhere">
        {p.spec.criteria.map((c) => (
          <li key={c}>{c}</li>
        ))}
      </ul>
      {p.spec.horizon ? <p>Horizon: {p.spec.horizon}</p> : null}
      {p.spec.next_action ? (
        <p className="wrap-anywhere">Langkah berikutnya: {p.spec.next_action}</p>
      ) : null}
      <p className="text-muted-foreground">
        Menyimpan tujuan tidak menjalankan pekerjaan. Setiap pekerjaan atau jadwal memerlukan
        keputusan tersendiri dan menggunakan kuota komputasi saat dijalankan.
      </p>
      <details className="text-xs text-muted-foreground">
        <summary className="cursor-pointer py-2">Detail batas kerja</summary>
        <p>
          Batas seluruh pekerjaan: {p.spec.budget_cap.toLocaleString("id-ID")} unit token internal,
          bukan kredit atau harga uang. Batas akun tetap berlaku.
        </p>
      </details>
      {p.evidence ? (
        <div className="space-y-2 rounded-xl bg-muted p-3">
          <p>
            Kriteria {p.evidence.criterion + 1} · {evidenceLabels[p.evidence.state]}
          </p>
          <p className="whitespace-pre-wrap wrap-anywhere">{p.evidence.note}</p>
          <p className="text-xs">
            {p.source?.kind === "user_report"
              ? "Sumber: laporan pengguna"
              : `Sumber: ${p.source?.title ?? "hasil tersimpan"} · revisi ${p.source?.result_revision ?? p.source?.revision}`}
          </p>
        </div>
      ) : null}
      {p.operation === "update" && p.previous_spec ? (
        <details>
          <summary className="cursor-pointer">Bandingkan target sebelumnya</summary>
          <pre className="mt-2 whitespace-pre-wrap wrap-anywhere font-sans text-xs">
            {JSON.stringify(p.previous_spec, null, 2)}
          </pre>
          <p className="mt-2">
            {p.plan_changed
              ? "Bukti lama menjadi riwayat. Tinjau ulang jadwal untuk target baru."
              : "Target dan kriteria tetap berlaku. Bukti kemajuan dipertahankan."}
          </p>
        </details>
      ) : null}
      <details className="text-xs text-muted-foreground">
        <summary className="cursor-pointer py-2">Aturan tujuan dan izin</summary>
        <p>{p.policy}</p>
      </details>
      <p className="text-xs text-muted-foreground">
        Berlaku sampai {usageDate.format(new Date(proposal.expires_at))}.
      </p>
      <div className="flex flex-wrap gap-2">
        <Button disabled={command.pending} onClick={() => void command.decide(proposal.id, true)}>
          {command.pending ? "Menyimpan…" : actionLabel}
        </Button>
        <Button
          variant="outline"
          disabled={command.pending}
          onClick={() => void command.decide(proposal.id, false)}
        >
          Tolak usulan
        </Button>
      </div>
      {command.error ? (
        <p role="alert" className="text-danger">
          {command.error}
        </p>
      ) : null}
    </article>
  );
}

export function ThreadGoalProposals({ threadId }: { threadId: string }) {
  const data = useGoals();
  const proposals = data.data?.proposals.filter((p) => p.thread_id === threadId) ?? [];
  if (!proposals.length) return null;
  return (
    <section className="mt-6 space-y-3" aria-label="Usulan tujuan">
      {proposals.map((p) => (
        <GoalProposalCard key={p.id} proposal={p} />
      ))}
    </section>
  );
}
