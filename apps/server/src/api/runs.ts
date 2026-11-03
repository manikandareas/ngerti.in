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
        const control = command(request, body, () =>
          controls.requestSteer(params.id, body),
        ) as ReturnType<RunControls["requestSteer"]>;
        return services.broker.dispatchSteer(control.id);
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
      ({ request, params, body }) => command(request, body, () => controls.edit(params.id, body)),
      { params: z.object({ id }), body: queueEdit },
    )
    .post(
      "/v1/messages/:id/delete",
      ({ request, params, body }) => command(request, body, () => controls.remove(params.id, body)),
      { params: z.object({ id }), body: queueDelete },
    )
    .get(
      "/v1/runs/:id/interactions/history",
      ({ params }) => new InteractionJournal(lifecycle.store).history(params.id),
      { params: z.object({ id }) },
    )
    .get(
      "/v1/runs/:id/interactions",
      ({ params }) => {
        if (!services.broker) throw new HarnessError("ADAPTER_UNAVAILABLE");
        return services.broker.interactions(params.id);
      },
      { params: z.object({ id }) },
    )
    .post(
      "/v1/runs/:id/interactions",
      ({ params, body }) => {
        if (!services.broker) throw new HarnessError("ADAPTER_UNAVAILABLE");
        return services.broker.respond(params.id, body);
      },
      { params: z.object({ id }), body: interactionAnswer },
    )
    .post(
      "/v1/runs",
      ({ request, body }) => {
        const submissions = new AttachmentSubmissions(lifecycle);
        const result = command(request, body, () =>
          body.submission_id
            ? submissions.commit(body, id.parse(request.headers.get("Idempotency-Key")))
            : controls.send(body),
        );
        submissions.materialize(result.message);
        background.notifyControls();
        return result;
      },
      {
        body: admissionInput,
      },
    )
    .post(
      "/v1/runs/:id/retry-preparation",
      ({ request, params, body }) =>
        command(request, body, () => lifecycle.retryPreparation(params.id, body.expected_revision)),
      { params: z.object({ id }), body: z.strictObject({ expected_revision: z.int().positive() }) },
    )
    .post(
      "/v1/runs/:id/cancel",
      ({ request, params }) => {
        const result = command(request, {}, () => lifecycle.cancel(params.id));
        background.notifyControls();
        return result;
      },
      { params: z.object({ id }) },
    );
}
