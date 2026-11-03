import {
  choice,
  noul,
  TypeSafeClient,
} from "../../../../apps/server/node_modules/@typesafe-ai/sdk/dist/index.mjs";
import {
  DEFAULT_ROUTING_VARIANT,
  initialActorInstructions,
  ROUTING_POLICY_VERSION,
  type RoutingVariant,
  routingInputHash,
  routingKinds,
  routingState,
} from "./routing-policy";

export type RoutingPacket = {
  group: { name: string | null; shared_instructions: string };
  request: string;
  request_message_id: string;
  attachments: {
    id: string;
    name: string;
    media_type: string;
    size_bytes: number | null;
    sha256: string | null;
  }[];
  members: {
    agent_id: string;
    name: string;
    handle: string | null;
    soul: string;
    instructions: string;
  }[];
  history: { id: string; author: string; agent_id: string | null; text: string }[];
  active_tasks?: { agent_id: string; state: string; summary: string | null }[];
};
export type RoutingDecision = {
  agent_id: string | null;
  model: string;
  confidence: number;
  probabilities: Record<string, number>;
  input_tokens: number | null;
  policy_version?: string;
  variant?: RoutingVariant;
  input_sha256?: string;
  routing_kind?: string;
  recipient_probability?: number;
};
export interface GroupRouter {
  choose(packet: RoutingPacket, signal: AbortSignal): Promise<RoutingDecision>;
}

/** A bounded semantic decision. Native harnesses retain all planning and execution. */
export class JevRouter implements GroupRouter {
  readonly client: TypeSafeClient;
  constructor(
    apiKey: string,
    private readonly timeoutMs = 1500,
    fetcher?: typeof fetch,
    readonly variant: RoutingVariant = DEFAULT_ROUTING_VARIANT,
  ) {
    this.client = new TypeSafeClient({
      apiKey,
      defaultModel: "jev-1.14.0",
      timeout: timeoutMs,
      retry: { maxRetries: 0 },
      logLevel: "off",
      ...(fetcher ? { fetch: fetcher } : {}),
    });
  }
  async choose(packet: RoutingPacket, signal: AbortSignal): Promise<RoutingDecision> {
    const candidates = Object.fromEntries(
      packet.members.map((member, index) => [`member_${index}`, member]),
    );
    const state = routingState(packet);
    const questions = {
      responder: choice(initialActorInstructions, {
        ...Object.fromEntries(
          packet.members.map((member, index) => [
            `member_${index}`,
            `The member ${member.name}, described in members.member_${index}.`,
          ]),
        ),
        unresolved:
          "No supplied group member is a supported initial recipient, or the initial recipient is ambiguous.",
      }),
      ...(this.variant === "batch"
        ? {
            routing_kind: choice(
              "Classify the latest_request's routing relationship. Use the latest request and recent_history; do not execute it.",
              routingKinds,
            ),
            recipient_resolvable: noul(
              "Does latest_request and the shared context support identifying one valid initial recipient among members? A uniquely addressed current member counts even with an empty role. A request naming an absent recipient or an ambiguous nickname does not. This concerns routing intent, not execution permission.",
            ),
          }
        : {}),
    };
    const response = await this.client.systemOne(
      {
        model: "jev-1.14.0",
        state,
        questions,
      },
      {
        signal: AbortSignal.any([signal, AbortSignal.timeout(this.timeoutMs)]),
        retry: { maxRetries: 0 },
      },
    );
    const result = response.answers.responder;
    return {
      agent_id: candidates[result.choice]?.agent_id ?? null,
      model: response.model,
      confidence: result.confidence ?? 0,
      probabilities: result.probabilities,
      input_tokens: response.usage.input_tokens,
      policy_version: ROUTING_POLICY_VERSION,
      variant: this.variant,
      input_sha256: routingInputHash({ model: "jev-1.14.0", state, questions }),
      ...(response.answers.routing_kind
        ? { routing_kind: response.answers.routing_kind.choice }
        : {}),
      ...(response.answers.recipient_resolvable
        ? { recipient_probability: response.answers.recipient_resolvable.noul }
        : {}),
    };
  }
}
