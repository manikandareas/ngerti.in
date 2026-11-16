import { defaultAgentAvatar } from "@ngertiin/avatar/config";
import type { Agent, ConversationPreview, Thread } from "@/types/workspace";

const createdAt = "2026-01-01T09:41:00.000Z";
const names = ["Tobi", "Lumi", "Milo", "Nova"];
const summaries = [
  "Ready when you are.",
  "Your research, all in one place.",
  "Let’s bring your ideas to life.",
  "A little help for the whole team.",
];

export const previewAgents: Agent[] = names.map((name, index) => ({
  id: `onboarding-preview-agent-${index}`,
  organization_id: "onboarding-preview-organization",
  actor_id: index === 3 ? null : "onboarding-preview-user",
  revision: 1,
  created_at: createdAt,
  name,
  handle: name.toLowerCase(),
  avatar: null,
  avatar_config: defaultAgentAvatar(`onboarding-preview-agent-${index}`, index === 0),
  soul: summaries[index],
  instructions: "",
  harness: "codex",
  connection_id: null,
  model_id: null,
  reasoning: null,
  billing_source: "subscription",
  system_role: index === 0 ? "tobi" : null,
}));

export const previewThreads: Thread[] = previewAgents.map((agent, index) => ({
  id: `onboarding-preview-thread-${index}`,
  organization_id: "onboarding-preview-organization",
  actor_id: "onboarding-preview-user",
  revision: 1,
  created_at: createdAt,
  type: "dm",
  purpose: "conversation",
  name: null,
  member_agent_ids: [agent.id],
  creation_operation_id: null,
  shared_instructions: "",
}));

export const previewConversations: ConversationPreview[] = previewThreads.map((thread, index) => ({
  thread_id: thread.id,
  latest_message: {
    id: `onboarding-preview-message-${index}`,
    text: summaries[index],
    author: "agent",
    author_agent_id: previewAgents[index].id,
    has_attachments: false,
  },
}));

export const previewMessages = [
  {
    id: "welcome",
    author: "agent",
    text: "Hey! I’m Tobi, your everyday assistant. What are we working on today?",
    time: "09:41",
  },
  { id: "request", author: "user", text: "Help me make a plan for the week.", time: "09:42" },
  {
    id: "reply",
    author: "agent",
    text: "Let’s make room for what matters. What are your top three priorities?",
    time: "09:42",
  },
];
