export type OnboardingHarness = "codex" | "muse";

// App icons are retained locally from icons.computer; asset provenance is beside them.
export const onboardingHarnesses = [
  {
    id: "codex",
    name: "Codex",
    description: "ChatGPT account",
    providerId: "openai",
    available: true,
  },
  {
    id: "muse",
    name: "Muse Code",
    description: "Meta account",
    providerId: "meta",
    available: true,
  },
  {
    id: "claude",
    name: "Claude Code",
    description: "Anthropic",
    providerId: "anthropic",
    available: false,
  },
  {
    id: "gemini",
    name: "Gemini CLI",
    description: "Google",
    providerId: "google",
    available: false,
  },
  { id: "cursor", name: "Cursor Agent", description: "Cursor", providerId: null, available: false },
] as const;

export const onboardingModelSamples: Record<OnboardingHarness, { name: string; detail: string }[]> =
  {
    codex: [
      { name: "GPT-5.2 Codex", detail: "Coding and agentic work" },
      { name: "GPT-5.2", detail: "Everyday tasks and reasoning" },
      { name: "GPT-5.1 Codex Mini", detail: "Fast, focused tasks" },
    ],
    muse: [
      { name: "Muse Spark", detail: "Everyday tasks and coding" },
      { name: "Muse Spark Thinking", detail: "Deeper reasoning" },
    ],
  };

export function onboardingHarnessName(id: OnboardingHarness) {
  return onboardingHarnesses.find((harness) => harness.id === id)?.name ?? id;
}
