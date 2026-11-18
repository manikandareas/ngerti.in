import { Loading03Icon, Tick02Icon, ViewIcon, ViewOffIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { ProviderId } from "@/features/settings/components/shared";
import { ApiError, request } from "@/lib/api-client";
import { assertScope, clientScope } from "@/lib/client-scope";
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

const connectionErrors: Record<string, string> = {
  AUTH_REJECTED: "This key was not accepted. Check it and try again.",
  CREDENTIAL_MISSING: "Enter a valid API key and try checking again.",
  MODEL_UNAVAILABLE: "No models are available with this key. Check its model permissions.",
  PROVIDER_LIMIT: "The provider is limiting requests. Wait a moment and try again.",
  PROTOCOL_ERROR: "The provider could not complete this check. Try again.",
  ADAPTER_UNAVAILABLE: "This runtime is unavailable. Check the server and try again.",
  BILLING_MISMATCH:
    "This credential uses another billing method. Choose the matching connection method.",
};

export function ApiKeyEntry({
  provider,
  close,
  saved,
  ownership = "personal",
  prepareAudience,
  disabled = false,
  onBusyChange,
}: {
  provider: ProviderId;
  close: () => void;
  saved: (connection: Connection) => Promise<void>;
  ownership?: "personal" | "organization";
  prepareAudience?: () => Promise<string>;
  disabled?: boolean;
  onBusyChange?: (busy: boolean) => void;
}) {
  const [key, setKey] = useState("");
  const [visible, setVisible] = useState(false);
  const [busy, setBusy] = useState<"check" | "save" | null>(null);
  const [error, setError] = useState("");
  const [checked, setChecked] = useState(false);
  const [uncertain, setUncertain] = useState(false);
  const [modelProvider, setModelProvider] = useState(harnesses[provider].providerId ?? "");
  const [configuration, setConfiguration] = useState<Record<string, unknown> | null>(null);
  const source = providerConnectionMethod(provider, modelProvider);
  const operation = useRef(crypto.randomUUID());
  const audience = useRef<string | null>(null);
  const scope = useRef(clientScope()).current;
  const lock = useRef(false);
  const company = modelProviderName(modelProvider || null);
  const resetCheck = () => {
    setChecked(false);
    setError("");
    operation.current = crypto.randomUUID();
  };
  async function submit() {
    const value = cleanKey(key);
    if (
      lock.current ||
      disabled ||
      !modelProvider ||
      (source === "api_key" && !value) ||
      (source === "harness_config" && !configuration)
    )
      return;
    const checking = source === "api_key" && !checked;
    lock.current = true;
    setBusy(checking ? "check" : "save");
    onBusyChange?.(true);
    setError("");
    try {
      if (checking) {
        const result = await request<{ checked: true; model_count: number }>(
          "/v1/connections/api-key/check",
          { harness: provider, provider_id: modelProvider, api_key: value },
          undefined,
          undefined,
          30_000,
          scope,
        );
        setChecked(result.checked);
        return;
      }
      if (ownership === "organization" && !audience.current) {
        audience.current = (await prepareAudience?.()) ?? null;
        if (!audience.current) throw new Error("Choose who can use this connection first.");
      }
      assertScope(scope);
      const connection = await request<Connection>(
        source === "none"
          ? "/v1/connections"
          : source === "harness_config"
            ? "/v1/connections/native-configuration"
            : "/v1/connections/api-key",
        {
          harness: provider,
          provider_id: modelProvider,
          ownership,
          audience_id: audience.current,
          ...(source === "none"
            ? { authentication: { method: "none", billing_source: "free" } }
            : source === "harness_config"
              ? { configuration }
              : { api_key: value }),
        },
        operation.current,
        undefined,
        30_000,
        scope,
      );
      await saved(connection);
      setKey("");
      setConfiguration(null);
      close();
    } catch (failure) {
      const definitive =
        failure instanceof ApiError &&
        ["INVALID_REQUEST", "UNAUTHORIZED", "SCOPE_DENIED", "CONFLICT"].includes(failure.code);
      if (!checking) setUncertain(!definitive);
      if (definitive) {
        audience.current = null;
        operation.current = crypto.randomUUID();
      }
      setError(
        failure instanceof ApiError
          ? (connectionErrors[failure.code] ?? failure.message)
          : failure instanceof Error
            ? failure.message
            : checking
              ? "Could not check this key. Try again."
              : "Saving could not be confirmed. Try again using the same request.",
      );
    } finally {
      lock.current = false;
      setBusy(null);
      onBusyChange?.(false);
    }
  }
  return (
    <form
      className="ai-key-entry"
      onSubmit={(event) => {
        event.preventDefault();
        void submit();
      }}
      aria-label={`${harnesses[provider].name} API connection`}
      aria-busy={!!busy}
    >
      {harnesses[provider].providerId === null && source !== "harness_config" && (
        <label className="ai-provider-field">
          Model provider
          <select
            className="settings-select"
            value={modelProvider}
            required
            disabled={!!busy || uncertain || disabled}
            onChange={(event) => {
              setModelProvider(event.target.value);
              setKey("");
              setConfiguration(null);
              resetCheck();
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
      <div className="ai-auth-row ai-key-row">
        <div className="ai-key-field">
          <label htmlFor={`key-${provider}`}>
            {source === "none"
              ? "Free access"
              : source === "harness_config"
                ? "Pi setup"
                : "API key"}
          </label>
          {source === "api_key" && (
            <div className="ai-key-input">
              <Input
                id={`key-${provider}`}
                type={visible ? "text" : "password"}
                autoComplete="off"
                spellCheck={false}
                maxLength={16384}
                value={key}
                disabled={!!busy || uncertain || disabled || !modelProvider}
                placeholder={`Paste ${company} API key`}
                onChange={(event) => {
                  setKey(event.target.value);
                  resetCheck();
                }}
                onPaste={(event) => {
                  const value = cleanKey(event.clipboardData.getData("text"));
                  if (value) {
                    event.preventDefault();
                    setKey(value);
                    resetCheck();
                  }
                }}
              />
              <button
                type="button"
                aria-label={visible ? "Hide API key" : "Show API key"}
                aria-pressed={visible}
                disabled={!!busy}
                onClick={() => setVisible(!visible)}
              >
                <HugeiconsIcon icon={visible ? ViewOffIcon : ViewIcon} size={14} />
              </button>
            </div>
          )}
          {source === "harness_config" && (
            <PiConfigurationInput
              disabled={!!busy || uncertain || disabled}
              onChange={(selection) => {
                setConfiguration(selection?.configuration ?? null);
                setModelProvider(selection?.providerId ?? "");
                resetCheck();
              }}
            />
          )}
          {source === "none" && (
            <p className="onboarding-key-note">Use the free models offered by OpenCode.</p>
          )}
        </div>
        <Button
          size="sm"
          variant={checked ? "default" : "outline"}
          type="submit"
          disabled={
            !!busy ||
            disabled ||
            !modelProvider ||
            (source === "api_key" && !key.trim()) ||
            (source === "harness_config" && !configuration)
          }
        >
          {busy ? (
            <HugeiconsIcon
              icon={Loading03Icon}
              size={14}
              className="animate-spin motion-reduce:animate-none"
            />
          ) : checked ? (
            <HugeiconsIcon icon={Tick02Icon} size={14} />
          ) : null}
          {busy === "check"
            ? "Checking…"
            : busy === "save"
              ? "Saving…"
              : uncertain
                ? "Retry save"
                : source !== "api_key"
                  ? "Connect"
                  : checked
                    ? "Save"
                    : "Check"}
        </Button>
      </div>
      {checked && (
        <p className="ai-key-success" role="status">
          Connection checked. Save to add it to your account.
        </p>
      )}
      {error && (
        <p className="ai-key-error" role="alert">
          {error}
        </p>
      )}
    </form>
  );
}
