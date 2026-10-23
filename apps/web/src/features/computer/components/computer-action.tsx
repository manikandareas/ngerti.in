import { Button } from "@/components/ui/button";
import { useExpired } from "@/features/chat/hooks/use-expired";
import type { ComputerState } from "@/features/computer/types";

export function ComputerAction({
  proposal,
  pending,
  decide,
  takeover,
}: {
  proposal: NonNullable<ComputerState["action"]>;
  pending: boolean;
  decide: (approved: boolean) => void;
  takeover?: () => void;
}) {
  const { action } = proposal;
  const expired = useExpired(proposal.expires_at);
  const actionable = proposal.state === "proposed" && !expired;
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
          : action.dom
            ? action.kind === "select"
              ? `Pilih opsi: ${action.dom.value}`
              : `Target di halaman: ${proposal.decision?.target?.label || "Periksa target pada layar"}`
            : action.kind === "click"
              ? `Target di halaman: ${proposal.decision?.target?.label || "Periksa target pada layar"}`
              : action.kind === "key"
                ? `Tekan ${action.key}.`
                : "Ketik teks berikut pada kolom yang sedang aktif."}
      </p>
      {proposal.decision?.target?.href ? (
        <p className="text-xs wrap-anywhere">Tujuan: {proposal.decision.target.href}</p>
      ) : null}
      {action.kind === "type" ? (
        <pre className="max-h-32 overflow-auto whitespace-pre-wrap text-sm">{action.text}</pre>
      ) : null}
      {proposal.decision?.target?.preview?.length ? (
        <dl className="max-h-64 space-y-2 overflow-auto rounded-lg bg-background p-3 text-sm">
          {proposal.decision.target.preview.map((field) => (
            <div key={`${field.label}-${field.value}`}>
              <dt className="font-semibold">{field.label}</dt>
              <dd className="whitespace-pre-wrap wrap-anywhere">{field.value || "(kosong)"}</dd>
            </div>
          ))}
        </dl>
      ) : null}
      <p className="text-xs text-muted-foreground">
        Pengiriman, perubahan data, tindakan keamanan, atau dampak yang belum jelas memerlukan
        persetujuan. Izin berlaku untuk aksi, halaman, dan target ini.
      </p>
      <p className="text-xs text-muted-foreground" role="status">
        {expired && proposal.state === "proposed"
          ? "Permintaan kedaluwarsa. Tunggu status terbaru sebelum melanjutkan."
          : proposal.state === "proposed"
            ? `Berlaku sampai ${new Date(proposal.expires_at).toLocaleString("id-ID")}`
            : `Keputusan: ${({ approved: "disetujui", rejected: "ditolak", expired: "kedaluwarsa", executed: "dilaksanakan" } as Record<string, string>)[proposal.state] ?? proposal.state}`}
      </p>
      <details className="text-xs text-muted-foreground">
        <summary className="cursor-pointer py-2">Detail teknis</summary>
        <p>
          Permintaan {proposal.id} · versi kendali {proposal.control_version}
        </p>
      </details>
      {actionable ? (
        <div className="flex flex-wrap gap-2">
          <Button type="button" disabled={pending} onClick={() => decide(true)}>
            Setujui aksi ini
          </Button>
          <Button type="button" variant="outline" disabled={pending} onClick={() => decide(false)}>
            Tolak aksi
          </Button>
          {takeover ? (
            <Button type="button" variant="outline" disabled={pending} onClick={takeover}>
              Ambil alih
            </Button>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
