export const harnessIds = ["codex", "muse", "claude", "opencode", "pi"] as const;
export type HarnessId = (typeof harnessIds)[number];
export const harnesses: Record<
  HarnessId,
  {
    name: string;
    accountName: string;
    providerId: string | null;
    nativeLogin: boolean;
    mark: string;
  }
> = {
  codex: {
    name: "Codex",
    accountName: "ChatGPT",
    providerId: "openai",
    nativeLogin: true,
    mark: "C",
  },
  muse: {
    name: "Muse Code",
    accountName: "Muse Code",
    providerId: "meta",
    nativeLogin: true,
    mark: "M",
  },
  claude: {
    name: "Claude Code",
    accountName: "Claude Code",
    providerId: "anthropic",
    nativeLogin: false,
    mark: "Cl",
  },
  opencode: {
    name: "OpenCode",
    accountName: "OpenCode",
    providerId: null,
    nativeLogin: false,
    mark: "OC",
  },
  pi: { name: "Pi", accountName: "Pi", providerId: null, nativeLogin: false, mark: "π" },
};
export const modelProviders = [
  { id: "openai", name: "OpenAI" },
  { id: "anthropic", name: "Anthropic" },
  { id: "google", name: "Google" },
  { id: "openrouter", name: "OpenRouter" },
  { id: "xai", name: "xAI" },
  { id: "groq", name: "Groq" },
  { id: "mistral", name: "Mistral" },
  { id: "deepseek", name: "DeepSeek" },
  { id: "zai", name: "Z.ai" },
  { id: "minimax", name: "MiniMax" },
  { id: "meta", name: "Meta" },
  { id: "opencode", name: "OpenCode Free" },
] as const;
export function providersForHarness(harness: HarnessId) {
  return modelProviders.filter((provider) => provider.id !== "opencode" || harness === "opencode");
}
export function providerConnectionMethod(harness: HarnessId, provider: string) {
  return harness === "opencode" && provider === "opencode"
    ? "none"
    : harness === "pi"
      ? "harness_config"
      : "api_key";
}
export function isHarness(value: unknown): value is HarnessId {
  return harnessIds.some((id) => id === value);
}
export function modelProviderName(id: string | null | undefined) {
  return modelProviders.find((provider) => provider.id === id)?.name ?? id ?? "Provider";
}
