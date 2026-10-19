export const billingDate = new Intl.DateTimeFormat("id-ID", {
  dateStyle: "medium",
  timeStyle: "short",
});

export function money(
  amount: number,
  currency: "IDR" | "USD",
  divisor = currency === "USD" ? 100 : 1,
) {
  return new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency,
    maximumFractionDigits: divisor === 100 ? 2 : 0,
  }).format(amount / divisor);
}

export const orderStatus: Record<string, string> = {
  creating: "Menyiapkan checkout",
  pending: "Menunggu pembayaran",
  unknown: "Pembayaran sedang diperiksa",
  active: "Langganan aktif",
  past_due: "Pembayaran perlu diperbarui",
  cancel_pending: "Menunggu konfirmasi pembatalan",
  cancelled: "Perpanjangan dibatalkan",
  expired: "Langganan berakhir",
  failed: "Pembayaran gagal",
  review: "Perlu pemeriksaan pembayaran",
};
