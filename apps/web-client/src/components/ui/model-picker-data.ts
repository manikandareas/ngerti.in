import type { ModelPickerProvider } from "./model-picker-types";

const FULL_THINKING = ["low", "medium", "high", "xhigh", "max"] as const;
const STANDARD_THINKING = ["low", "medium", "high"] as const;
const MUSE_THINKING = ["minimal", ...FULL_THINKING] as const;

// Preview catalog verified on 2026-11-16. Runtime availability comes from the connection catalog.
// https://developers.openai.com/api/docs/models
// https://platform.claude.com/docs/en/models/overview
// https://platform.claude.com/docs/en/build-with-claude/effort
// https://aistudio.google.com/docs/models
// https://aistudio.google.com/docs/thinking
// https://docs.x.ai/developers/models/grok-4.7
// https://docs.x.ai/developers/model-capabilities/text/reasoning
// https://dev.meta.ai/docs/muse-wonder
// https://dev.meta.ai/docs/muse-spark
// https://dev.meta.ai/docs/muse-ember
// https://dev.meta.ai/docs/reasoning
export const defaultModelProviders: readonly ModelPickerProvider[] = [
  {
    id: "openai",
    name: "OpenAI",
    models: [
      {
        id: "gpt-6-astra",
        name: "GPT-6 Astra",
        description: "Deep reasoning for demanding work",
        capabilities: ["reasoning", "image"],
        thinking: FULL_THINKING,
        defaultThinking: "medium",
      },
      {
        id: "gpt-6.1-sol",
        name: "GPT-6.1 Sol",
        description: "Complex work with balanced cost",
        capabilities: ["reasoning", "image"],
        thinking: FULL_THINKING,
        defaultThinking: "medium",
      },
      {
        id: "gpt-6.1-terra",
        name: "GPT-6.1 Terra",
        description: "Visual reasoning and precise computer use",
        capabilities: ["reasoning", "image"],
        thinking: ["none", ...FULL_THINKING],
        defaultThinking: "medium",
      },
      {
        id: "gpt-6-luna",
        name: "GPT-6 Luna",
        description: "Efficient reasoning for focused tasks",
        capabilities: ["reasoning", "image"],
        thinking: ["none", ...FULL_THINKING],
        defaultThinking: "low",
      },
    ],
  },
  {
    id: "meta",
    name: "Meta",
    models: [
      {
        id: "muse-wonder-1.0",
        name: "Muse Wonder 1.0",
        description: "Complex coding and long-running agentic work",
        capabilities: ["reasoning", "image"],
        thinking: MUSE_THINKING,
        defaultThinking: "max",
      },
      {
        id: "muse-spark-1.3",
        name: "Muse Spark 1.3",
        description: "Coding and multi-step agent workflows",
        capabilities: ["reasoning", "image"],
        thinking: MUSE_THINKING,
        defaultThinking: "high",
      },
      {
        id: "muse-ember-1.0",
        name: "Muse Ember 1.0",
        description: "Efficient execution and repeated agent tasks",
        capabilities: ["reasoning", "image"],
        thinking: MUSE_THINKING,
        defaultThinking: "max",
      },
      {
        id: "muse-spark-1.2",
        name: "Muse Spark 1.2",
        description: "Previous-generation coding and reasoning",
        capabilities: ["reasoning", "image"],
        thinking: ["minimal", "low", "medium", "high", "xhigh"],
        defaultThinking: "high",
      },
    ],
  },
  {
    id: "anthropic",
    name: "Anthropic",
    models: [
      {
        id: "claude-fable-5-2",
        name: "Claude Fable 5.2",
        description: "Demanding reasoning and long agentic tasks",
        capabilities: ["reasoning", "image"],
        thinking: FULL_THINKING,
        defaultThinking: "high",
      },
      {
        id: "claude-opus-5-5",
        name: "Claude Opus 5.5",
        description: "Agentic coding and knowledge work",
        capabilities: ["reasoning", "image"],
        thinking: FULL_THINKING,
        defaultThinking: "medium",
      },
      {
        id: "claude-sonnet-5-5",
        name: "Claude Sonnet 5.5",
        description: "Fast reasoning for everyday work",
        capabilities: ["reasoning", "image"],
        thinking: FULL_THINKING,
        defaultThinking: "high",
      },
      {
        id: "claude-haiku-5-5",
        name: "Claude Haiku 5.5",
        description: "Quick responses and high-volume tasks",
        capabilities: ["reasoning", "image"],
        thinking: FULL_THINKING,
        defaultThinking: "medium",
      },
    ],
  },
  {
    id: "xai",
    name: "xAI",
    models: [
      {
        id: "grok-4.7",
        name: "Grok 4.7",
        description: "Coding, tool use, and knowledge work",
        capabilities: ["reasoning", "image"],
        thinking: [...STANDARD_THINKING, "xhigh"],
        defaultThinking: "high",
      },
    ],
  },
  {
    id: "google",
    name: "Google",
    models: [
      {
        id: "gemini-4-carbon",
        name: "Gemini 4 Carbon",
        description: "Complex coding and multimodal reasoning",
        capabilities: ["reasoning", "image"],
        thinking: STANDARD_THINKING,
        defaultThinking: "medium",
      },
      {
        id: "gemini-4-argon",
        name: "Gemini 4 Argon",
        description: "Efficient reasoning for complex tasks",
        capabilities: ["reasoning", "image"],
        thinking: STANDARD_THINKING,
        defaultThinking: "medium",
      },
      {
        id: "gemini-4-hydrogen",
        name: "Gemini 4 Hydrogen",
        description: "Fast coding and everyday agentic work",
        capabilities: ["reasoning", "image"],
        thinking: [...STANDARD_THINKING, "xhigh"],
        defaultThinking: "high",
      },
    ],
  },
];
