import { useMemo } from "react";
import { HarnessIcon } from "@/components/harness-icon";
import { ModelPicker } from "@/components/ui/model-picker";
import { connectionReady, harnessModelCatalog, harnessModelKey } from "@/lib/harness-models";
import type { Connection } from "@/types/workspace";
import { type OnboardingHarness, onboardingHarnessName } from "./onboarding-harnesses";
import "./onboarding-model-picker.css";

export function OnboardingModelPicker({
  harness,
  connection,
  connections,
}: {
  harness: OnboardingHarness;
  connection?: Connection;
  connections: readonly Connection[];
}) {
  const providers = useMemo(
    () =>
      harnessModelCatalog(connections).providers.map((provider) => ({
        ...provider,
        icon: <HarnessIcon id={provider.id} size={20} className="rounded-sm" />,
      })),
    [connections],
  );
  const first =
    connectionReady(connection) && connection?.harness === harness
      ? connection.models[0]
      : undefined;
  return (
    <aside
      className="onboarding-preview onboarding-model-preview"
      aria-label="Model picker preview"
    >
      <fieldset className="onboarding-model-preview-content" disabled aria-label="Model preview">
        <ModelPicker
          providers={providers}
          activeProvider={harness}
          showEmptyProviders
          value={first && connection ? harnessModelKey(connection.id, first.id) : undefined}
          placeholder={onboardingHarnessName(harness)}
          emptyProvider={() => "Models appear after you connect and verify this harness."}
          open
          inline
        />
      </fieldset>
    </aside>
  );
}
