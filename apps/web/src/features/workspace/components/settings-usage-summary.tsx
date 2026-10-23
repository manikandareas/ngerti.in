import { Button } from "@/components/ui/button";
import { useQuota } from "@/features/quotas/hooks/use-quota";
import { usageDate } from "@/features/quotas/utils/format";

export function SettingsUsageSummary() {
  const quota = useQuota();
  const chat = quota.data?.meters.chat;
  if (quota.data?.unlimited) {
    return (
      <section className="space-y-2 rounded-2xl bg-muted/60 p-4" aria-label="Ringkasan penggunaan">
        <p className="text-sm font-bold">Penggunaan tanpa batas</p>
        <p className="text-xs text-muted-foreground">
          Chat, komputasi, dan penyimpanan akun tanpa kuota.
        </p>
      </section>
    );
  }
  return (
    <section className="space-y-3 rounded-2xl bg-muted/60 p-4" aria-label="Ringkasan penggunaan">
      {quota.data && chat ? (
        <>
          <div className="flex justify-between gap-3 text-sm">
            <span className="font-bold">Paket {quota.data.plan === "plus" ? "Plus" : "Free"}</span>
            <span>
              {chat.remaining} dari {chat.limit} pesan tersisa
            </span>
          </div>
          <progress
            className="usage-progress h-2 w-full"
            value={chat.used + chat.reserved}
            max={Math.max(1, chat.limit)}
            aria-label="Kuota pesan terpakai dan dicadangkan"
          />
          <p className="text-xs text-muted-foreground">
            {quota.data.plan === "plus" ? "Periode berakhir" : "Tersedia kembali"}{" "}
            {usageDate.format(new Date(quota.data.period.ends_at))}
          </p>
        </>
      ) : (
        <p role="status" className="text-sm">
          {quota.isError ? "Penggunaan belum dapat dimuat." : "Memuat penggunaan…"}
        </p>
      )}
      {quota.isError && (
        <Button variant="ghost" onClick={() => void quota.refetch()}>
          Coba lagi
        </Button>
      )}
    </section>
  );
}
