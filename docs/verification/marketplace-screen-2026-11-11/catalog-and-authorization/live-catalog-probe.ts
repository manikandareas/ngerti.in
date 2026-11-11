import { developmentConfig } from "../../../../apps/server/src/config";
import { ComposioHost } from "../../../../apps/server/src/integrations/host";
const report: Record<string, unknown> = { checked_at: new Date().toISOString(), provider: "Composio", inference: false, authorization: false };
try {
  const config = developmentConfig();
  const host = new ComposioHost();
  const first = await host.catalog(config.owner_id, "");
  const pages = [first];
  while (pages.at(-1)?.cursor && pages.length < 100) pages.push(await host.catalog(config.owner_id, "", pages.at(-1)!.cursor));
  const items = pages.flatMap((page) => page.items);
  Object.assign(report, { passed: true, pages: pages.length, items: items.length, logos: items.filter((item) => item.logo).length, descriptions: items.filter((item) => item.description).length, categories: items.filter((item) => item.categories?.length).length, tools_counts: items.filter((item) => item.tools_count !== undefined).length, more_available: Boolean(pages.at(-1)?.cursor), metadata_complete: pages.every((page) => page.metadata_complete) });
} catch { Object.assign(report, { passed: false, error: "Provider catalog unavailable; no credentials or provider exception retained." }); }
await Bun.write(new URL("./live-catalog.json", import.meta.url), JSON.stringify(report, null, 2) + "\n");
console.log(JSON.stringify(report));
