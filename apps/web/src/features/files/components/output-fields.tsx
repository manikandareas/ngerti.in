import { Plus, X } from "lucide-react";
import { useRef } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { OutputSpec } from "../types";

export function OutputFields({
  value,
  onChange,
  disabled = false,
}: {
  value: OutputSpec[];
  onChange: (value: OutputSpec[]) => void;
  disabled?: boolean;
}) {
  const keys = useRef(new WeakMap<OutputSpec, string>());
  function key(item: OutputSpec) {
    const saved = keys.current.get(item) ?? crypto.randomUUID();
    keys.current.set(item, saved);
    return saved;
  }
  function replace(item: OutputSpec, next: OutputSpec) {
    keys.current.set(next, key(item));
    onChange(value.map((v) => (v === item ? next : v)));
  }
  return (
    <fieldset className="space-y-2 rounded-xl border p-3" disabled={disabled}>
      <legend className="px-1 text-xs text-muted-foreground">Berkas hasil</legend>
      {value.map((item, index) => (
        <div key={key(item)} className="flex min-w-0 items-center gap-2">
          <Input
            aria-label={`Nama hasil ${index + 1}`}
            value={item.filename}
            maxLength={180}
            onChange={(event) => replace(item, { ...item, filename: event.target.value })}
          />
          <select
            aria-label={`Format hasil ${index + 1}`}
            value={item.format}
            className="h-10 rounded-md border bg-card px-2 text-sm"
            onChange={(event) => {
              const format = event.target.value as OutputSpec["format"];
              replace(item, {
                format,
                filename: `${item.filename.replace(/\.[^.]+$/, "")}.${format}`,
              });
            }}
          >
            {["md", "txt", "csv", "json", "html"].map((format) => (
              <option key={format} value={format}>
                {format.toUpperCase()}
              </option>
            ))}
          </select>
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            aria-label={`Hapus format hasil ${index + 1}`}
            onClick={() => onChange(value.filter((_, n) => n !== index))}
          >
            <X />
          </Button>
        </div>
      ))}
      <Button
        type="button"
        variant="ghost"
        size="sm"
        disabled={value.length >= 10}
        onClick={() =>
          onChange([...value, { filename: `hasil-${value.length + 1}.md`, format: "md" }])
        }
      >
        <Plus /> Tambah berkas hasil
      </Button>
    </fieldset>
  );
}
