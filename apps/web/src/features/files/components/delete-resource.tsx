import { useAuth } from "@clerk/tanstack-react-start";
import { useQueryClient } from "@tanstack/react-query";
import { Trash2 } from "lucide-react";
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
import { api } from "@/lib/api";

export function DeleteResource({
  path,
  name,
  result = false,
}: {
  path: string;
  name: string;
  result?: boolean;
}) {
  const { getToken, userId } = useAuth();
  const client = useQueryClient();
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  async function remove() {
    setPending(true);
    setError("");
    try {
      await api(path, await getToken(), { method: "DELETE" });
      setOpen(false);
      for (const key of [
        "files",
        "results",
        "result",
        "tasks",
        "library",
        "resource-hits",
        "resource-detail",
        "resource-selection",
      ])
        void client.invalidateQueries({ queryKey: [key, userId] });
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Penghapusan gagal.");
    } finally {
      setPending(false);
    }
  }
  return (
    <AlertDialog open={open} onOpenChange={setOpen}>
      <AlertDialogTrigger asChild>
        <Button type="button" variant="ghost" size="sm">
          <Trash2 /> Hapus {result ? "hasil" : "file"}
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Hapus {name}?</AlertDialogTitle>
          <AlertDialogDescription>
            {result
              ? "Semua versi hasil ini tidak dapat dibuka lagi. Task yang masih berjalan akan dihentikan."
              : "Semua revision file dan ekstraksinya akan dihapus. Task yang masih memakai input ini dihentikan. Hasil turunan yang sudah selesai tetap tersedia sampai kamu menghapusnya."}
          </AlertDialogDescription>
        </AlertDialogHeader>
        {error ? (
          <p role="alert" className="text-sm text-danger">
            {error}
          </p>
        ) : null}
        <AlertDialogFooter>
          <AlertDialogCancel disabled={pending}>Batal</AlertDialogCancel>
          <AlertDialogAction
            disabled={pending}
            onClick={(event) => {
              event.preventDefault();
              void remove();
            }}
          >
            {pending ? "Menghapus…" : "Hapus"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
