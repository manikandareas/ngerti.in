import { useState } from "react";
import { Button } from "@/components/ui/button";
import { usePersonaCommands, usePersonaHistory } from "@/features/persona/hooks/use-persona";
import type { PersonaProfile, PersonaRevision } from "@/features/persona/types";
import { PersonaChanges } from "./persona-changes";

export function PersonaHistory({ profile }: { profile: PersonaProfile }) {
  const history = usePersonaHistory();
  const command = usePersonaCommands();
  const [selected, setSelected] = useState<{ row: PersonaRevision; base: number } | null>(null);
  const [message, setMessage] = useState("");
  async function restore() {
    if (!selected) return;
    const result = await command.send("/restore", {
      revision: selected.row.revision,
      expected_revision: selected.base,
    });
    if (result) {
      setSelected(null);
      setMessage("Versi pilihan dipulihkan sebagai versi baru. Riwayat sebelumnya tetap tersedia.");
    }
  }
  return (
    <section className="space-y-5" aria-label="Riwayat profil dan karakter">
      <div>
        <h3 className="text-xl font-bold">Riwayat perubahan</h3>
        <p className="mt-1 text-sm text-muted-foreground">
          Lihat kembali dan pulihkan karakter yang kamu inginkan.
        </p>
      </div>
      {history.isPending ? <p role="status">Memuat riwayat…</p> : null}
      {history.isError ? (
        <div role="alert">
          <p>Riwayat belum dapat dimuat.</p>
          <Button variant="outline" onClick={() => void history.refetch()}>
            Coba lagi
          </Button>
        </div>
      ) : null}
      <div className="divide-y border-y">
        {history.data?.pages
          .flatMap((page) => page.revisions)
          .map((row) => (
            <div key={row.revision} className="space-y-3 py-4 text-sm">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="font-bold">
                    Versi {row.revision}
                    {row.revision === profile.revision ? " · Aktif" : ""}
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {new Date(row.created_at).toLocaleString("id-ID")} ·{" "}
                    {row.source === "chat"
                      ? "Melalui chat"
                      : row.source === "restore"
                        ? `Pemulihan versi ${row.restored_from}`
                        : row.source === "editor"
                          ? "Edit langsung"
                          : "Profil awal"}
                  </p>
                </div>
                {row.revision !== profile.revision ? (
                  <Button
                    size="sm"
                    className="min-h-11"
                    variant="outline"
                    onClick={() => {
                      setSelected({ row, base: profile.revision });
                      setMessage("");
                    }}
                  >
                    Tinjau pemulihan
                  </Button>
                ) : null}
              </div>
              <details>
                <summary className="cursor-pointer">Lihat isi versi</summary>
                <div className="mt-3 space-y-2 whitespace-pre-wrap wrap-anywhere">
                  <p className="font-medium">
                    {row.content.name} · {row.content.tagline}
                  </p>
                  <p>{row.content.soul}</p>
                </div>
              </details>
            </div>
          ))}
      </div>
      {history.hasNextPage ? (
        <Button
          variant="outline"
          disabled={history.isFetchingNextPage}
          onClick={() => void history.fetchNextPage()}
        >
          Lihat versi sebelumnya
        </Button>
      ) : null}
      {selected ? (
        <div className="space-y-4 rounded-xl border p-4">
          <h4 className="font-bold">Pulihkan versi {selected.row.revision}?</h4>
          <PersonaChanges before={profile} after={selected.row.content} />
          <div className="flex flex-wrap gap-2">
            <Button
              disabled={command.pending || selected.base !== profile.revision}
              onClick={() => void restore()}
            >
              Pulihkan sebagai versi baru
            </Button>
            <Button variant="ghost" disabled={command.pending} onClick={() => setSelected(null)}>
              Batalkan
            </Button>
          </div>
          {selected.base !== profile.revision ? (
            <p role="alert" className="text-sm text-danger">
              Profil berubah. Tutup tinjauan ini lalu tinjau pemulihan kembali.
            </p>
          ) : null}
        </div>
      ) : null}
      {message ? (
        <p role="status" className="text-sm text-foreground">
          {message}
        </p>
      ) : null}
      {command.error ? (
        <p role="alert" className="text-sm text-danger">
          {command.error}
        </p>
      ) : null}
    </section>
  );
}
