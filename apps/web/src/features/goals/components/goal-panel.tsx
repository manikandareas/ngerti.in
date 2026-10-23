import { useState } from "react";
import { Button } from "@/components/ui/button";
import { WorkspaceState } from "@/components/workspace-state";
import { useGoal, useGoals } from "@/features/goals/hooks/use-goals";
import { goalStateLabels } from "@/features/goals/types";
import { useResourceContext } from "@/features/library/components/resource-context";
import { GoalDetailPanel } from "./goal-detail";
import { GoalForm } from "./goal-form";
import { GoalProposalCard } from "./goal-proposal";

export function GoalPanel({ threadId }: { threadId: string | null }) {
  const context = useResourceContext();
  const data = useGoals();
  const [creating, setCreating] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);
  return (
    <div className="space-y-7">
      <Button
        onClick={() =>
          context.prepare(
            "Bantu aku merencanakan tujuan berikut. Tanyakan target, kriteria keberhasilan dan waktu yang belum jelas, lalu ajukan proposal untuk kutinjau. Jangan jalankan pekerjaan dulu.\n\nTujuanku: ",
          )
        }
      >
        {" "}
        Rencanakan lewat chat
      </Button>
      <p className="text-sm text-muted-foreground">
        Simpan target, tentukan keberhasilannya, lalu tinjau kemajuan dari bukti yang nyata. Kamu
        juga bisa membicarakannya melalui chat.
      </p>
      <Button variant="outline" onClick={() => setCreating(!creating)}>
        {creating ? "Tutup form" : "Isi tujuan sendiri"}
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
              <GoalSummary
                key={g.id}
                id={g.id}
                title={g.spec.title}
                target={g.spec.target}
                state={g.state}
                selected={selected === g.id}
                onSelect={() => setSelected(g.id)}
              />
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

function GoalSummary({
  id,
  title,
  target,
  state,
  selected,
  onSelect,
}: {
  id: string;
  title: string;
  target: string;
  state: keyof typeof goalStateLabels;
  selected: boolean;
  onSelect: () => void;
}) {
  const detail = useGoal(id);
  return (
    <button
      type="button"
      aria-pressed={selected}
      onClick={onSelect}
      className={`w-full space-y-2 rounded-xl border p-4 text-left text-sm ${selected ? "bg-secondary" : "bg-card hover:bg-muted"}`}
    >
      <span className="block font-semibold wrap-anywhere">{title}</span>
      <span className="block line-clamp-2 text-muted-foreground wrap-anywhere">{target}</span>
      <span className="block text-xs text-muted-foreground">
        {goalStateLabels[state]} ·{" "}
        {detail.data
          ? `${detail.data.met} dari ${detail.data.spec.criteria.length} kriteria terpenuhi${detail.data.needs_review ? " · bukti perlu ditinjau" : ""}`
          : detail.isError
            ? "Kemajuan belum tersinkron"
            : "Memuat kemajuan…"}
      </span>
      {detail.data ? (
        <progress
          aria-label={`Kemajuan ${title}`}
          className="usage-progress h-1 w-full"
          max={detail.data.spec.criteria.length || 1}
          value={detail.data.met}
        />
      ) : null}
    </button>
  );
}
