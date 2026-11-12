import { TypeSafeClient } from "@typesafe-ai/sdk";
import {
  type ContextScope,
  memberKey,
  ROUTING_CONTEXT_VERSION,
  routingState,
} from "./routing-context";
import {
  focusedQuestions,
  labeledCandidates,
  recipientQuestion,
  relationalQuestions,
} from "./routing-judgments";
import {
  DEFAULT_ROUTING_VARIANT,
  ROUTING_POLICY_VERSION,
  type RoutingVariant,
  routingInputHash,
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
  origin?: {
    kind: "user_request" | "agent_request" | "system_selection";
    actor_id: string | null;
    purpose: string;
  };
  interactions?: {
    agent_id: string;
    source_agent_id: string | null;
    state: string;
    request: string;
    summary: string | null;
  }[];
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
  context_version?: string;
  context_scope?: ContextScope;
  context_required?: boolean;
  review_support?: number;
  model_calls?: number;
  needs_context_probability?: number;
  review_role?: string;
  requested_peer_id?: string | null;
  selection_basis?: string;
  review_recipient_id?: string | null;
  delegation_probability?: number;
};
export type RoutingObservation = {
  phase: "focused" | "contextual" | "reviewing";
  request: unknown;
  response?: unknown;
  duration_ms?: number;
};
export interface GroupRouter {
  choose(
    packet: RoutingPacket,
    signal: AbortSignal,
    observe?: (event: RoutingObservation) => void,
  ): Promise<RoutingDecision>;
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
  async choose(
    packet: RoutingPacket,
    signal: AbortSignal,
    observe?: (event: RoutingObservation) => void,
  ): Promise<RoutingDecision> {
    const candidates = Object.fromEntries(
      packet.members.map((member) => [memberKey(member.agent_id), member]),
    );
    const signalWithDeadline = AbortSignal.any([signal, AbortSignal.timeout(this.timeoutMs)]);
    const state = routingState(packet, "focused");
    const questions =
      this.variant === "single"
        ? { responder: recipientQuestion(packet) }
        : focusedQuestions(packet);
    const request = { model: "jev-1.14.0", state, questions };
    const started = performance.now();
    await observe?.({ phase: "focused", request });
    const response = await this.client.systemOne(request, {
      signal: signalWithDeadline,
      retry: { maxRetries: 0 },
    });
    await observe?.({
      phase: "focused",
      request,
      response: response.answers,
      duration_ms: Math.round(performance.now() - started),
    });
    const result = response.answers.responder;
    const decision: RoutingDecision = {
      agent_id: candidates[result.choice]?.agent_id ?? null,
      model: response.model,
      confidence: result.confidence ?? 0,
      probabilities: result.probabilities,
      input_tokens: response.usage.input_tokens,
      policy_version: ROUTING_POLICY_VERSION,
      variant: this.variant,
      input_sha256: routingInputHash(request),
      context_version: ROUTING_CONTEXT_VERSION,
      context_scope: "focused",
      model_calls: 1,
      ...("relationship" in response.answers
        ? { routing_kind: response.answers.relationship.choice }
        : {}),
      ...("basis" in response.answers
        ? {
            selection_basis: response.answers.basis.choice,
            needs_context_probability: response.answers.basis.probabilities.shared_context ?? 0,
          }
        : {}),
    };
    const needsContext =
      decision.selection_basis === "shared_context" ||
      (decision.routing_kind === "continuation" && decision.selection_basis !== "addressed");
    const hasContext =
      packet.history.length > 0 || !!packet.interactions?.length || !!packet.active_tasks?.length;
    const uncertain = !decision.agent_id || decision.confidence < 0.5;
    if (this.variant !== "semantic") return { ...decision, context_required: needsContext };
    if (needsContext || (uncertain && hasContext && decision.selection_basis !== "addressed")) {
      const scope: ContextScope = "shared";
      const expanded = {
        model: "jev-1.14.0",
        state: routingState(packet, scope),
        questions: { responder: recipientQuestion(packet) },
      };
      const at = performance.now();
      await observe?.({ phase: "contextual", request: expanded });
      const reviewed = await this.client.systemOne(expanded, {
        signal: signalWithDeadline,
        retry: { maxRetries: 0 },
      });
      await observe?.({
        phase: "contextual",
        request: expanded,
        response: reviewed.answers,
        duration_ms: Math.round(performance.now() - at),
      });
      const selected = reviewed.answers.responder;
      return {
        ...decision,
        agent_id: candidates[selected.choice]?.agent_id ?? null,
        confidence: selected.confidence ?? 0,
        probabilities: selected.probabilities,
        input_tokens: (decision.input_tokens ?? 0) + reviewed.usage.input_tokens,
        context_scope: scope,
        context_required: false,
        model_calls: 2,
      };
    }
    if (
      decision.selection_basis === "ambiguous_identity" ||
      decision.selection_basis === "absent_recipient"
    )
      return { ...decision, agent_id: null };
    if (
      decision.agent_id &&
      ((uncertain && decision.selection_basis === "addressed") ||
        decision.routing_kind === "delegation" ||
        decision.routing_kind === "unclear")
    ) {
      const review = {
        model: "jev-1.14.0",
        state: routingState(packet, "focused", true),
        questions: relationalQuestions(packet),
      };
      const at = performance.now();
      await observe?.({ phase: "reviewing", request: review });
      const checked = await this.client.systemOne(review, {
        signal: signalWithDeadline,
        retry: { maxRetries: 0 },
      });
      await observe?.({
        phase: "reviewing",
        request: review,
        response: checked.answers,
        duration_ms: Math.round(performance.now() - at),
      });
      const labels = labeledCandidates(packet);
      const initiator = checked.answers.delegator;
      const peer = labels[checked.answers.peer.choice]?.agent_id ?? null;
      const delegation = checked.answers.delegation.noul;
      const meta = {
        ...decision,
        input_tokens: (decision.input_tokens ?? 0) + checked.usage.input_tokens,
        delegation_probability: delegation,
        review_role: initiator.choice,
        requested_peer_id: peer,
        model_calls: 2,
      };
      if (initiator.choice === "none" && (initiator.confidence ?? 0) >= 0.5 && delegation <= 0.5)
        return { ...meta, routing_kind: "direct" };
      const initial = labels[initiator.choice]?.agent_id ?? null;
      if (initial && delegation >= 0.6 && initial !== peer)
        return {
          ...meta,
          agent_id: initial,
          confidence: initiator.confidence ?? 0,
          probabilities: initiator.probabilities,
          review_support: delegation,
          review_recipient_id: initial,
        };
      return { ...meta, review_support: 0 };
    }
    return decision;
  }
}
