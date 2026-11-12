import type { Elysia } from "elysia";
import { z } from "zod";
import { AttachmentSubmissions } from "../attachments/submissions";
import type { Background } from "../background";
import { admissionInput, id, queueDelete, queueEdit, steerInput } from "../contracts";
import { HarnessError, interactionAnswer } from "../harness/contracts";
import type { Lifecycle } from "../lifecycle";
import { RunControls } from "../run-controls";
import { InteractionJournal } from "../runs/interaction-journal";
import type { ApiServices, Command } from "./services";

export function registerRunRoutes(
  api: Elysia,
  lifecycle: Lifecycle,
  background: Background,
  services: ApiServices,
  command: Command,
) {
  const controls = new RunControls(lifecycle);
  return api
    .post(
      "/v1/runs/:id/steer",
      async ({ request, params, body }) => {
        if (!services.broker) throw new HarnessError("ADAPTER_UNAVAILABLE");
        const control = (await command(
          request,
          body,
          async () => await controls.requestSteer(params.id, body),
        )) as Awaited<ReturnType<RunControls["requestSteer"]>>;
        return await services.broker.dispatchSteer(control.id);
      },
      { params: z.object({ id }), body: steerInput },
    )
    .post(
      "/v1/runs/:id/reconcile",
      ({ params }) => {
        if (!services.broker) throw new HarnessError("ADAPTER_UNAVAILABLE");
        return services.broker.reconcile(params.id);
      },
      { params: z.object({ id }), body: z.strictObject({}) },
    )
    .post(
      "/v1/messages/:id/edit",
      async ({ request, params, body }) =>
        await command(request, body, async () => await controls.edit(params.id, body)),
      { params: z.object({ id }), body: queueEdit },
    )
    .post(
      "/v1/messages/:id/delete",
      async ({ request, params, body }) =>
        await command(request, body, async () => await controls.remove(params.id, body)),
      { params: z.object({ id }), body: queueDelete },
    )
    .get(
      "/v1/runs/:id/interactions/history",
      async ({ params }) => await new InteractionJournal(lifecycle.store).history(params.id),
      { params: z.object({ id }) },
    )
    .get(
      "/v1/runs/:id/interactions",
      async ({ params }) => {
        if (!services.broker) throw new HarnessError("ADAPTER_UNAVAILABLE");
        return services.broker.interactions(params.id);
      },
      { params: z.object({ id }) },
    )
    .post(
      "/v1/runs/:id/interactions",
      async ({ params, body }) => {
        if (!services.broker) throw new HarnessError("ADAPTER_UNAVAILABLE");
        return services.broker.respond(params.id, body);
      },
      { params: z.object({ id }), body: interactionAnswer },
    )
    .post(
      "/v1/runs",
      async ({ request, body }) => {
        const submissions = new AttachmentSubmissions(lifecycle);
        const result = await command(request, body, async () =>
          body.submission_id
            ? await submissions.commit(body, id.parse(request.headers.get("Idempotency-Key")))
            : await controls.send(body),
        );
        void submissions.materialize(result.message).catch(() => {});
        await background.notifyControls();
        return result;
      },
      {
        body: admissionInput,
      },
    )
    .post(
      "/v1/runs/:id/retry",
      async ({ request, params, body }) =>
        await command(
          request,
          body,
          async () => await controls.retry(params.id, body.expected_revision),
        ),
      { params: z.object({ id }), body: z.strictObject({ expected_revision: z.int().positive() }) },
    )
    .post(
      "/v1/runs/:id/retry-preparation",
      async ({ request, params, body }) =>
        await command(
          request,
          body,
          async () => await lifecycle.retryPreparation(params.id, body.expected_revision),
        ),
      { params: z.object({ id }), body: z.strictObject({ expected_revision: z.int().positive() }) },
    )
    .post(
      "/v1/runs/:id/cancel",
      async ({ request, params }) => {
        const result = await command(request, {}, async () => await lifecycle.cancel(params.id));
        await background.notifyControls();
        return result;
      },
      { params: z.object({ id }) },
    );
}
