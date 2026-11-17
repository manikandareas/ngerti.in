import { type HarnessId, harnesses, harnessIds, modelProviderName } from "@/lib/harnesses";
export type OnboardingHarness = HarnessId;

// App icons are retained locally from icons.computer; asset provenance is beside them.
export const onboardingHarnesses = harnessIds.map((id) => ({
  id,
  name: harnesses[id].name,
  description: harnesses[id].providerId
    ? modelProviderName(harnesses[id].providerId)
    : "Choose a model provider",
  providerId: harnesses[id].providerId,
  available: true,
}));

export const onboardingModelSamples: Record<OnboardingHarness, { name: string; detail: string }[]> =
  {
    codex: [{ name: "Choose a model", detail: "From your OpenAI account" }],
    muse: [{ name: "Choose a model", detail: "From your Muse account" }],
    claude: [{ name: "Choose a model", detail: "From your Anthropic account" }],
    opencode: [{ name: "Choose a model", detail: "From your selected provider" }],
    pi: [{ name: "Choose a model", detail: "From your selected provider" }],
  };

export function onboardingHarnessName(id: OnboardingHarness) {
  return onboardingHarnesses.find((harness) => harness.id === id)?.name ?? id;
}
