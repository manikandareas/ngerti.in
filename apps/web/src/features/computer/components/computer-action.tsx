import { Button } from "@/components/ui/button";
import type { ComputerState } from "@/features/computer/types";

export function ComputerAction({
  proposal,
  pending,
  decide,
}: {
  proposal: NonNullable<ComputerState["action"]>;
  pending: boolean;
  decide: (approved: boolean) => void;
}) {
  const { action } = proposal;
  return (
    <section
      className="space-y-3 rounded-xl border bg-secondary p-4"
      aria-label="Persetujuan aksi browser"
    >
      <h3 className="text-sm font-bold">Periksa sebelum Gwen bertindak</h3>
      <p className="text-sm wrap-anywhere">{action.description}</p>
      <p className="text-xs text-muted-foreground">
        {action.kind === "navigate"
          ? `Buka ${action.url}`
          : action.kind === "click"
            ? `Klik pada posisi ${action.x}, ${action.y} di layar.`
            : action.kind === "key"
              ? `Tekan ${action.key}.`
              : "Ketik teks berikut pada kolom yang sedang aktif."}
      </p>
      {action.kind === "type" ? (
        <pre className="max-h-32 overflow-auto whitespace-pre-wrap text-sm">{action.text}</pre>
      ) : null}
      <p className="text-xs text-muted-foreground">
        Persetujuan berlaku untuk aksi, halaman, dan target ini. Perubahan perlu dinilai ulang.
      </p>
      <div className="flex flex-wrap gap-2">
        <Button type="button" disabled={pending} onClick={() => decide(true)}>
          Setujui aksi ini
        </Button>
        <Button type="button" variant="outline" disabled={pending} onClick={() => decide(false)}>
          Tolak aksi
        </Button>
      </div>
    </section>
  );
}
