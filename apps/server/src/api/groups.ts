import type { Elysia } from "elysia";
import { z } from "zod";
import type { Background } from "../background";
import { id } from "../contracts";
import { Creation, groupConfiguration } from "../conversations/creation";
import { groupMessage, humanReply, membershipUpdate } from "../groups/contracts";
import { Groups } from "../groups/service";
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
      ({ request, params, body }) => command(request, body, () => groups.send(params.id, body)),
      { params: z.object({ id }), body: groupMessage },
    )
    .post(
      "/v1/human-requests/:id/reply",
      ({ request, params, body }) => command(request, body, () => groups.reply(params.id, body)),
      { params: z.object({ id }), body: humanReply },
    );
}
