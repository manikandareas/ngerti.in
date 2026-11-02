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
import type { Connection } from "@/types/workspace";

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
  const operation = useRef(crypto.randomUUID());
  const lock = useRef(false);
  const input = useRef<HTMLInputElement>(null);
  const company = provider === "codex" ? "OpenAI" : "Meta";
  const name = providers.find((item) => item.id === provider)?.name;
  useEffect(() => {
    input.current?.focus();
  }, []);
  async function save(raw = key) {
    const value = cleanKey(raw);
    if (lock.current || !value) return;
    lock.current = true;
    setBusy(true);
    setError("");
    try {
      // Write-only secrets remain in memory; every reconciliation reuses the operation.
      const result = await request<Connection>(
        "/v1/connections/api-key",
        { harness: provider, api_key: value },
        operation.current,
      );
      setKey("");
      await saved(result);
      close();
    } catch (failure) {
      const definitive =
        failure instanceof ApiError &&
        ["INVALID_REQUEST", "UNAUTHORIZED", "SCOPE_DENIED", "CONFLICT"].includes(failure.code);
      setUncertain(!definitive);
      setError(
        definitive
          ? failure.message
          : "Penyimpanan belum dapat dipastikan. Periksa lagi dengan key dan permintaan yang sama.",
      );
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }
  return (
    <fieldset
      aria-label={`${company} API key untuk ${name}`}
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
          <p>{company} API key</p>
          <p>Biaya API terpisah dari subscription {name}.</p>
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
        <div className="settings-key-field-line">
          <div className="settings-key-input-wrap">
            <input
              ref={input}
              type={visible ? "text" : "password"}
              aria-label="API key"
              autoComplete="off"
              spellCheck={false}
              maxLength={16384}
              value={key}
              disabled={busy || uncertain}
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
              placeholder={provider === "codex" ? "sk-…" : "Tempel Meta API key"}
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
          <div className="settings-key-actions">
            <Button type="submit" disabled={busy || !key.trim()}>
              {busy && (
                <HugeiconsIcon
                  icon={Loading03Icon}
                  size={12}
                  aria-hidden="true"
                  className="animate-spin"
                />
              )}
              {uncertain ? "Periksa penyimpanan" : "Simpan key"}
            </Button>
            <Button type="button" variant="outline" disabled={busy} onClick={close}>
              Batal
            </Button>
          </div>
        </div>
        <p className="settings-key-note">
          Key disimpan di host backend dan tidak ditampilkan kembali.
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
