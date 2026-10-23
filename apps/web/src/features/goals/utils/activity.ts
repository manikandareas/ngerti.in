import { evidenceLabels, type GoalDetail, type GoalOperation } from "../types";

const activityLabels: Record<GoalOperation, string> = {
  create: "Tujuan ditambahkan",
  update: "Tujuan diperbarui",
  pause: "Tujuan dijeda",
  resume: "Tujuan dilanjutkan",
  complete: "Tujuan diselesaikan",
  archive: "Tujuan diarsipkan",
  evidence: "Bukti kemajuan dicatat",
};

export function goalActivity(goal: Pick<GoalDetail, "history" | "evidence_history">) {
  return [
    ...goal.history
      .filter((item) => item.operation !== "evidence")
      .map((item) => ({
        id: `revision:${item.revision}`,
        createdAt: item.created_at,
        title:
          item.operation === "create" ? `Added ${item.spec.title}` : activityLabels[item.operation],
        description: item.spec.next_action || item.spec.target,
      })),
    ...goal.evidence_history.map((item) => ({
      id: item.id,
      createdAt: item.created_at,
      title: `Bukti dicatat · ${evidenceLabels[item.state]}`,
      description: item.note,
    })),
  ].sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
}
