import { useEffect, useId, useRef, useState } from "react";

export type PiConfigurationSelection = {
  providerId: string;
  configuration: Record<string, unknown>;
};

/** Discover native provider data without registering providers in the application. */
export function PiConfigurationInput({
  disabled,
  onChange,
}: {
  disabled?: boolean;
  onChange: (selection: PiConfigurationSelection | null) => void;
}) {
  const [error, setError] = useState("");
  const [providers, setProviders] = useState<PiConfigurationSelection[]>([]);
  const [selected, setSelected] = useState("");
  const providerInput = useId();
  const generation = useRef(0);
  useEffect(
    () => () => {
      generation.current++;
    },
    [],
  );
  function select(providerId: string, choices = providers) {
    setSelected(providerId);
    onChange(choices.find((choice) => choice.providerId === providerId) ?? null);
  }
  return (
    <div className="space-y-2 text-sm">
      <label className="flex flex-col gap-2">
        Pi configuration
        <input
          type="file"
          accept=".json,application/json"
          disabled={disabled}
          onChange={async (event) => {
            const file = event.currentTarget.files?.[0];
            const attempt = ++generation.current;
            onChange(null);
            setSelected("");
            setProviders([]);
            setError("");
            if (!file) return;
            try {
              if (file.size > 262144) throw new Error("Unsupported configuration.");
              const data = JSON.parse(await file.text());
              if (generation.current !== attempt) return;
              const choices = Object.entries(data.providers ?? {}).flatMap(
                ([providerId, value]) => {
                  if (!value || typeof value !== "object" || Array.isArray(value)) return [];
                  const configuration = value as Record<string, unknown>;
                  if (
                    !/^[a-z0-9][a-z0-9._-]{0,99}$/.test(providerId) ||
                    typeof configuration.apiKey !== "string" ||
                    !configuration.apiKey ||
                    /^[!$]|[\r\n\0]/.test(configuration.apiKey)
                  )
                    return [];
                  return [{ providerId, configuration }];
                },
              );
              if (!choices.length) throw new Error("Unsupported configuration.");
              setProviders(choices);
              if (choices.length === 1) select(choices[0].providerId, choices);
            } catch {
              if (generation.current === attempt)
                setError(
                  "Choose a Pi models configuration with a configured provider. Credential commands and environment references are not imported.",
                );
            }
          }}
        />
      </label>
      {providers.length > 0 && (
        <div className="flex flex-col gap-2">
          <label htmlFor={providerInput}>Model provider</label>
          <select
            id={providerInput}
            className="settings-select"
            value={selected}
            disabled={disabled}
            required
            onChange={(event) => select(event.target.value)}
          >
            <option value="">Choose a configured provider</option>
            {providers.map(({ providerId }) => (
              <option key={providerId} value={providerId}>
                {providerId}
              </option>
            ))}
          </select>
        </div>
      )}
      <p className="text-xs text-muted-foreground">
        Use your existing Pi setup. Only the selected provider configuration is imported; your
        global settings remain unchanged.
      </p>
      {error && (
        <p role="alert" className="text-xs text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}
