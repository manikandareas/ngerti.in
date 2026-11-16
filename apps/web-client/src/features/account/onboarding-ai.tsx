import { Copy01Icon, Loading03Icon, Tick02Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { Navigate } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { connectionReady } from "./ai-integration";
import { type OnboardingHarness, onboardingHarnesses } from "./onboarding-harnesses";
import { OnboardingLayout } from "./onboarding-layout";
import { OnboardingModelPicker } from "./onboarding-model-picker";
import { useAccount } from "./session";
import { useOnboardingConnections } from "./use-onboarding-connections";
import { useOnboardingHarnesses } from "./use-onboarding-harnesses";

export function OnboardingAI() {
  const account = useAccount();
  const providers = useOnboardingConnections();
  const runtimes = useOnboardingHarnesses();
  const [chosenHarness, setSelected] = useState<OnboardingHarness | null>(null);
  const selected = chosenHarness ?? providers.available.find(connectionReady)?.harness ?? "codex";
  const [finishing, setFinishing] = useState(false);
  const connection = providers.connectionFor(selected);
  const runtime = runtimes.availability.find((item) => item.harness === selected);
  const ready = connectionReady(connection) && runtime?.state === "supported";
  const busy = providers.busy || runtimes.busy;
  const blocked =
    busy || providers.loading || runtimes.loading || !!providers.error || !!runtimes.error;
  if (!account.organization || !account.session) return null;
  if (finishing && account.hasAIIntegration) return <Navigate to="/" replace />;

  const home = async () => {
    await account.refresh();
    setFinishing(true);
  };

  return (
    <OnboardingLayout
      step={2}
      preview={<OnboardingModelPicker harness={selected} connection={connection} />}
    >
      <h1>
        Connect AI.{" "}
        <span className="onboarding-description">Choose the harness behind your agents.</span>
      </h1>
      <fieldset className="onboarding-ai-list" aria-label="AI harnesses">
        {onboardingHarnesses.map((harness) => {
          const availability = runtimes.availability.find((item) => item.harness === harness.id);
          const connected =
            harness.available && connectionReady(providers.connectionFor(harness.id));
          const waiting = providers.login?.harness === harness.id;
          const updating = runtimes.updating === harness.id;
          const loginReadiness = runtimes.nativeLogin.find((item) => item.harness === harness.id);
          const supported = availability?.state === "supported";
          const outdated = availability?.state === "too_old";
          const needsUpdate =
            outdated || availability?.state === "unknown" || availability?.state === "probe_failed";
          const missing = availability?.state === "missing";
          const checking = harness.available && (providers.loading || runtimes.loading);
          const locked = busy || !!providers.login;
          const version = !harness.available
            ? harness.description
            : availability?.version
              ? `v${availability.version}${outdated ? ` · Requires ${availability.manifest.minimum_version}+` : ""}`
              : missing
                ? "Not installed on this server"
                : checking
                  ? "Checking version…"
                  : "Version could not be checked";
          return (
            <div className="onboarding-harness-item" data-expanded={waiting} key={harness.id}>
              <div
                className="onboarding-harness"
                data-selected={selected === harness.id}
                data-available={harness.available}
              >
                <button
                  type="button"
                  className="onboarding-harness-select"
                  aria-pressed={selected === harness.id}
                  disabled={!harness.available || locked}
                  onClick={() => {
                    if (harness.available) setSelected(harness.id);
                  }}
                >
                  <img src={`/images/harnesses/${harness.id}.png`} alt="" width="32" height="32" />
                  <span className="onboarding-harness-copy">
                    <strong>{harness.name}</strong>
                    <span>{version}</span>
                  </span>
                </button>
                {!harness.available ? (
                  <span className="onboarding-harness-status">Not available</span>
                ) : updating ? (
                  <span className="onboarding-harness-status" role="status">
                    {runtimes.operation === "install" ? "Installing…" : "Updating…"}
                  </span>
                ) : checking ? (
                  <span className="onboarding-harness-status" role="status">
                    Checking…
                  </span>
                ) : needsUpdate || missing ? (
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={locked || !runtimes.canUpdate}
                    title={
                      runtimes.canUpdate
                        ? `${missing ? "Install" : "Update"} ${harness.name} on the server`
                        : `Only the server owner can ${missing ? "install" : "update"} this harness`
                    }
                    onClick={() => {
                      setSelected(harness.id);
                      void runtimes.update(harness.id);
                    }}
                  >
                    {missing ? "Install" : "Update"}
                  </Button>
                ) : !supported || runtimes.error ? (
                  <Button size="sm" variant="outline" disabled={locked} onClick={runtimes.refresh}>
                    Retry
                  </Button>
                ) : waiting ? (
                  <span className="onboarding-harness-status" role="status">
                    <HugeiconsIcon
                      icon={Loading03Icon}
                      size={14}
                      className="shrink-0 animate-spin motion-reduce:animate-none"
                    />
                    Waiting for sign-in
                  </span>
                ) : connected ? (
                  <span className="onboarding-harness-status" data-connected="true">
                    <HugeiconsIcon icon={Tick02Icon} size={14} />
                    Connected
                  </span>
                ) : (
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={blocked || locked || !loginReadiness?.ready}
                    title={loginReadiness?.reason ?? undefined}
                    onClick={() => {
                      setSelected(harness.id);
                      void providers.connect(harness.id);
                    }}
                  >
                    {providers.busy && selected === harness.id ? "Connecting…" : "Connect"}
                  </Button>
                )}
              </div>
              {harness.available && supported && loginReadiness?.reason && (
                <p className="px-2.5 pb-2 pl-16 text-xs leading-relaxed text-muted-foreground">
                  {loginReadiness.reason}
                </p>
              )}
              {waiting && providers.login && (
                <div className="onboarding-harness-login">
                  <div className="onboarding-login-instructions">
                    <p className="onboarding-login-title">
                      {harness.id === "codex"
                        ? "Sign in with ChatGPT"
                        : `Sign in to ${harness.name}`}
                    </p>
                    <p>
                      {providers.login.code
                        ? "Open the sign-in page and enter this code when asked."
                        : "Complete sign-in in your browser to connect your account."}{" "}
                      Your connection will update here automatically.
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
                        onClick={() => {
                          void navigator.clipboard
                            .writeText(providers.login?.code ?? "")
                            .then(() => toast.success("Sign-in code copied."))
                            .catch(() =>
                              toast.error("Could not copy the code. Select and copy it manually."),
                            );
                        }}
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
                      Cancel
                    </Button>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </fieldset>
      <div className="onboarding-actions">
        <Button
          disabled={!ready || !connection || blocked || !!providers.login}
          onClick={() => {
            if (connection) void providers.finish(connection, home);
          }}
        >
          {busy ? "Please wait…" : "Continue"}
        </Button>
      </div>
    </OnboardingLayout>
  );
}
