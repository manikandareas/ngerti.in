import type { Elysia } from "elysia";
import { z } from "zod";
import { AttachmentSubmissions } from "../attachments/submissions";
import type { Background } from "../background";
import { DomainError, id } from "../contracts";
import { Creation, groupConfiguration } from "../conversations/creation";
import { groupMessage, membershipUpdate, routeRetry } from "../groups/contracts";
import { Groups } from "../groups/service";
import { interactionReply } from "../interactions/contracts";
import type { Lifecycle } from "../lifecycle";
import type { Command } from "./services";

export function registerGroupRoutes(
  api: Elysia,
  lifecycle: Lifecycle,
  background: Background,
  command: Command,
) {
  const groups = new Groups(lifecycle);
  return api
    .get(
      "/v1/groups/:id/routes/:routeId/decision",
      ({ params }) => {
        const group = lifecycle.store.get("thread", params.id);
        const route = lifecycle.store.get("group_route", params.routeId);
        if (
          group.type !== "group" ||
          group.purpose !== "conversation" ||
          route.thread_id !== group.id
        )
          throw new DomainError("SCOPE_DENIED", 403);
        const trace = lifecycle.store.routingTrace(route.id);
        return { trace: trace?.attempt_id === route.routing?.attempt_id ? trace : null };
      },
      { params: z.object({ id, routeId: id }) },
    )
    .post(
      "/v1/groups/:id/configuration",
      ({ request, params, body }) =>
        command(request, body, () => new Creation(lifecycle).configureGroup(params.id, body)),
      { params: z.object({ id }), body: groupConfiguration },
    )
    .post(
      "/v1/groups/:id/membership",
      ({ request, params, body }) => {
        const result = command(request, body, () => groups.membership(params.id, body));
        background.notifyControls();
        return result;
      },
      { params: z.object({ id }), body: membershipUpdate },
    )
    .post(
      "/v1/groups/:id/messages",
      ({ request, params, body }) => {
        const submissions = new AttachmentSubmissions(lifecycle);
        const result = command(request, body, () =>
          body.submission_id
            ? submissions.commitGroup(
                params.id,
                body,
                id.parse(request.headers.get("Idempotency-Key")),
              )
            : groups.send(params.id, body),
        );
        void submissions
          .materialize(lifecycle.store.get("message", result.message_id))
          .catch(() => {});
        return result;
      },
      { params: z.object({ id }), body: groupMessage },
    )
    .post(
      "/v1/groups/:id/routes/:routeId/retry",
      ({ request, params, body }) =>
        command(request, body, () => groups.retry(params.id, params.routeId, body)),
      { params: z.object({ id, routeId: id }), body: routeRetry },
    )
    .post(
      "/v1/human-requests/:id/reply",
      ({ request, params, body }) => command(request, body, () => groups.reply(params.id, body)),
      { params: z.object({ id }), body: interactionReply },
    );
}
