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
    .get("/v1/browser/profiles", ({ query }) => browsers.list(browserScope.parse(query)), {
      query: browserScope,
    })
    .post(
      "/v1/browser/profiles",
      ({ request, body }) => command(request, body, () => browsers.create(body)),
      { body: browserProfileInput },
    )
    .post(
      "/v1/browser/profiles/:id/grants",
      ({ request, params, body }) =>
        command(request, body, () =>
          browsers.grant(params.id, body.expected_revision, body.profile),
        ),
      {
        params: z.object({ id }),
        body: z.strictObject({
          expected_revision: z.int().positive(),
          profile: browserProfileInput,
        }),
      },
    )
    .post("/v1/browser/profiles/:id/open", ({ params, body }) => browsers.open(params.id, body), {
      params: z.object({ id }),
      body: browserScope,
    })
    .get("/v1/browser/sessions/:id", ({ params, query }) => browsers.observe(params.id, query), {
      params: z.object({ id }),
      query: browserScope,
    })
    .get(
      "/v1/browser/sessions/:id/receipts",
      ({ params, query }) => browsers.receipts(params.id, query),
      { params: z.object({ id }), query: browserScope },
    )
    .post(
      "/v1/browser/sessions/:id/view",
      ({ params, body, request }) => {
        browserViews ??= new BrowserViews(browsers);
        return browserViews.issue(params.id, body, new URL(request.url).origin);
      },
      { params: z.object({ id }), body: browserScope },
    )
    .post(
      "/v1/browser/sessions/:id/control",
      ({ params, body }) => browsers.control(params.id, body, body.operation),
      {
        params: z.object({ id }),
        body: browserScope.extend({ operation: z.enum(["detach", "close", "reset"]) }),
      },
    );
}
