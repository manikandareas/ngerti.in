import type { BackgroundTask, TaskCommand } from "@/features/tasks/types";

export function getTaskCommandRequest(
  task: BackgroundTask,
  action: TaskCommand,
  requestKey: string,
  draft?: string,
): { path: string; body: object | undefined } {
  if (action === "approve" || action === "reject") {
    return {
      path: `/approvals/${task.action?.id}/decision`,
      body: { revision: task.revision, approved: action === "approve", request_key: requestKey },
    };
  }

  const path = `/tasks/${task.id}/${action}`;
  if (action === "revise") {
    return { path, body: { revision: task.revision, draft, request_key: requestKey } };
  }
  if (action === "retry") return { path, body: { request_key: requestKey } };
  return { path, body: undefined };
}
