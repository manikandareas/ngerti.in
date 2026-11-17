import {
  AlertCircleIcon,
  Key01Icon,
  Loading03Icon,
  ViewIcon,
  ViewOffIcon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { type ProviderId, providers } from "@/features/settings/components/shared";
import { ApiError, request } from "@/lib/api-client";
import {
  harnesses,
  modelProviderName,
  providerConnectionMethod,
  providersForHarness,
} from "@/lib/harnesses";
import type { Connection } from "@/types/workspace";
import { PiConfigurationInput } from "./pi-configuration-input";

// OpenMausBot keys/key-save.ts cleanKey and KeyRow inline paste/save interaction.
function cleanKey(text: string) {
  const trimmed = text.replace(/[\u200B-\u200D\uFEFF]/g, "").trim();
  const quoted = /^(["'`])(.*)\1$/s.exec(trimmed);
  return (quoted ? quoted[2] : trimmed).trim();
}

export function ApiKeyEntry({
  provider,
  close,
  saved,
}: {
  provider: ProviderId;
  close: () => void;
  saved: (connection: Connection) => Promise<void>;
}) {
  const [key, setKey] = useState("");
  const [visible, setVisible] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [uncertain, setUncertain] = useState(false);
  const [modelProvider, setModelProvider] = useState(harnesses[provider].providerId ?? "");
  const [nativeConfiguration, setNativeConfiguration] = useState<Record<string, unknown> | null>(
    null,
  );
  const source = providerConnectionMethod(provider, modelProvider);
  const operation = useRef(crypto.randomUUID());
  const lock = useRef(false);
  const input = useRef<HTMLInputElement>(null);
  const company = modelProviderName(modelProvider || null);
  const name = providers.find((item) => item.id === provider)?.name;
  useEffect(() => {
    input.current?.focus();
  }, []);
  async function save(raw = key) {
    const value = cleanKey(raw);
    if (
      lock.current ||
      !modelProvider ||
      (source === "api_key" && !value) ||
      (source === "harness_config" && !nativeConfiguration)
    )
      return;
    lock.current = true;
    setBusy(true);
    setError("");
    try {
      // Write-only secrets remain in memory; every reconciliation reuses the operation.
      const result = await request<Connection>(
        source === "none"
          ? "/v1/connections"
          : source === "harness_config"
            ? "/v1/connections/native-configuration"
            : "/v1/connections/api-key",
        {
          harness: provider,
          provider_id: modelProvider,
          ...(source === "none"
            ? { authentication: { method: "none", billing_source: "free" } }
            : source === "harness_config"
              ? { configuration: nativeConfiguration }
              : { api_key: value }),
        },
        operation.current,
      );
      await saved(result);
      setKey("");
      setNativeConfiguration(null);
      close();
    } catch (failure) {
      const definitive =
        failure instanceof ApiError &&
        ["INVALID_REQUEST", "UNAUTHORIZED", "SCOPE_DENIED", "CONFLICT"].includes(failure.code);
      setUncertain(!definitive);
      setError(
        definitive
          ? failure.message
          : "Penyimpanan belum dapat dipastikan. Periksa lagi dengan permintaan yang sama.",
      );
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }
  return (
    <fieldset
      aria-label={`${company} connection for ${name}`}
      aria-busy={busy}
      data-api-key-editor
      className="settings-key-entry"
    >
      <div className="settings-key-heading">
        <HugeiconsIcon
          icon={Key01Icon}
          size={16}
          aria-hidden="true"
          className="settings-key-mark"
        />
        <div>
          <p>
            {source === "none"
              ? "Free access"
              : source === "harness_config"
                ? "Use your Pi setup"
                : `${company} API key`}
          </p>
          <p>
            {source === "none"
              ? "Use the free models offered by OpenCode."
              : source === "harness_config"
                ? "Reuse a connection already configured in Pi."
                : `Penggunaan ditagihkan ke akun API ${company} yang kamu pilih.`}
          </p>
        </div>
      </div>
      <form
        className="settings-key-form"
        onSubmit={(event) => {
          event.preventDefault();
          void save();
        }}
        onKeyDown={(event) => {
          if (event.key === "Escape") {
            event.preventDefault();
            event.stopPropagation();
            if (!busy) close();
          }
        }}
      >
        {harnesses[provider].providerId === null && source !== "harness_config" && (
          <label className="flex flex-col gap-2 text-sm">
            Model provider
            <select
              className="settings-select"
              value={modelProvider}
              required
              disabled={busy || uncertain}
              onChange={(event) => {
                setModelProvider(event.target.value);
                setKey("");
                setNativeConfiguration(null);
                operation.current = crypto.randomUUID();
              }}
            >
              <option value="">Choose a provider</option>
              {providersForHarness(provider).map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name}
                </option>
              ))}
            </select>
          </label>
        )}
        <div className="settings-key-field-line">
          {source === "harness_config" && (
            <PiConfigurationInput
              key={provider}
              disabled={busy || uncertain}
              onChange={(selection) => {
                setNativeConfiguration(selection?.configuration ?? null);
                setModelProvider(selection?.providerId ?? "");
                operation.current = crypto.randomUUID();
                setError("");
              }}
            />
          )}
          {source === "api_key" && (
            <div className="settings-key-input-wrap">
              <input
                ref={input}
                type={visible ? "text" : "password"}
                aria-label="API key"
                autoComplete="off"
                spellCheck={false}
                maxLength={16384}
                value={key}
                disabled={busy || uncertain || !modelProvider}
                onChange={(event) => {
                  setKey(event.target.value);
                  operation.current = crypto.randomUUID();
                  setError("");
                }}
                onPaste={(event) => {
                  const value = cleanKey(event.clipboardData.getData("text"));
                  if (!value) return;
                  event.preventDefault();
                  setKey(value);
                  operation.current = crypto.randomUUID();
                  if (!/\s/.test(value)) void save(value);
                }}
                placeholder={`Tempel ${company} API key`}
              />
              <button
                type="button"
                className="settings-key-visibility"
                onClick={() => setVisible(!visible)}
                aria-label={visible ? "Sembunyikan" : "Lihat"}
                aria-pressed={visible}
              >
                {visible ? (
                  <HugeiconsIcon icon={ViewOffIcon} size={14} aria-hidden="true" />
                ) : (
                  <HugeiconsIcon icon={ViewIcon} size={14} aria-hidden="true" />
                )}
              </button>
            </div>
          )}
          <div className="settings-key-actions">
            <Button
              type="submit"
              disabled={
                busy ||
                !modelProvider ||
                (source === "api_key" && !key.trim()) ||
                (source === "harness_config" && !nativeConfiguration)
              }
            >
              {busy && (
                <HugeiconsIcon
                  icon={Loading03Icon}
                  size={12}
                  aria-hidden="true"
                  className="animate-spin"
                />
              )}
              {uncertain ? "Periksa penyimpanan" : source === "api_key" ? "Simpan key" : "Connect"}
            </Button>
            <Button type="button" variant="outline" disabled={busy} onClick={close}>
              Batal
            </Button>
          </div>
        </div>
        <p className="settings-key-note">
          {source === "none"
            ? "No credential or paid billing route is added."
            : source === "harness_config"
              ? "The selected Pi connection is stored privately for this account. Your global Pi setup remains unchanged."
              : "Key disimpan di host backend dan tidak ditampilkan kembali."}
        </p>
        {error && (
          <p role="alert" className="settings-key-error">
            <HugeiconsIcon
              icon={AlertCircleIcon}
              size={13}
              aria-hidden="true"
              className="settings-key-error-icon"
            />
            <span>{error}</span>
          </p>
        )}
      </form>
    </fieldset>
  );
}
