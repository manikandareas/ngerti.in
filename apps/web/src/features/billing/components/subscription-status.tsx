import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import type { BillingOrder } from "../types";
import { billingDate, orderStatus } from "../utils/format";

interface Props {
  order: BillingOrder;
  busy: boolean;
  onRefresh: () => void;
  onCancel: () => void;
  onPaymentMethod: () => void;
}

export function SubscriptionStatus({ order, busy, onRefresh, onCancel, onPaymentMethod }: Props) {
  return (
    <article className="space-y-4 rounded-xl border p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="font-medium">{orderStatus[order.status] ?? "Memperbarui status"}</h3>
        <span className="text-xs text-muted-foreground">
          {order.provider === "duitku" ? "Duitku" : "Lemon Squeezy"}
          {order.mode === "test" ? " · Pengujian" : ""}
        </span>
      </div>
      {order.paid_through && (
        <p className="text-sm">
          Periode terakhir yang dibayar sampai{" "}
          <time dateTime={order.paid_through}>
            {billingDate.format(new Date(order.paid_through))}
          </time>
          .
        </p>
      )}
      {order.needs_review && (
        <p className="text-sm text-muted-foreground">
          Status belum dapat dipastikan. Pembayaran akan diperiksa; jangan membayar ulang terlebih
          dahulu.
        </p>
      )}
      {order.status === "past_due" ? (
        <p role="status" className="text-sm text-muted-foreground">
          Perpanjangan belum berhasil. Tidak ada allowance Plus baru sebelum pembayaran
          terverifikasi. Setelah periode berbayar berakhir, akun memakai paket Free. Perbarui metode
          pembayaran untuk memulihkan perpanjangan.
        </p>
      ) : null}
      {order.cancel_requested && order.status !== "cancelled" && (
        <p className="text-sm text-muted-foreground">
          Permintaan pembatalan tersimpan dan sedang dikonfirmasi.
        </p>
      )}
      <div className="flex flex-wrap gap-2">
        {order.payment_url && (
          <Button asChild>
            <a href={order.payment_url}>Lanjutkan pembayaran</a>
          </Button>
        )}
        <Button type="button" variant="outline" disabled={busy} onClick={onRefresh}>
          Periksa status
        </Button>
        {order.can_update_payment_method ? (
          <Button type="button" variant="outline" disabled={busy} onClick={onPaymentMethod}>
            Perbarui metode pembayaran
          </Button>
        ) : null}
        {order.can_cancel && (
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button type="button" variant="ghost" disabled={busy}>
                Batalkan perpanjangan
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Batalkan perpanjangan Plus?</AlertDialogTitle>
                <AlertDialogDescription>
                  Penagihan berikutnya akan dihentikan. Akses tetap mengikuti periode yang sudah
                  dibayar. Hasil dan percakapanmu tetap dapat dibaca.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Kembali</AlertDialogCancel>
                <AlertDialogAction onClick={onCancel}>Batalkan perpanjangan</AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        )}
      </div>
    </article>
  );
}
