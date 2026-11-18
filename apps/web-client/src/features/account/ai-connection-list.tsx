import { Copy01Icon, Loading03Icon, Tick02Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { type ReactNode, useId, useState } from "react";
import { toast } from "sonner";
import { HarnessIcon } from "@/components/harness-icon";
import { Button } from "@/components/ui/button";
import { ApiKeyEntry } from "@/features/settings/components/api-key-entry";
import { type HarnessId, harnesses } from "@/lib/harnesses";
import { connectionReady } from "./ai-integration";
import { DisconnectConnectionButton } from "./disconnect-connection-button";
import { onboardingHarnesses } from "./onboarding-harnesses";
import type { useAIConnections } from "./use-ai-connections";
import type { useOnboardingHarnesses } from "./use-onboarding-harnesses";
import "./ai-connection-list.css";

export function AIConnectionList({
  providers,
  runtimes,
  selected,
  onSelect,
  ownership = "personal",
  canConnect = true,
  disabled = false,
  accessFields,
  prepareAudience,
  context = "onboarding",
}: {
  providers: ReturnType<typeof useAIConnections>;
  runtimes: ReturnType<typeof useOnboardingHarnesses>;
  selected: HarnessId | null;
  onSelect: (value: HarnessId | null) => void;
  ownership?: "personal" | "organization";
  canConnect?: boolean;
  disabled?: boolean;
  accessFields?: (disabled: boolean) => ReactNode;
  prepareAudience?: () => Promise<string>;
  context?: "onboarding" | "settings";
}) {
  const [expanded, setExpanded] = useState<HarnessId | null>(
    context === "settings" ? selected : null,
  );
  const [formBusy, setFormBusy] = useState(false);
  const id = useId();
  const busy = providers.busy || runtimes.busy || formBusy;
  const blocked =
    disabled ||
    busy ||
    providers.loading ||
    runtimes.loading ||
    !!providers.error ||
    !!runtimes.error;
  const locked = busy || !!providers.login;
  return (
    <fieldset className="onboarding-ai-list" aria-label="AI connections">
      {onboardingHarnesses.map((harness) => {
        const runtime = runtimes.availability.find((item) => item.harness === harness.id);
        const connection = providers.connectionFor(harness.id);
        const connected = connectionReady(connection);
        const localSetup = providers.local && ["codex", "pi", "opencode"].includes(harness.id);
        const subscription = providers.owned.find(
          (item) =>
            item.harness === harness.id &&
            item.authentication.method === "native_login" &&
            connectionReady(item),
        );
        const nativeLogin = runtimes.nativeLogin.find((item) => item.harness === harness.id);
        const waiting = providers.login?.harness === harness.id;
        const updating = runtimes.updating === harness.id;
        const checking = providers.loading || runtimes.loading;
        const supported = runtime?.state === "supported";
        const missing = runtime?.state === "missing";
        const outdated = runtime?.state === "too_old";
        const open = expanded === harness.id || waiting;
        const panelId = `${id}-${harness.id}`;
        const version = runtime?.version
          ? `v${runtime.version}${outdated ? ` · Requires ${runtime.manifest.minimum_version}+` : ""}`
          : checking
            ? "Checking version…"
            : missing
              ? "Not installed on this server"
              : "Version could not be checked";
        const choose = () => {
          onSelect(harness.id);
          setExpanded(open ? null : harness.id);
        };
        const manage =
          context === "settings" &&
          canConnect &&
          !!connection &&
          providers.owned.some((item) => item.id === connection.id);
        const keyEntry = (
          <ApiKeyEntry
            provider={harness.id}
            ownership={ownership}
            prepareAudience={prepareAudience}
            disabled={blocked || locked}
            onBusyChange={setFormBusy}
            close={() => setExpanded(null)}
            saved={providers.savedKey}
          />
        );
        return (
          <div className="onboarding-harness-item" data-expanded={open} key={harness.id}>
            <div
              className="onboarding-harness"
              data-selected={open}
              data-available={harness.available}
            >
              <button
                className="onboarding-harness-select"
                type="button"
                aria-expanded={open}
                aria-controls={panelId}
                disabled={locked || !canConnect}
                onClick={choose}
              >
                <HarnessIcon id={harness.id} size={32} />
                <span className="onboarding-harness-copy">
                  <strong>{harness.name}</strong>
                  <span>{version}</span>
                </span>
              </button>
              {updating || checking ? (
                <Button size="sm" variant="outline" disabled>
                  <HugeiconsIcon
                    icon={Loading03Icon}
                    size={14}
                    className="animate-spin motion-reduce:animate-none"
                  />
                  {updating
                    ? runtimes.operation === "install"
                      ? "Installing…"
                      : "Updating…"
                    : "Checking…"}
                </Button>
              ) : missing || outdated ? (
                <Button
                  size="sm"
                  variant="outline"
                  disabled={locked || !runtimes.canUpdate}
                  title={
                    runtimes.canUpdate
                      ? undefined
                      : "Only the server owner can install or update this runtime."
                  }
                  onClick={() => void runtimes.update(harness.id)}
                >
                  {missing ? "Install" : "Update"}
                </Button>
              ) : !supported || runtimes.error ? (
                <Button size="sm" variant="outline" disabled={locked} onClick={runtimes.refresh}>
                  Retry
                </Button>
              ) : waiting ? (
                <Button size="sm" variant="outline" disabled>
                  Signing in…
                </Button>
              ) : connected && connection ? (
                manage ? (
                  <DisconnectConnectionButton
                    connection={connection}
                    refresh={providers.refresh}
                    disabled={locked}
                  />
                ) : (
                  <Button
                    className="ai-connected-button"
                    size="sm"
                    variant="outline"
                    disabled
                    aria-disabled="true"
                  >
                    <HugeiconsIcon icon={Tick02Icon} size={14} />
                    {connection.authentication.method === "local_config"
                      ? "Local setup"
                      : "Connected"}
                  </Button>
                )
              ) : (
                <Button
                  size="sm"
                  variant="outline"
                  disabled={blocked || !canConnect || locked}
                  aria-expanded={open}
                  aria-controls={panelId}
                  onClick={choose}
                >
                  {canConnect
                    ? localSetup && !harnesses[harness.id].nativeLogin
                      ? "Configure"
                      : "Connect"
                    : "Not shared"}
                </Button>
              )}
            </div>
            {open && (
              <div id={panelId} className="ai-connection-panel">
                {canConnect && supported && (
                  <>
                    {accessFields?.(locked)}
                    {harnesses[harness.id].nativeLogin && (
                      <div className="ai-auth-row">
                        <div className="onboarding-login-instructions">
                          <p className="onboarding-login-title">Subscription</p>
                          <p>Use your {harnesses[harness.id].accountName} account.</p>
                        </div>
                        <Button
                          size="sm"
                          variant="outline"
                          className={subscription ? "ai-connected-button" : undefined}
                          disabled={blocked || locked || !nativeLogin?.ready || !!subscription}
                          title={nativeLogin?.reason ?? undefined}
                          onClick={() => void providers.connect(harness.id)}
                        >
                          {subscription ? "Connected" : "Connect subscription"}
                        </Button>
                      </div>
                    )}
                    {harnesses[harness.id].nativeLogin && nativeLogin?.reason && (
                      <p className="onboarding-key-note">{nativeLogin.reason}</p>
                    )}
                    {waiting && providers.login && (
                      <div className="ai-login-panel onboarding-connect-form">
                        <div className="onboarding-login-instructions">
                          <p className="onboarding-login-title">Finish sign-in in your browser</p>
                          <p>
                            {providers.login.code ? "Enter this code when asked. " : ""}The
                            connection updates automatically when sign-in finishes.
                          </p>
                        </div>
                        {providers.login.code && (
                          <div className="onboarding-login-code-row">
                            <div className="onboarding-login-code-value">
                              <span>Sign-in code</span>
                              <code className="onboarding-login-code" translate="no">
                                {providers.login.code}
                              </code>
                            </div>
                            <Button
                              size="sm"
                              variant="ghost"
                              aria-label="Copy sign-in code"
                              onClick={() =>
                                void navigator.clipboard
                                  .writeText(providers.login?.code ?? "")
                                  .then(() => toast.success("Sign-in code copied."))
                                  .catch(() => toast.error("Select the code and copy it manually."))
                              }
                            >
                              <HugeiconsIcon icon={Copy01Icon} size={14} />
                              Copy
                            </Button>
                          </div>
                        )}
                        <div className="onboarding-login-actions">
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={busy}
                            onClick={() => void providers.openLogin()}
                          >
                            Open sign-in page
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            disabled={busy}
                            onClick={() => void providers.cancelLogin()}
                          >
                            Cancel sign-in
                          </Button>
                        </div>
                      </div>
                    )}
                    {localSetup && (
                      <div className="ai-auth-row">
                        <div className="onboarding-login-instructions">
                          <p className="onboarding-login-title">Local setup</p>
                          <p>Configure models and credentials in {harness.name}, then refresh.</p>
                        </div>
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={blocked || locked}
                          onClick={() => void providers.refresh()}
                        >
                          Refresh
                        </Button>
                      </div>
                    )}
                    {localSetup ? (
                      <details className="text-sm text-muted-foreground">
                        <summary className="cursor-pointer py-2">Manual connection</summary>
                        {keyEntry}
                      </details>
                    ) : (
                      keyEntry
                    )}
                  </>
                )}
                {!canConnect && !connected && (
                  <p className="onboarding-key-note">
                    Your organization hasn't shared this connection with you.
                  </p>
                )}
              </div>
            )}
          </div>
        );
      })}
    </fieldset>
  );
}
