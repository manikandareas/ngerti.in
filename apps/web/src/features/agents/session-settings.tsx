import { NativeChoice } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";

export type SessionSettings = {
  max_turns?: number | null;
  context_engine?: string;
  compression?: {
    enabled?: boolean;
    threshold?: number;
    threshold_tokens?: number;
    micro_compact?: boolean;
    micro_compact_every_n_turns?: number;
    micro_compact_defrag_threshold_tokens?: number;
  };
};
export function SessionSettingsEditor({
  value,
  onChange,
}: {
  value?: SessionSettings;
  onChange: (value: SessionSettings) => void;
}) {
  return (
    <details className="space-y-3 border-t pt-3">
      <summary className="cursor-pointer text-sm font-medium">
        Batas penggunaan dan peringkasan
      </summary>
      <p className="text-sm text-muted-foreground">
        Pengaturan berlaku untuk pekerjaan berikutnya. Pekerjaan yang sedang berjalan mempertahankan
        konfigurasinya.
      </p>
      <label className="block space-y-2 text-sm">
        Maksimum putaran per pekerjaan
        <Input
          type="number"
          min="0"
          step="1"
          placeholder="Bawaan runtime"
          value={value?.max_turns ?? ""}
          onChange={(e) =>
            onChange({ ...value, max_turns: e.target.value === "" ? null : Number(e.target.value) })
          }
        />
      </label>
      <label className="flex items-center gap-2 text-sm">
        <NativeChoice
          type="checkbox"
          checked={value?.compression?.enabled !== false}
          onChange={(e) =>
            onChange({
              ...value,
              compression: { ...value?.compression, enabled: e.target.checked },
            })
          }
        />
        Ringkas konteks secara otomatis
      </label>
    </details>
  );
}
