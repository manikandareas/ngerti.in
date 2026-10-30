import { useAuth } from "@clerk/tanstack-react-start";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { NativeSelect } from "@/components/ui/native-select";
import { command, submit } from "@/features/direct-messages/client";

export function PersonalityPresets({ onSelect }: { onSelect: (soul: string) => void }) {
  const { getToken } = useAuth();
  const [items, setItems] = useState<{ id: string; soul: string }[]>([]);
  const [selected, setSelected] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function load() {
    setBusy(true);
    setError("");
    try {
      setItems(
        (
          await submit<{ items: { id: string; soul: string }[] }>(
            command("agent.presets", {}),
            await getToken(),
          )
        ).items,
      );
    } catch {
      setError("Contoh karakter belum dapat dimuat. Karakter tetap bisa ditulis sendiri.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <details className="space-y-3">
      <summary className="cursor-pointer text-sm text-muted-foreground">
        Mulai dari contoh karakter
      </summary>
      {items.length === 0 ? (
        <Button variant="outline" type="button" disabled={busy} onClick={() => void load()}>
          {busy ? "Memuat…" : "Lihat contoh karakter"}
        </Button>
      ) : (
        <div className="space-y-3">
          <label className="block space-y-2 text-sm">
            Contoh karakter
            <NativeSelect
              aria-label="Contoh karakter"
              className="min-h-11 w-full rounded-md border bg-background px-3"
              value={selected}
              onChange={(e) => setSelected(e.target.value)}
            >
              <option value="">Pilih karakter</option>
              {items.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.id}
                </option>
              ))}
            </NativeSelect>
          </label>
          <p className="text-xs text-muted-foreground">
            Menerapkan contoh mengganti isi karakter di editor. Perubahan berlaku setelah disimpan.
          </p>
          <Button
            type="button"
            variant="outline"
            disabled={!selected}
            onClick={() => {
              const preset = items.find((p) => p.id === selected);
              if (preset) onSelect(preset.soul);
            }}
          >
            Terapkan contoh
          </Button>
        </div>
      )}
      {error && (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      )}
    </details>
  );
}
