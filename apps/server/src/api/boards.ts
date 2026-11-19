import type { Elysia } from "elysia";
import { z } from "zod";
import type { Background } from "../background";
import { boardResume, newBoardCard } from "../boards/contracts";
import { Boards } from "../boards/service";
import { id } from "../contracts";
import type { Lifecycle } from "../lifecycle";
import type { Command } from "./services";

export function registerBoardRoutes(
  api: Elysia,
  lifecycle: Lifecycle,
  background: Background,
  command: Command,
) {
  const boards = new Boards(lifecycle);
  return api
    .get("/v1/boards/cards", async () => await boards.list())
    .post(
      "/v1/boards/cards",
      async ({ request, body }) => await command(request, body, () => boards.create(body)),
      { body: newBoardCard },
    )
    .post(
      "/v1/boards/cards/:id/start",
      async ({ request, params, body }) => {
        const card = await command(request, body, () =>
          boards.start(params.id, body.expected_revision),
        );
        if (card.current_run_id) background.notifyAdmission(card.thread_id, card.assignee_agent_id);
        return card;
      },
      { params: z.object({ id }), body: z.strictObject({ expected_revision: z.int().positive() }) },
    )
    .post(
      "/v1/boards/cards/:id/resume",
      async ({ request, params, body }) => {
        const card = await command(request, body, () => boards.resume(params.id, body));
        if (card.current_run_id && ["running", "review"].includes(card.state)) {
          const run = await lifecycle.store.get("run", card.current_run_id);
          background.notifyAdmission(run.thread_id, run.agent_id);
        }
        return card;
      },
      { params: z.object({ id }), body: boardResume },
    );
}
