import { createHash } from "node:crypto";
import type { RoutingDecision } from "./router";

export { routingReferences, routingState } from "./routing-context";
export { initialActorInstructions, routingKinds } from "./routing-judgments";
export const ROUTING_POLICY_VERSION = "semantic-routing-v3";
export type RoutingVariant = "single" | "batch" | "semantic";
export const DEFAULT_ROUTING_VARIANT: RoutingVariant = "semantic";
export const ROUTING_ACCEPTANCE = {
  confidence: 0.6,
  probability: 0.7,
  margin: 0.15,
  review: 0.6,
} as const;

export function routingInputHash(value: unknown) {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

/** Thresholds compose typed judgments; they never interpret words or choose a preferred member. */
export function routingEvidence(decision: RoutingDecision): {
  top_probability: number;
  margin: number;
  reason:
    | "unresolved"
    | "confidence"
    | "probability"
    | "margin"
    | "recipient"
    | "review"
    | "context"
    | "accepted";
} {
  const values = Object.values(decision.probabilities).sort((a, b) => b - a);
  const top_probability = values[0] ?? 0;
  const margin = top_probability - (values[1] ?? 0);
  const reason = !decision.agent_id
    ? "unresolved"
    : decision.context_required
      ? "context"
      : (decision.review_support !== undefined &&
            decision.review_support < ROUTING_ACCEPTANCE.review) ||
          (decision.review_recipient_id !== undefined &&
            decision.review_recipient_id !== decision.agent_id)
        ? "review"
        : decision.confidence < ROUTING_ACCEPTANCE.confidence
          ? "confidence"
          : top_probability < ROUTING_ACCEPTANCE.probability
            ? "probability"
            : margin < ROUTING_ACCEPTANCE.margin
              ? "margin"
              : decision.recipient_probability !== undefined &&
                  decision.recipient_probability < 0.75
                ? "recipient"
                : "accepted";
  return { top_probability, margin, reason };
}
