import type { AvatarState } from "@/features/avatar/engine/catalog";
import type { Run } from "@/types/workspace";

type ActivitySource = Pick<Run, "status" | "preparation"> &
  Partial<Pick<Run, "id" | "activity" | "active_tools" | "native_progress">> & {
    waiting_for_user?: boolean;
  };
export interface ActivityPresentation {
  label: string;
  isLoading: boolean;
  state: AvatarState;
  tone: "neutral" | "danger";
}

export const thinkingLabels = [
  "Thinking it through…",
  "Connecting the dots…",
  "Let me think for a sec…",
  "Putting the pieces together…",
  "A little brainwork…",
];

export const routingLabels = [
  "Who’s got this? One sec…",
  "Who’s up? Let’s see…",
  "Picking a brain to borrow…",
  "Finding your partner in crime…",
  "Who’s taking the mic?…",
];

export function routingLabel(id: string) {
  return stableLabel(routingLabels, id);
}

// Random run IDs distribute the copy while keeping it stable across renders and reloads.
function stableLabel(labels: string[], id?: string) {
  if (!id) return labels[0];
  let hash = 2166136261;
  for (const character of id) hash = Math.imul(hash ^ character.charCodeAt(0), 16777619);
  return labels[(hash >>> 0) % labels.length];
}

const guidance: Record<string, string> = {
  MODEL_UNAVAILABLE: "Choose an available model to get started.",
  LOGIN_REQUIRED: "Sign in to get started.",
  AUTH_REQUIRED: "Connect your account to get started.",
  AUTH_REJECTED: "Your connection needs attention.",
  CREDENTIAL_MISSING: "Add your key in connection settings.",
  EXECUTABLE_MISSING: "Check your connection in settings.",
  VERSION_TOO_OLD: "Update your connected app to continue.",
  VERSION_UNKNOWN: "Check your connected app in settings.",
  BILLING_MISMATCH: "Check the billing option selected for this connection.",
  NATIVE_REJECTED: "Check your model and connection settings.",
  PROVIDER_LIMIT: "Usage limit reached. Wait for quota to reset or choose another connection.",
  CAPABILITY_UNSUPPORTED: "This connection doesn’t support that action.",
  CAPABILITY_UNKNOWN: "Check whether your connection supports this action.",
};
export function activityGuidance(code: string) {
  return guidance[code] ?? "Please check your connection and try again.";
}

export function activityPresentation(
  source: ActivitySource,
  {
    online = true,
    waitingForUser = source.waiting_for_user,
    targetName,
  }: {
    online?: boolean;
    waitingForUser?: boolean;
    targetName?: string;
  } = {},
): ActivityPresentation {
  const view = (
    label: string,
    state: AvatarState,
    isLoading = false,
    tone: ActivityPresentation["tone"] = "neutral",
  ) => ({ label, state, isLoading, tone });
  if (source.status === "unknown") return view("The result needs a check.", "error");
  if (source.status === "failed") return view("I couldn’t finish this.", "error", false, "danger");
  if (source.status === "cancelled") return view("Stopped.", "idle");
  if (!online) return view("Reconnecting…", "idle");
  if (source.status === "cancel_requested" || source.activity === "stopping")
    return view("Stopping…", "working", true);
  if (waitingForUser) return view("Waiting for your reply…", "listening");
  if (
    source.status === "running" &&
    source.native_progress?.compactions.some((entry) => entry.state === "in_progress")
  )
    return view("Making room to continue…", "working", true);
  if (source.status === "queued") {
    if (source.preparation?.state === "blocked")
      return view("I couldn’t get started.", "error", false, "danger");
    if (source.preparation?.state === "preparing") return view("Getting ready…", "thinking", true);
    if (source.preparation?.state === "retrying") return view("Reconnecting…", "thinking", true);
    return view("Waiting to start…", "idle");
  }
  if (source.status === "dispatching") return view("Getting ready…", "thinking", true);
  if (source.status === "running") {
    const kind = source.active_tools?.at(-1)?.kind;
    const labels: Record<string, string> = {
      searching: "Searching the web…",
      reading: "Reading your file…",
      updating: "Updating your file…",
      creating: "Creating a file…",
      browsing: "Looking through a page…",
      asking_agent: targetName ? `Asking @${targetName} for help…` : "Asking for help…",
    };
    if (kind || source.activity === "tool_running")
      return view(labels[kind ?? ""] ?? "Working on it…", "working", true);
    return view(
      source.activity === "generating" ? stableLabel(thinkingLabels, source.id) : "Working on it…",
      "thinking",
      true,
    );
  }
  if (source.status === "steered") return view("Got your update.", "idle");
  return view("Ready when you are.", "idle");
}
