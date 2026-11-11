import { useEffect, useRef, useState } from "react";
import { Alert, AlertDescription } from "@/components/ui/alert";
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
import { PreferenceToggle } from "@/features/settings/components/preference-sections";
import { SettingsRow, SettingsSection } from "@/features/settings/components/shared";
import { exportConversation } from "@/features/settings/lib/export-conversation";
import { useSettingsWorkspace } from "@/hooks/settings-workspace";
import { usePreferences } from "@/hooks/use-preferences";

export function DataSettings() {
  const { snapshot } = useSettingsWorkspace();
  const { reset } = usePreferences();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const operation = useRef<AbortController | null>(null);
  useEffect(() => () => operation.current?.abort(), []);
  async function download() {
    if (!snapshot || operation.current) return;
    const abort = new AbortController();
    operation.current = abort;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const data = await exportConversation(snapshot, abort.signal);
      const url = URL.createObjectURL(
        new Blob([JSON.stringify(data, null, 2)], { type: "application/json" }),
      );
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `ngertiin-conversation-${snapshot.thread.id}.json`;
      anchor.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      setNotice("Ekspor percakapan siap diunduh.");
    } catch (failure) {
      if (!abort.signal.aborted)
        setError(failure instanceof Error ? failure.message : "Ekspor belum berhasil.");
    } finally {
      operation.current = null;
      if (!abort.signal.aborted) setBusy(false);
    }
  }
  return (
    <>
      <SettingsSection title="Penyimpanan di perangkat ini">
        <PreferenceToggle
          setting="persistDrafts"
          title="Simpan draft setelah aplikasi ditutup"
          description="Jika dimatikan, draft teks hanya bertahan selama sesi ini. Riwayat percakapan tetap tersimpan."
        />
      </SettingsSection>
      <SettingsSection title="Ekspor percakapan">
        <SettingsRow
          title={snapshot?.thread.name ?? snapshot?.agents[0]?.name ?? "Percakapan terbuka"}
          description="Unduh riwayat pesan sebagai JSON. File lampiran tidak disertakan."
        >
          <Button variant="outline" disabled={!snapshot || busy} onClick={() => void download()}>
            {busy ? "Menyiapkan ekspor…" : "Ekspor percakapan"}
          </Button>
        </SettingsRow>
      </SettingsSection>
      <SettingsSection title="Preferensi aplikasi">
        <SettingsRow
          title="Kembalikan preferensi awal"
          description="Atur ulang tampilan dan perilaku antarmuka pada perangkat ini."
        >
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant="outline">Atur ulang preferensi</Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Atur ulang preferensi?</AlertDialogTitle>
                <AlertDialogDescription>
                  Tampilan, percakapan awal, pintasan kirim, animasi, dan penyimpanan draft kembali
                  ke pilihan awal. Tema, akun, model, dan riwayat tetap tersimpan.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Batal</AlertDialogCancel>
                <AlertDialogAction
                  onClick={() => {
                    reset();
                    setNotice("Preferensi dikembalikan ke pilihan awal.");
                  }}
                >
                  Atur ulang
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </SettingsRow>
      </SettingsSection>
      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
      {notice && (
        <p role="status" className="text-sm text-muted-foreground">
          {notice}
        </p>
      )}
    </>
  );
}
