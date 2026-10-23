import { useAuth } from "@clerk/tanstack-react-start";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
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
import type { ComputerState } from "@/features/computer/types";
import { api } from "@/lib/api";
import { cn } from "@/lib/utils";

export function BrowserSettings({ className }: { className?: string } = {}) {
  const { getToken, userId } = useAuth();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const state = useQuery({
    queryKey: ["browser-workspace", userId],
    queryFn: async () =>
      api<Pick<ComputerState, "workspace">>("/computer/workspace", await getToken()),
    enabled: !!userId,
  });
  const workspace = state.data?.workspace;
  async function reset() {
    if (!workspace || pending) return;
    setPending(true);
    setError("");
    try {
      await api(`/computer/workspaces/${workspace.id}/reset`, await getToken(), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ confirmed: true }),
      });
      void state.refetch();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Reset belum selesai.");
    } finally {
      setPending(false);
    }
  }
  return (
    <section className={cn("space-y-3 py-6", className)}>
      <h2>Browser pribadi</h2>
      <p className="text-sm text-muted-foreground">
        Login digunakan kembali lintas Task. Komputasi berhenti setelah pekerjaan; profil disimpan
        maksimal 7 hari sejak penggunaan terakhir.
      </p>
      <p className="text-sm text-muted-foreground">
        Gwen membuka situs dan mencari informasi secara otomatis. Pengiriman, perubahan data,
        transaksi, dan tindakan keamanan meminta persetujuan. Password dan OTP diisi sendiri melalui
        ambil alih privat.
      </p>
      {workspace ? (
        <>
          <p className="text-xs text-muted-foreground">
            Retensi profil sampai{" "}
            {new Date(workspace.retain_until).toLocaleString("id-ID", { timeZoneName: "short" })}.
            File hasil dikelola terpisah.
          </p>
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button
                type="button"
                variant="outline"
                className="h-auto whitespace-normal text-left"
                disabled={pending}
              >
                Reset browser dan hapus login tersimpan
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Hapus profil browser?</AlertDialogTitle>
                <AlertDialogDescription>
                  Task yang memakai komputer akan dihentikan. Seluruh login dan data profil browser
                  dihapus. File hasil tetap tersedia.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Batal</AlertDialogCancel>
                <AlertDialogAction onClick={() => void reset()}>Hapus profil</AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </>
      ) : state.isPending ? (
        <p role="status" className="text-sm text-muted-foreground">
          Memuat profil browser…
        </p>
      ) : state.isError ? (
        <Button variant="outline" onClick={() => void state.refetch()}>
          Coba lagi
        </Button>
      ) : (
        <p className="text-xs text-muted-foreground">
          Belum ada profil tersimpan. Profil dibuat saat Task browser pertama.
        </p>
      )}
      {error || state.error ? (
        <p role="alert" className="text-sm text-danger">
          {error || state.error?.message}
        </p>
      ) : null}
    </section>
  );
}
