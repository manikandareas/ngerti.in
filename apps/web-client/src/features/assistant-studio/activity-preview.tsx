import { AgentActivityBubble } from "@/features/conversation/components/agent-activity-bubble";
import { WorkActivity } from "@/features/conversation/components/work-activity";
import type { Run, Snapshot } from "@/types/workspace";
import { inputMessage, sampleRun, sampleSnapshot, skinny, tobi } from "./fixtures";
import { ProductInputPreview } from "./interaction-previews";

export function ActivityPreview({
  variant,
  group,
  notify,
}: {
  variant: string;
  group: boolean;
  notify: (message: string) => void;
}) {
  if (variant === "waiting")
    return (
      <ProductInputPreview
        variant="single"
        group={group}
        open={() => notify("Profil Tobi · contoh lokal di studio.")}
      />
    );
  const changes: Partial<Run> = {};
  if (
    ["searching", "reading", "updating", "creating", "browsing", "asking_agent"].includes(variant)
  ) {
    changes.activity = "tool_running";
    changes.active_tools = [
      {
        call_id: "studio-tool",
        kind: variant,
        target_agent_id: variant === "asking_agent" ? skinny.id : null,
      },
    ];
  } else if (variant === "working") changes.activity = "working";
  else if (variant === "queued") changes.status = "queued";
  else if (["preparing", "retrying", "blocked"].includes(variant)) {
    changes.status = "queued";
    changes.preparation = {
      state: variant as "preparing" | "retrying" | "blocked",
      attempts: 1,
      next_attempt_at: null,
    };
    if (variant === "blocked")
      changes.diagnostic = {
        code: "LOGIN_REQUIRED",
        category: "authentication",
        outcome: "not_dispatched",
      };
  } else if (variant === "stopping") {
    changes.status = "cancel_requested";
    changes.cancellation = "requested";
  } else if (["cancelled", "failed", "unknown"].includes(variant)) {
    changes.status = variant;
    if (variant === "failed")
      changes.diagnostic = {
        code: "AUTH_REJECTED",
        category: "authentication",
        outcome: "unknown",
      };
  }
  return (
    <AgentActivityBubble
      agent={tobi}
      run={sampleRun(changes)}
      online={variant !== "offline"}
      waitingForUser={variant === "waiting"}
      targetName={skinny.name}
      showName={group}
      busy={false}
      openAgent={() => notify("Profil Tobi · contoh lokal di studio.")}
      openSettings={() => notify("Di percakapan, tindakan ini membuka Settings koneksi.")}
      retryPreparation={() =>
        notify("Contoh mencoba persiapan ulang. Tidak ada run yang dijalankan.")
      }
      reconcile={() => notify("Contoh pemeriksaan status. Tidak ada permintaan ke harness.")}
    />
  );
}

export function RoutingPreview({
  variant,
  notify,
}: {
  variant: string;
  notify: (message: string) => void;
}) {
  type Stage = NonNullable<Snapshot["routes"][number]["execution"]>["stage"];
  const route: Snapshot["routes"][number] = {
    id: "studio-route-3",
    revision: 1,
    message_id: inputMessage.id,
    selected_agent_id: null,
    state: ["rejected", "unknown"].includes(variant) ? variant : "pending",
    error_code: variant === "blocked" ? "LOGIN_REQUIRED" : null,
    clarification: "Kamu ingin Tobi menyusun panduan atau Skinny memeriksa datanya?",
    execution: {
      stage: variant === "unknown" ? "reconcile" : (variant as Stage),
      run_id: "studio-router",
      run_revision: 1,
      retry_preparation: variant === "blocked",
      diagnostic:
        variant === "blocked"
          ? { code: "LOGIN_REQUIRED", category: "authentication", outcome: "not_dispatched" }
          : null,
    },
  };
  return (
    <WorkActivity
      message={inputMessage}
      snapshot={sampleSnapshot({ routes: [route] })}
      busy={false}
      retryRoute={() => notify("Contoh mengulang pemilihan penjawab di studio.")}
      retryPreparation={() => notify("Contoh menyambungkan penjawab kembali di studio.")}
    />
  );
}
