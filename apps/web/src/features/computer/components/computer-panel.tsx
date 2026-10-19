import { Monitor, RefreshCw, Square } from "lucide-react";
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
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { useComputer } from "@/features/computer/hooks/use-computer";
import type { BackgroundTask } from "@/features/tasks/types";
import { ComputerAction } from "./computer-action";
import { ComputerViewer } from "./computer-viewer";

const controls = {
  agent: "Gwen memegang kendali",
  handoff: "Menyerahkan kendali…",
  human: "Kamu memegang kendali",
  resuming: "Gwen membaca perubahanmu…",
};

export function ComputerPanel({ task }: { task: BackgroundTask }) {
  const [open, setOpen] = useState(false);
  const { state, viewer, pending, error, connect, command, closeViewer } = useComputer(
    task.id,
    open,
  );
  const workspace = state.data?.workspace;
  const owns = workspace?.active_task_id === task.id;
  const ready = owns && workspace?.state === "ready";
  const version = workspace?.control_version;
  const proposal = state.data?.action;
  const canControl = ready && !workspace.unknown_effect;
  function change(destination: "agent" | "human") {
    closeViewer();
    void command(`/computer/tasks/${task.id}/control`, { destination, version });
  }
  return (
    <Sheet open={open} onOpenChange={setOpen} modal={false}>
      <SheetTrigger asChild>
        <Button type="button" variant="outline" size="sm">
          <Monitor /> Lihat komputer
        </Button>
      </SheetTrigger>
      <SheetContent className="overflow-y-auto data-[side=right]:w-full data-[side=right]:sm:max-w-none min-[701px]:data-[side=right]:w-[min(75vw,1000px)]">
        <SheetHeader>
          <SheetTitle>Komputer pribadi</SheetTitle>
          <SheetDescription>
            Login tersimpan dapat dipakai kembali oleh Task berikutnya. Menutup panel hanya menutup
            layar.
          </SheetDescription>
        </SheetHeader>
        <div className="space-y-5 p-4">
          <p className="text-sm font-bold" role="status">
            {owns && workspace
              ? controls[workspace.control]
              : workspace?.active_task_id
                ? "Task lain sedang memakai komputer. Task ini menunggu giliran."
                : "Komputer sedang berhenti atau belum digunakan."}
          </p>
          {workspace?.control === "human" && owns ? (
            <p className="rounded-xl bg-secondary p-4 text-sm">
              Input privat aktif. Gwen tidak mengambil layar atau merekam selama kamu memegang
              kendali. Login sendiri, lalu kembalikan kendali saat halaman siap.
            </p>
          ) : null}
          {workspace?.deadline && owns ? (
            <p className="text-xs text-muted-foreground">
              Sesi berakhir paling lambat {new Date(workspace.deadline).toLocaleTimeString("id-ID")}
              . Profil login tetap disimpan sesuai retensi.
            </p>
          ) : null}
          <div className="flex flex-wrap gap-2">
            {ready && ["agent", "human"].includes(workspace.control) ? (
              <Button
                type="button"
                variant="outline"
                disabled={pending}
                onClick={() => (viewer ? closeViewer() : void connect())}
              >
                <RefreshCw />
                {viewer ? "Tutup layar" : "Sambungkan layar"}
              </Button>
            ) : null}
            {canControl ? (
              <>
                <Button
                  type="button"
                  disabled={pending || workspace.control !== "agent"}
                  onClick={() => change("human")}
                >
                  Ambil alih
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  disabled={pending || (task.status === "running" && workspace.control === "agent")}
                  onClick={() => change("agent")}
                >
                  {workspace.control === "human" ? "Kembalikan ke Gwen" : "Lanjutkan Gwen"}
                </Button>
              </>
            ) : null}
            {["queued", "running", "waiting_user"].includes(task.status) ? (
              <Button
                type="button"
                variant="outline"
                disabled={pending}
                onClick={() => void command(`/tasks/${task.id}/cancel`)}
              >
                <Square />
                Hentikan task
              </Button>
            ) : null}
          </div>
          {viewer ? (
            <ComputerViewer
              key={viewer.url}
              url={viewer.url}
              human={workspace?.control === "human"}
            />
          ) : null}
          {proposal?.state === "proposed" ? (
            <ComputerAction
              proposal={proposal}
              pending={pending}
              decide={(approved) =>
                void command(`/computer/tasks/${task.id}/actions/${proposal.id}`, {
                  approved,
                  version: proposal.control_version,
                })
              }
            />
          ) : null}
          {workspace?.unknown_effect && owns ? (
            <section className="space-y-3 rounded-xl border p-4">
              <p className="text-sm">
                Hasil aksi belum pasti. Periksa situs secara langsung sebelum melanjutkan pekerjaan
                lain. Gwen tidak akan mengulangi aksi ini.
              </p>
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button type="button" variant="outline" disabled={pending}>
                    Saya sudah memeriksa outcome
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>
                      Akhiri Task dengan hasil aksi yang belum pasti?
                    </AlertDialogTitle>
                    <AlertDialogDescription>
                      Pastikan kamu sudah memeriksa situs secara langsung. Task ini akan dihentikan.
                      Gwen tidak akan mengulang aksi sebelumnya.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Batal</AlertDialogCancel>
                    <AlertDialogAction
                      onClick={() =>
                        void command(`/computer/tasks/${task.id}/acknowledge`, { confirmed: true })
                      }
                    >
                      Sudah diperiksa, akhiri Task
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </section>
          ) : null}
          {workspace?.error || error || state.error ? (
            <p role="alert" className="text-sm text-danger">
              {error || workspace?.error || state.error?.message}
            </p>
          ) : null}
          {state.isPending ? (
            <p role="status" className="text-sm">
              Membuka status komputer…
            </p>
          ) : null}
          <p className="text-xs text-muted-foreground">
            Satu Task memakai komputer pada satu waktu. Aksi klik/ketik/tombol memerlukan
            persetujuan. Saat sesi login berakhir atau situs meminta 2FA, Gwen akan meminta
            bantuanmu.
          </p>
          {state.data?.sessions.length ? (
            <p className="text-xs text-muted-foreground">
              Pemakaian dan cadangan komputer Task ini: USD{" "}
              {(
                state.data.sessions.reduce(
                  (total, session) => total + session.charged_microusd,
                  0,
                ) / 1_000_000
              ).toFixed(4)}
              . Termasuk cadangan penyimpanan profil; ini estimasi, bukan tagihan provider.
            </p>
          ) : null}
        </div>
      </SheetContent>
    </Sheet>
  );
}
