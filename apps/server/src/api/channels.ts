import type { Elysia } from "elysia";
import { z } from "zod";
import { id } from "../contracts";
import { channelEvent, channelId, type ManagedChannel } from "../integrations/channel-contracts";
import { Channels, channelReceipt } from "../integrations/channels";
import type { Lifecycle } from "../lifecycle";
import type { ScopedData } from "../organizations/data";

export function registerChannelRoutes(api: Elysia, lifecycle: Lifecycle, scoped: ScopedData) {
  const channels = new Channels(lifecycle);
  const params = z.strictObject({ channel: channelId });
  async function authorize<T>(
    request: Request,
    id: string,
    action: (route: ManagedChannel) => Promise<T>,
  ) {
    const route = channels.authorize(request, id);
    const scope = await scoped.channelContext(route.user_id, route.organization_id);
    await scope.validate(true);
    const result = await lifecycle.store.withDataContext(scope, () => action(route));
    await scope.validate(true);
    return result;
  }
  return api
    .post(
      "/v1/channels/:channel/events",
      ({ request, params, body }) =>
        authorize(request, params.channel, async (route) =>
          channelReceipt(await channels.admit(route, body)),
        ),
      { params, body: channelEvent },
    )
    .get(
      "/v1/channels/:channel/exchanges/:id",
      ({ request, params }) =>
        authorize(request, params.channel, async (route) =>
          channelReceipt(await channels.exchange(route, params.id)),
        ),
      { params: params.extend({ id }) },
    )
    .get(
      "/v1/channels/:channel/exchanges/:id/artifacts/:artifactId",
      ({ request, params }) =>
        authorize(request, params.channel, async (route) => {
          const { artifact, bytes } = await channels.attachment(
            route,
            params.id,
            params.artifactId,
          );
          return new Response(bytes, {
            headers: {
              "Content-Type": artifact.media_type,
              "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(artifact.name)}`,
              "X-Content-Type-Options": "nosniff",
              "Cache-Control": "no-store",
              ETag: `"${artifact.sha256}"`,
            },
          });
        }),
      { params: params.extend({ id, artifactId: id }) },
    );
}
