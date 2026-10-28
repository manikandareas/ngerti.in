import { NativeChoice } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";

export type ModelOption = {
  id: string;
  label: string;
  protocol?: string;
  provider_id?: string;
};
export type InferenceSettings = {
  version?: 1;
  parameters?: Record<string, number | string | Record<string, number | string>>;
  fallback_models?: string[];
  auxiliary?: Record<string, { model: string; fallback_models?: string[] }>;
  credential_pool?: { models: string[]; strategy: string };
  provider_routing?: { sort?: string };
  moa?: { references: string[]; fanout?: string; reference_timeout?: number };
};

const selectClass = "h-10 w-full rounded-md border bg-background px-3";

function ModelChoices({
  label,
  selected,
  models,
  onChange,
}: {
  label: string;
  selected: string[];
  models: ModelOption[];
  onChange: (value: string[]) => void;
}) {
  const options = [
    ...models,
    ...selected
      .filter((id) => !models.some((model) => model.id === id))
      .map((id) => ({ id, label: `${id} (tidak tersedia)` })),
  ];
  return (
    <fieldset className="space-y-2">
      <legend className="mb-2 text-sm font-medium">{label}</legend>
      <p className="text-xs text-muted-foreground">Urutan mengikuti pilihan Anda.</p>
      {options.map((model) => (
        <label key={model.id} className="flex items-start gap-2 text-sm">
          <NativeChoice
            type="checkbox"
            className="mt-1"
            checked={selected.includes(model.id)}
            onChange={(event) =>
              onChange(
                event.target.checked
                  ? [...selected, model.id]
                  : selected.filter((id) => id !== model.id),
              )
            }
          />
          <span className="min-w-0 break-words">
            {selected.includes(model.id) ? `${selected.indexOf(model.id) + 1}. ` : ""}
            {model.label}
          </span>
        </label>
      ))}
    </fieldset>
  );
}

