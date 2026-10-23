import { useState } from "react";
import { Button } from "@/components/ui/button";
import { WorkspaceState } from "@/components/workspace-state";
import { useComputeUsage } from "../hooks/use-compute-usage";
import { formatCredits, usageDate } from "../utils/format";

export function ComputeUsagePanel() {
  const [offset, setOffset] = useState(0);
  const query = useComputeUsage(offset);
  if (!query.data)
    return (
      <WorkspaceState
        kind={query.isError ? "error" : "loading"}
        title={query.isError ? "Penggunaan komputasi belum dapat dimuat" : "Memuat komputasi…"}
        onRetry={query.isError ? () => void query.refetch() : undefined}
      />
    );
  const { compute, storage, items, period, unlimited } = query.data;
  return (
    <div className="space-y-7">
      {query.isError && (
        <p role="status" className="rounded-xl bg-warning p-4 text-sm text-warning-foreground">
          Pembaruan terhenti. Angka di bawah berasal dari pembaruan terakhir.{" "}
          <Button variant="link" onClick={() => void query.refetch()}>
            Perbarui
          </Button>
        </p>
      )}
      {unlimited ? (
        <section className="space-y-3 border-t pt-6" aria-label="Penggunaan tanpa batas">
          <h2>Komputasi dan penyimpanan tanpa kuota</h2>
          <p className="text-sm">
            Terpakai {formatCredits(compute.used)} · Dicadangkan {formatCredits(compute.reserved)}
          </p>
          <p className="text-sm">
            Penyimpanan terpakai{" "}
            {(storage.bytes / 1048576).toLocaleString("id-ID", { maximumFractionDigits: 2 })} MiB
          </p>
        </section>
      ) : (
        <>
          <section aria-labelledby="compute-usage-heading" className="space-y-5 border-t pt-6">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h2 id="compute-usage-heading">Komputasi</h2>
              <span className="text-sm">{formatCredits(compute.remaining)} tersisa</span>
            </div>
            <progress
              className="usage-progress h-2 w-full"
              max={compute.limit}
              value={compute.used + compute.reserved}
              aria-label="Komputasi terpakai dan dicadangkan"
            />
            <dl className="grid grid-cols-2 gap-x-4 gap-y-5 text-sm">
              <div>
                <dt className="text-muted-foreground">Sudah dipakai</dt>
                <dd className="mt-1 font-bold tabular-nums">{formatCredits(compute.used)}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Dicadangkan</dt>
                <dd className="mt-1 font-bold tabular-nums">{formatCredits(compute.reserved)}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Kuota periode ini</dt>
                <dd className="mt-1 tabular-nums">{formatCredits(compute.limit)}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">
                  {query.data.plan === "plus" ? "Akhir periode berbayar" : "Reset berikutnya"}
                </dt>
                <dd className="mt-1">
                  <time dateTime={period.ends_at}>
                    {usageDate.format(new Date(period.ends_at))}
                  </time>
                </dd>
              </div>
            </dl>
            <p className="max-w-prose text-sm text-muted-foreground">
              Chat, pengolahan file, Python, browser, memory dan evaluasi proaktif menggunakan
              komputasi. Cadangan membatasi pekerjaan sebelum berjalan; sisa dikembalikan setelah
              selesai. Angka mengikuti tarif yang berlaku saat pekerjaan diterima.
              {query.data.plan === "plus"
                ? " Kuota Plus berikutnya menunggu pembayaran terverifikasi."
                : ""}
            </p>
            {compute.remaining === 0 && (
              <p
                role="status"
                className="rounded-xl bg-warning p-4 text-sm text-warning-foreground"
              >
                Komputasi habis atau sedang dicadangkan. Kamu tetap bisa menghentikan pekerjaan,
                meninjau approval, mengunduh hasil, mengelola memory dan menjeda jadwal.
              </p>
            )}
          </section>
          <section aria-labelledby="storage-usage-heading" className="space-y-3 border-t pt-6">
            <h2 id="storage-usage-heading">Penyimpanan file</h2>
            <p className="text-sm tabular-nums">
              {(storage.bytes / 1048576).toLocaleString("id-ID", { maximumFractionDigits: 2 })} dari{" "}
              {Math.round(storage.limit_bytes / 1048576)} MiB
            </p>
            <progress
              className="usage-progress h-2 w-full"
              value={storage.bytes}
              max={storage.limit_bytes}
              aria-label="Penyimpanan file terpakai"
            />
            <p className="text-sm text-muted-foreground">
              Termasuk file yang masih menunggu penghapusan fisik. Penyimpanan profil browser
              tercakup dalam cadangan pekerjaan browser.
            </p>
          </section>
        </>
      )}
      <section aria-labelledby="compute-history-heading" className="space-y-4 border-t pt-6">
        <h2 id="compute-history-heading">Riwayat komputasi</h2>
        {!items.length && (
          <p className="text-sm text-muted-foreground">
            Belum ada penggunaan komputasi tercatat. Pekerjaan sebelumnya tidak dipotong ulang.
          </p>
        )}
        <ul className="divide-y">
          {items.map((item) => (
            <li key={item.id} className="space-y-2 py-4 first:pt-0">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <p className="min-w-0 flex-1 break-words text-sm font-bold">{item.title}</p>
                <span className="text-sm tabular-nums">{formatCredits(item.used)}</span>
              </div>
              <p className="text-xs text-muted-foreground">
                <time dateTime={item.created_at}>
                  {usageDate.format(new Date(item.created_at))}
                </time>
                {" · "}
                {item.sponsored
                  ? "Termasuk layanan"
                  : item.refunded
                    ? "Kuota dikembalikan — tidak ada hasil"
                    : item.state === "active"
                      ? "Sedang diproses"
                      : item.pending > 0
                        ? "Sebagian penggunaan masih diperiksa"
                        : "Selesai"}
              </p>
              {item.reserved > 0 && (
                <p className="text-xs text-muted-foreground">
                  {formatCredits(item.reserved)} dicadangkan
                </p>
              )}
            </li>
          ))}
        </ul>
        <div className="flex justify-between gap-3">
          <Button
            variant="outline"
            disabled={offset === 0}
            onClick={() => setOffset(Math.max(0, offset - 30))}
          >
            Lebih baru
          </Button>
          <Button
            variant="outline"
            disabled={query.data.next_offset === null}
            onClick={() => setOffset(query.data.next_offset ?? offset)}
          >
            Lebih lama
          </Button>
        </div>
      </section>
      <p className="max-w-prose text-sm text-muted-foreground">
        Approval, stop, replay dan kontrol memory tidak menambah kuota pesan. Retry dapat
        menggunakan komputasi baru. Task atau chat yang gagal tanpa hasil mengembalikan kuota; hasil
        parsial tetap menghitung penggunaan yang terpakai. Penggunaan yang belum pasti tetap
        diperiksa.
      </p>
    </div>
  );
}
