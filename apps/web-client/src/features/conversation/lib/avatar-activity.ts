import type { AvatarState } from "@/features/avatar/engine/catalog";
import type { AgentActivity } from "@/types/workspace";
import { runStatusLabel } from "./run-status";

export function avatarActivity(
  activity?: AgentActivity,
  online = true,
  composing = false,
): { state: AvatarState; label: string } {
  if (!online) return { state: "error", label: "Koneksi terputus" };
  if (activity?.status === "cancel_requested" || activity?.activity === "stopping")
    return { state: "working", label: "Stop diminta" };
  if (activity?.status === "unknown") return { state: "error", label: "Hasil belum diketahui" };
  if (activity?.waiting_for_user) return { state: "listening", label: "Menunggu kamu" };
  if (activity?.status === "dispatching")
    return { state: "thinking", label: runStatusLabel(activity) };
  if (activity?.status === "running")
    return activity.activity === "tool_running"
      ? { state: "working", label: "Sedang bekerja" }
      : { state: "thinking", label: "Berpikir" };
  if (activity?.status === "queued")
    return {
      state:
        activity.preparation?.state === "blocked"
          ? "error"
          : activity.preparation?.state === "preparing"
            ? "thinking"
            : "idle",
      label: runStatusLabel(activity),
    };
  if (activity?.status === "failed") return { state: "error", label: "Perlu bantuan" };
  if (composing) return { state: "listening", label: "Mendengarkan" };
  return { state: "idle", label: activity?.status === "cancelled" ? "Dihentikan" : "Siap" };
}
