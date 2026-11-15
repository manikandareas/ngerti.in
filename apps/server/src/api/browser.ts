import type { Elysia } from "elysia";
import { z } from "zod";
import { browserCapabilities, browserProfileInput, browserScope } from "../browser/contracts";
import { BrowserViews } from "../browser/view";
import { id } from "../contracts";
import type { ApiServices, Command } from "./services";

export function registerBrowserRoutes(api: Elysia, services: ApiServices, command: Command) {
  if (services.tools.machines) return api;
  const browsers = services.tools.browsers;
  let browserViews: BrowserViews | undefined;
  api.onStop(() => browserViews?.close());
  return api
    .get("/v1/browser/contracts", () => browserCapabilities())
    .get(
      "/v1/browser/profiles",
      async ({ query }) => await browsers.list(browserScope.parse(query)),
      {
        query: browserScope,
      },
    )
    .post(
      "/v1/browser/profiles",
      async ({ request, body }) =>
        await command(request, body, async () => await browsers.create(body)),
      { body: browserProfileInput },
    )
    .post(
      "/v1/browser/profiles/:id/grants",
      async ({ request, params, body }) =>
        await command(
          request,
          body,
          async () => await browsers.grant(params.id, body.expected_revision, body.profile),
        ),
      {
        params: z.object({ id }),
        body: z.strictObject({
          expected_revision: z.int().positive(),
          profile: browserProfileInput,
        }),
      },
    )
    .post(
      "/v1/browser/profiles/:id/open",
      async ({ params, body }) => browsers.open(params.id, body),
      {
        params: z.object({ id }),
        body: browserScope,
      },
    )
    .get(
      "/v1/browser/sessions/:id",
      async ({ params, query }) => browsers.observe(params.id, query),
      {
        params: z.object({ id }),
        query: browserScope,
      },
    )
    .get(
      "/v1/browser/sessions/:id/receipts",
      async ({ params, query }) => await browsers.receipts(params.id, query),
      { params: z.object({ id }), query: browserScope },
    )
    .post(
      "/v1/browser/sessions/:id/view",
      async ({ params, body, request }) => {
        browserViews ??= new BrowserViews(browsers);
        const lease = services.authentication.lease(request);
        try {
          return await browserViews.issue(params.id, body, new URL(request.url).origin, lease);
        } catch (error) {
          lease?.release();
          throw error;
        }
      },
      { params: z.object({ id }), body: browserScope },
    )
    .post(
      "/v1/browser/sessions/:id/control",
      async ({ params, body }) => browsers.control(params.id, body, body.operation),
      {
        params: z.object({ id }),
        body: browserScope.extend({ operation: z.enum(["detach", "close", "reset"]) }),
      },
    );
}
