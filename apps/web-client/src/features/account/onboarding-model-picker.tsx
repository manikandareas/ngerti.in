import { useMemo } from "react";
import {
  defaultModelProviders,
  ModelPicker,
  type ModelPickerProvider,
  type ThinkingEffort,
} from "@/components/ui/model-picker";
import type { Connection } from "@/types/workspace";
import { connectionReady } from "./ai-integration";
import {
  type OnboardingHarness,
  onboardingHarnesses,
  onboardingHarnessName,
} from "./onboarding-harnesses";
import "./onboarding-model-picker.css";

const thinkingEfforts: readonly string[] = [
  "none",
  "minimal",
  "low",
  "medium",
  "high",
  "xhigh",
  "max",
];

export function OnboardingModelPicker({
  harness,
  connection,
}: {
  harness: OnboardingHarness;
  connection?: Connection;
}) {
  const providers = useMemo(() => {
    const items: ModelPickerProvider[] = onboardingHarnesses.map((item) => ({
      id: item.id,
      name: item.name,
      icon: (
        <img
          src={`/images/harnesses/${item.id}.png`}
          alt=""
          data-available={item.available}
          className="size-full rounded-sm object-contain data-[available=false]:opacity-50"
        />
      ),
      models:
        defaultModelProviders.find((provider) => provider.id === item.providerId)?.models ?? [],
    }));
    if (!connectionReady(connection) || connection?.harness !== harness) return items;
    return items.map((provider) =>
      provider.id === harness
        ? {
            ...provider,
            models: connection.models.map((model) => {
              const sample = provider.models.find((item) => item.id === model.id);
              const thinking = model.reasoning.filter((effort): effort is ThinkingEffort =>
                thinkingEfforts.includes(effort),
              );
              return {
                id: model.id,
                name: sample?.name ?? model.id,
                description: sample?.description,
                capabilities: [
                  ...(thinking.length ? (["reasoning"] as const) : []),
                  ...(model.input_modalities?.includes("image") ? (["image"] as const) : []),
                ],
                thinking,
                defaultThinking: thinking.includes("medium") ? "medium" : thinking[0],
              };
            }),
          }
        : provider,
    );
  }, [connection, harness]);
  const activeProvider = providers.find((provider) => provider.id === harness);
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
          value={activeProvider?.models[0]?.id}
          placeholder={onboardingHarnessName(harness)}
          open
          inline
        />
      </fieldset>
    </aside>
  );
}
