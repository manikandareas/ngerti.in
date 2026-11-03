import type { Run } from "@/types/workspace";
import { activityPresentation } from "./activity-presentation";
export function runStatusLabel(run: Pick<Run, "status" | "preparation">) {
  return activityPresentation(run).label;
}