export function InferenceSettingsEditor({
  value,
  models,
  primary,
  onChange,
}: {
  value?: InferenceSettings;
  models: ModelOption[];
  primary: string;
  onChange: (value: InferenceSettings) => void;
}) {
  const settings = value ?? {};
  const selected = models.find((model) => model.id === primary);
  const parameters = settings.parameters ?? {};
  const sampling = selected?.provider_id !== "chatgpt";
  const update = (patch: Partial<InferenceSettings>) =>
    onChange({ ...settings, version: 1, ...patch });
  function parameter(key: string, raw: string) {
    const next = { ...parameters };
    if (raw === "") delete next[key];
    else next[key] = Number(raw);
    update({ parameters: next });
  }
  return (
    <details className="space-y-4 rounded-md border p-4">
      <summary className="cursor-pointer text-sm font-medium">Pengaturan model lanjutan</summary>
      <p className="text-sm text-muted-foreground">
        Berlaku untuk pekerjaan berikutnya. Setiap model menggunakan akun dan biaya pada koneksinya.
      </p>
      <div className="grid gap-3 sm:grid-cols-2">
        {sampling && (
          <label htmlFor="agent-temperature" className="space-y-2 text-sm">
            Temperature
            <Input
              id="agent-temperature"
              type="number"
              min={0}
              max={2}
              step="any"
              placeholder="Default provider"
              value={(parameters.temperature as number | undefined) ?? ""}
              onChange={(event) => parameter("temperature", event.target.value)}
            />
          </label>
        )}
        <label htmlFor="agent-output-tokens" className="space-y-2 text-sm">
          Batas token jawaban
          <Input
            id="agent-output-tokens"
            type="number"
            min={1}
            step={1}
            placeholder="Default provider"
            value={
              (parameters[
                selected?.protocol === "codex_responses" ? "max_output_tokens" : "max_tokens"
              ] as number | undefined) ?? ""
            }
            onChange={(event) =>
              parameter(
                selected?.protocol === "codex_responses" ? "max_output_tokens" : "max_tokens",
                event.target.value,
              )
            }
          />
        </label>
      </div>
      {selected?.protocol !== "anthropic_messages" && (
        <label className="block space-y-2 text-sm">
          Penalaran
          <NativeSelect
            className={selectClass}
            value={
              (parameters.reasoning_effort as string | undefined) ??
              (parameters.reasoning as { effort?: string } | undefined)?.effort ??
              ""
            }
            onChange={(event) => {
              const next = { ...parameters };
              delete next.reasoning;
              delete next.reasoning_effort;
              if (event.target.value) {
                if (selected?.protocol === "codex_responses")
                  next.reasoning = { effort: event.target.value };
                else next.reasoning_effort = event.target.value;
              }
              update({ parameters: next });
            }}
          >
            <option value="">Default provider</option>
            {["none", "minimal", "low", "medium", "high", "xhigh"].map((effort) => (
              <option key={effort} value={effort}>
                {effort}
              </option>
            ))}
          </NativeSelect>
        </label>
      )}
      <ModelChoices
        label="Model cadangan"
        selected={settings.fallback_models ?? []}
        models={models.filter((model) => model.id !== primary)}
        onChange={(fallback_models) => update({ fallback_models })}
      />
      <fieldset className="space-y-3">
        <legend className="mb-2 text-sm font-medium">Model pendukung</legend>
        {[
          ["compression", "Ringkasan konteks"],
          ["vision", "Pemahaman gambar"],
          ["review", "Review"],
        ].map(([slot, label]) => (
          <label key={slot} className="block space-y-2 text-sm">
            {label}
            <NativeSelect
              className={selectClass}
              value={settings.auxiliary?.[slot]?.model ?? ""}
              onChange={(event) => {
                const auxiliary = { ...settings.auxiliary };
                if (event.target.value)
                  auxiliary[slot] = { ...auxiliary[slot], model: event.target.value };
                else delete auxiliary[slot];
                update({ auxiliary });
              }}
            >
              <option value="">Ikuti model utama</option>
              {settings.auxiliary?.[slot]?.model &&
                !models.some((model) => model.id === settings.auxiliary?.[slot]?.model) && (
                  <option value={settings.auxiliary[slot].model}>
                    {settings.auxiliary[slot].model} (tidak tersedia)
                  </option>
                )}
              {models.map((model) => (
                <option key={model.id} value={model.id}>
                  {model.label}
                </option>
              ))}
            </NativeSelect>
          </label>
        ))}
      </fieldset>
      {selected?.provider_id === "openrouter" && (
        <label className="block space-y-2 text-sm">
          Prioritas provider OpenRouter
          <NativeSelect
            className={selectClass}
            value={settings.provider_routing?.sort ?? ""}
            onChange={(event) =>
              update({
                provider_routing: {
                  ...settings.provider_routing,
                  sort: event.target.value || undefined,
                },
              })
            }
          >
            <option value="">Default OpenRouter</option>
            <option value="price">Biaya</option>
            <option value="latency">Latensi</option>
            <option value="throughput">Kecepatan token</option>
          </NativeSelect>
        </label>
      )}
      <ModelChoices
        label="Referensi Mixture of Agents"
        selected={settings.moa?.references ?? []}
        models={models}
        onChange={(references) =>
          update({ moa: references.length ? { ...settings.moa, references } : undefined })
        }
      />
      <p className="text-xs text-muted-foreground">
        Model referensi memberi masukan. Model utama menjalankan tools dan mengirim jawaban sebagai
        agent ini; semua model yang dipakai dapat menimbulkan biaya.
      </p>
      <details className="space-y-3">
        <summary className="cursor-pointer text-sm font-medium">Rotasi koneksi</summary>
        <p className="text-xs text-muted-foreground">
          Pilih koneksi lain untuk model dan endpoint yang sama. Pilihan yang tidak kompatibel akan
          dijelaskan saat disimpan.
        </p>
        <ModelChoices
          label="Anggota pool"
          selected={settings.credential_pool?.models ?? []}
          models={models.filter((model) => model.id !== primary)}
          onChange={(members) =>
            update({
              credential_pool: members.length
                ? { models: members, strategy: settings.credential_pool?.strategy ?? "fill_first" }
                : undefined,
            })
          }
        />
        {settings.credential_pool && (
          <label className="block space-y-2 text-sm">
            Pemilihan koneksi
            <NativeSelect
              className={selectClass}
              value={settings.credential_pool.strategy}
              onChange={(event) =>
                update({
                  credential_pool: {
                    models: settings.credential_pool?.models ?? [],
                    strategy: event.target.value,
                  },
                })
              }
            >
              <option value="fill_first">Utamakan koneksi pertama</option>
              <option value="round_robin">Bergiliran</option>
              <option value="random">Acak</option>
            </NativeSelect>
          </label>
        )}
      </details>
    </details>
  );
}
