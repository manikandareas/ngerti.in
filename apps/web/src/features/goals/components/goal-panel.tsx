import { useState } from "react";
import { Button } from "@/components/ui/button";
import { WorkspaceState } from "@/components/workspace-state";
import { useGoals } from "@/features/goals/hooks/use-goals";
import { goalStateLabels } from "@/features/goals/types";
import { GoalDetailPanel } from "./goal-detail";
import { GoalForm } from "./goal-form";
import { GoalProposalCard } from "./goal-proposal";

export function GoalPanel({ threadId }: { threadId: string | null }) {
  const data = useGoals();
  const [creating, setCreating] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);
  return (
    <div className="space-y-7">
      <p className="text-sm text-muted-foreground">
        Simpan target, tentukan keberhasilannya, lalu tinjau kemajuan dari bukti yang nyata. Kamu
        juga bisa membicarakannya melalui chat.
      </p>
      <Button onClick={() => setCreating(!creating)}>
        {creating ? "Tutup form" : "Buat tujuan"}
      </Button>
      {creating ? <GoalForm threadId={threadId} onClose={() => setCreating(false)} /> : null}
      {data.data?.proposals.map((p) => (
        <GoalProposalCard key={p.id} proposal={p} />
      ))}
      {data.isError ? (
        <WorkspaceState
          kind="error"
          title="Tujuan belum tersinkron"
          description="Data terakhir tetap ditampilkan jika tersedia."
          onRetry={() => void data.refetch()}
        />
      ) : null}
      {data.isPending ? (
        <WorkspaceState kind="loading" title="Membuka tujuan…" />
      ) : data.data?.goals.length ? (
        <>
          <fieldset className="flex flex-wrap gap-2" aria-label="Pilih tujuan">
            {data.data.goals.map((g) => (
              <Button
                key={g.id}
                variant={selected === g.id ? "secondary" : "outline"}
                className="h-auto min-h-11 max-w-full whitespace-normal wrap-anywhere text-left"
                onClick={() => setSelected(g.id)}
              >
                {g.spec.title} · {goalStateLabels[g.state]}
              </Button>
            ))}
          </fieldset>
          {selected ? (
            <GoalDetailPanel key={selected} id={selected} />
          ) : (
            <p className="text-sm text-muted-foreground">
              Pilih tujuan untuk melihat kriteria, bukti dan pekerjaan terkait.
            </p>
          )}
        </>
      ) : (
        <WorkspaceState
          kind="empty"
          title="Apa yang ingin kamu capai?"
          description="Contoh: siapkan portofolio bulan ini, dengan CV selesai dan tiga studi kasus siap ditinjau."
        />
      )}
    </div>
  );
}
