import type { z } from "zod";
import type { harness } from "../contracts/base";
import { HarnessError } from "./contracts";

type Harness = z.infer<typeof harness>;
export const providerEnvironments: Readonly<Record<string, string>> = {
  openai: "OPENAI_API_KEY",
  anthropic: "ANTHROPIC_API_KEY",
  google: "GEMINI_API_KEY",
  openrouter: "OPENROUTER_API_KEY",
  xai: "XAI_API_KEY",
  groq: "GROQ_API_KEY",
  mistral: "MISTRAL_API_KEY",
  deepseek: "DEEPSEEK_API_KEY",
  zai: "ZAI_API_KEY",
  minimax: "MINIMAX_API_KEY",
  meta: "META_API_KEY",
};
const singleProvider: Partial<Record<Harness, string>> = {
  codex: "openai",
  claude: "anthropic",
  muse: "meta",
};

/** Connection provider selection is immutable. A multi-provider harness never chooses a default. */
export function connectionProvider(harness: Harness, provider: string | null | undefined) {
  const fixed = singleProvider[harness];
  if (fixed && provider && fixed !== provider) throw new HarnessError("BILLING_MISMATCH");
  const selected = provider ?? fixed;
  // Multi-provider harness configuration owns its provider IDs. The application only
  // maintains environment mappings for explicitly submitted keys, not a provider registry.
  if (!selected || !/^[a-z0-9][a-z0-9._-]{0,99}$/.test(selected))
    throw new HarnessError("CAPABILITY_UNSUPPORTED");
  return selected;
}

export function credentialEnvironment(harness: Harness, provider?: string | null) {
  const name = providerEnvironments[connectionProvider(harness, provider)];
  if (!name) throw new HarnessError("CAPABILITY_UNSUPPORTED");
  return name;
}
