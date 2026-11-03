import type { Elysia } from "elysia";
import { z } from "zod";
import { stagedUploadInput } from "../attachments/contracts";
import { AttachmentSubmissions } from "../attachments/submissions";
import { id, message, run } from "../contracts";
import { groupRoute } from "../groups/contracts";
import type { Lifecycle } from "../lifecycle";

const admission = z.object({ message, run: run.nullable(), control: z.null() });
const submissionResult = z.union([admission, groupRoute]);
export const submissionStatus = z.discriminatedUnion("state", [
  z.strictObject({ state: z.literal("committed"), result: submissionResult }),
  z.strictObject({ state: z.literal("pending") }),
  z.strictObject({ state: z.literal("missing") }),
]);

export function registerAttachmentRoutes(api: Elysia, lifecycle: Lifecycle) {
  const submissions = new AttachmentSubmissions(lifecycle);
  submissions.recover();
  return api
    .post(
      "/v1/message-uploads",
      ({ request, body }) =>
        submissions.stage(id.parse(request.headers.get("Idempotency-Key")), body),
      { body: stagedUploadInput },
    )
    .get(
      "/v1/message-submissions/:id",
      ({ params }) => {
        const receipt = submissionResult.safeParse(lifecycle.store.receipt(params.id));
        if (receipt.success) return { state: "committed" as const, result: receipt.data };
        return {
          state: lifecycle.store
            .list("attachment_upload")
            .some((item) => item.submission_id === params.id && item.state === "staged")
            ? ("pending" as const)
            : ("missing" as const),
        };
      },
      { params: z.object({ id }) },
    );
}
