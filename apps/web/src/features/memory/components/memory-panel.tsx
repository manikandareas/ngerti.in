import { useState } from "react";
import { Button } from "@/components/ui/button";
import { useMemory, useMemoryCommands } from "@/features/memory/hooks/use-memory";
import { MemoryEntry } from "./memory-entry";

export function MemoryPanel() {
  const query = useMemory();
  const command = useMemoryCommands();
  const [message, setMessage] = useState("");
  const first = query.data?.pages[0];
  const entries = query.data?.pages.flatMap((page) => page.entries) ?? [];
  const settings = first?.settings;

  async function toggle() {
    if (!settings) return;
    const result = await command.send("/settings", {
      expected_revision: settings.revision,
      capture_enabled: !settings.capture_enabled,
    });
    if (result)
      setMessage(
        settings.capture_enabled
          ? "Capture dimatikan. Ingatan yang ada tetap dapat kamu kelola."
          : "Capture diaktifkan untuk percakapan berikutnya.",
      );
  }

  return (
    <section className="space-y-5" aria-label="Ingatan tentangmu">
      <div>
        <h3 className="text-xl font-bold">Ingatan tentangmu</h3>
        <p className="mt-2 text-sm text-muted-foreground">
          Informasi yang membantu asisten memahami konteksmu lintas percakapan. Kamu dapat memeriksa
          sumber, mengoreksi, atau melupakannya kapan saja.
        </p>
      </div>
      {settings ? (
        <div className="flex items-start justify-between gap-4 rounded-lg border p-4">
          <div>
            <p className="text-sm font-bold">Ingat dari percakapan</p>
            <p className="mt-1 text-xs text-muted-foreground">
              {settings.capture_enabled
                ? "Informasi personal yang relevan dapat diingat setelah diperiksa."
                : "Tidak ada ingatan baru yang ditangkap. Ingatan sebelumnya tetap tersedia."}
            </p>
          </div>
          <Button
            variant={settings.capture_enabled ? "default" : "outline"}
            role="switch"
            aria-label="Ingat dari percakapan"
            aria-checked={settings.capture_enabled}
            disabled={command.pending}
            onClick={() => void toggle()}
          >
            {settings.capture_enabled ? "Aktif" : "Nonaktif"}
          </Button>
        </div>
      ) : null}
      {message ? (
        <p role="status" className="text-sm text-muted-foreground">
          {message}
        </p>
      ) : null}
      {command.error ? (
        <p role="alert" className="text-sm text-destructive">
          {command.error}
        </p>
      ) : null}
      {query.isPending ? <p role="status">Memuat ingatan…</p> : null}
      {query.isError ? (
        <div role="alert" className="space-y-2">
          <p>Ingatan belum dapat diperbarui. Periksa koneksi, lalu coba lagi.</p>
          <Button variant="outline" onClick={() => void query.refetch()}>
            Coba lagi
          </Button>
        </div>
      ) : null}
      {first?.capture_pending ? (
        <p role="status" className="text-sm text-muted-foreground">
          Ada informasi yang sedang diperiksa sebelum menjadi ingatan.
        </p>
      ) : null}
      {first?.cleanup_pending ? (
        <p role="status" className="text-xs text-muted-foreground">
          Ingatan yang dilupakan sudah tidak digunakan. Pembersihan salinan pencarian sedang
          diselesaikan.
        </p>
      ) : null}
      {first && entries.length === 0 ? (
        <div className="rounded-lg border border-dashed px-4 py-7">
          <p className="font-medium">Belum ada ingatan</p>
          <p className="mt-2 text-sm text-muted-foreground">
            Ceritakan informasi personal yang ingin kamu ingatkan, atau katakan “ingat bahwa…” di
            percakapan. Informasi yang tersimpan akan muncul di sini beserta sumbernya.
          </p>
        </div>
      ) : null}
      <div className="divide-y border-y">
        {entries.map((entry) => (
          <MemoryEntry key={entry.id} entry={entry} onMessage={setMessage} />
        ))}
      </div>
      {query.hasNextPage ? (
        <Button
          variant="outline"
          disabled={query.isFetchingNextPage}
          onClick={() => void query.fetchNextPage()}
        >
          {query.isFetchingNextPage ? "Memuat…" : "Muat ingatan lainnya"}
        </Button>
      ) : null}
    </section>
  );
}
