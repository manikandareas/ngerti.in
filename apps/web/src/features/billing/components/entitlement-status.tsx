import type { BillingSummary } from "../types";
import { billingDate } from "../utils/format";

export function EntitlementStatus({ value }: { value: BillingSummary["entitlement"] }) {
  return (
    <div className="space-y-3 rounded-xl bg-muted p-4 text-sm">
      <p className="font-medium">Paket aktif: {value.plan === "plus" ? "Plus" : "Free"}</p>
      <p>
        {value.plus_ends_at ? "Akses Plus dibayar sampai " : "Allowance Free tersedia kembali "}
        <time dateTime={value.plus_ends_at ?? value.reset_at}>
          {billingDate.format(new Date(value.plus_ends_at ?? value.reset_at))}
        </time>
        . Waktu mengikuti perangkatmu.
      </p>
      {value.plus_ends_at ? (
        <p>
          Allowance Plus periode berikutnya tersedia setelah pembayaran terverifikasi. Jika tidak
          diperpanjang, paket kembali ke Free: 100 pesan dan 1.000 kredit per 30 hari.
        </p>
      ) : null}
      <p>
        {value.accepted_tasks} Task yang sudah diterima memakai kebijakan dan budget asal.{" "}
        {value.active_schedules} Jadwal aktif memeriksa allowance setiap kali berjalan. Jika tidak
        cukup, eksekusi terblokir dengan alasan yang dapat kamu lihat di Jadwal.
      </p>
      <p>
        Saat saldo habis, kamu tetap bisa menghentikan Task, merespons approval, membaca dan
        mengunduh hasil, mengelola memory, serta menjeda Jadwal. Kelanjutan komputasi tetap
        mengikuti budget pekerjaan.
      </p>
    </div>
  );
}
