import { Navigate } from "@tanstack/react-router";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { AIConnectionList } from "./ai-connection-list";
import { connectionReady } from "./ai-integration";
import type { OnboardingHarness } from "./onboarding-harnesses";
import { OnboardingLayout } from "./onboarding-layout";
import { OnboardingModelPicker } from "./onboarding-model-picker";
import { useAccount } from "./session";
import { useAIConnections } from "./use-ai-connections";
import { useOnboardingHarnesses } from "./use-onboarding-harnesses";

export function OnboardingAI() {
  const account = useAccount();
  const providers = useAIConnections({ onboarding: true });
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
      preview={
        <OnboardingModelPicker
          harness={selected}
          connection={connection}
          connections={providers.available}
        />
      }
    >
      <h1>
        Connect AI.{" "}
        <span className="onboarding-description">Choose the harness behind your agents.</span>
      </h1>
      <AIConnectionList
        providers={providers}
        runtimes={runtimes}
        selected={selected}
        onSelect={setSelected}
      />
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
