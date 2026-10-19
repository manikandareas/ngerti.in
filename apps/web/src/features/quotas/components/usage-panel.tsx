import { RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { WorkspaceState } from "@/components/workspace-state";
import { BillingPanel } from "@/features/billing/components/billing-panel";
import { useQuota } from "@/features/quotas/hooks/use-quota";
import { ComputeUsagePanel } from "./compute-usage";

const dates = new Intl.DateTimeFormat("id-ID", {
  dateStyle: "medium",
  timeStyle: "short",
});

export function UsagePanel() {
  const quota = useQuota();
  if (!quota.data) {
    return (
      <WorkspaceState
        kind={quota.isError ? "error" : "loading"}
        title={quota.isError ? "Penggunaan belum dapat dimuat" : "Memuat penggunaan…"}
        description={
          quota.isError
            ? "Periksa koneksimu, lalu coba lagi. Riwayat chat tetap bisa dibuka."
            : undefined
        }
        onRetry={quota.isError ? () => void quota.refetch() : undefined}
      />
    );
  }
  const {
    meters: { chat },
    period,
    plan,
  } = quota.data;
  return (
    <div className="space-y-7">
      {quota.isError ? (
        <div role="status" className="rounded-xl bg-warning p-4 text-sm text-warning-foreground">
          <p>Pembaruan penggunaan terhenti. Angka di bawah berasal dari pembaruan terakhir.</p>
          <Button
            type="button"
            variant="outline"
            className="mt-3"
            onClick={() => void quota.refetch()}
          >
            <RefreshCw /> Perbarui
          </Button>
        </div>
      ) : null}
      <section
        aria-labelledby="chat-usage-heading"
        className="rounded-2xl border bg-card p-5 min-[701px]:p-7"
      >
        <div className="flex items-start justify-between gap-4">
          <h2 id="chat-usage-heading">Pesan untuk Gwen</h2>
          <span className="rounded-full bg-secondary px-3 py-1 text-xs font-bold">
            {plan === "plus" ? "Plus" : "Free"}
          </span>
        </div>
        <p className="mt-6">
          <strong className="text-3xl tabular-nums">{chat.remaining}</strong>
          <span className="ml-2 text-sm text-muted-foreground">
            dari {chat.limit} pesan tersisa
          </span>
        </p>
        <progress
          className="usage-progress mt-5 h-2 w-full"
          value={chat.used + chat.reserved}
          max={Math.max(1, chat.limit)}
          aria-label="Pesan terpakai dan sedang diproses"
        />
        <dl className="mt-5 grid grid-cols-2 gap-4 text-sm">
          <div>
            <dt className="text-muted-foreground">Sudah dipakai</dt>
            <dd className="mt-1 font-bold tabular-nums">{chat.used} pesan</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Sedang diproses</dt>
            <dd className="mt-1 font-bold tabular-nums">{chat.reserved} pesan</dd>
          </div>
        </dl>
        <p className="mt-6 border-t pt-4 text-sm text-muted-foreground">
          {plan === "plus" ? "Periode berbayar berakhir " : "Tersedia kembali "}
          <time dateTime={period.ends_at}>{dates.format(new Date(period.ends_at))}</time> (waktu
          perangkatmu).
          {plan === "plus" ? " Allowance Plus berikutnya menunggu pembayaran terverifikasi." : ""}
        </p>
      </section>
      {chat.remaining === 0 ? (
        <p role="status" className="rounded-xl bg-warning p-4 text-sm text-warning-foreground">
          Kuota pesan saat ini habis. Kamu tetap bisa membaca percakapan dan menyiapkan draft untuk
          nanti.
        </p>
      ) : null}
      <p className="max-w-prose text-sm text-muted-foreground">
        Satu pesan yang kamu kirim memakai satu kuota chat. Membuka riwayat dan menyambungkan
        kembali percakapan tidak memakai pesan baru. Penggunaan model dan pekerjaan lain juga
        memakai allowance komputasi.
      </p>
      <ComputeUsagePanel />
      <BillingPanel />
    </div>
  );
}
