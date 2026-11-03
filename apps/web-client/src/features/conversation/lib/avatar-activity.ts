import type { AvatarState } from "@/features/avatar/engine/catalog";
import type { AgentActivity } from "@/types/workspace";
import { activityPresentation } from "./activity-presentation";

export function avatarActivity(
  activity?: AgentActivity,
  online = true,
  composing = false,
): { state: AvatarState; label: string } {
  const { state, label } = activityPresentation(activity ?? { status: "idle" }, { online });
  return composing && online && state === "idle" && activity?.status !== "cancelled"
    ? { state: "listening", label: "Listening…" }
    : { state, label };
}
