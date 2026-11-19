import { z } from "zod";
import { DomainError } from "../contracts";
import { authorizeResponsibilityWork } from "../goals/work-fence";
import { productToolSchemas } from "../harness/product-tool-contracts";
import type { ProductTools, ToolAccess } from "../harness/tools";
import { type WebResearchConfig, webExtract, webPageUrl, webSearch } from "./contracts";

const searchResult = z.object({
  success: z.literal(true),
  data: z.object({
    web: z
      .array(
        z.object({
          url: z.string(),
          title: z.string().nullish(),
          description: z.string().nullish(),
        }),
      )
      .max(100)
      .default([]),
  }),
});
const extractResult = z.object({
  success: z.literal(true),
  data: z.object({
    markdown: z.string().trim().min(1),
    metadata: z
      .object({
        title: z.string().nullish(),
        sourceURL: z.string().nullish(),
        url: z.string().nullish(),
      })
      .optional(),
  }),
});

async function responseJson(response: Response) {
  if (!response.ok || !response.body) throw new DomainError("WEB_UNAVAILABLE", 503);
  const reader = response.body.getReader();
  const decoder = new TextDecoder("utf-8", { fatal: true });
  let bytes = 0;
  let result = "";
  while (true) {
    const part = await reader.read();
    if (part.done) return JSON.parse(result + decoder.decode());
    bytes += part.value.length;
    if (bytes > 1024 * 1024) {
      await reader.cancel();
      throw new DomainError("WEB_UNAVAILABLE", 503);
    }
    result += decoder.decode(part.value, { stream: true });
  }
}

async function research<T>(
  backend: WebResearchConfig,
  action: "search" | "scrape",
  input: unknown,
  schema: z.ZodType<T>,
): Promise<T> {
  try {
    const response = await fetch(new URL(`v2/${action}`, backend.endpoint), {
      method: "POST",
      redirect: "error",
      signal: AbortSignal.timeout(22_000),
      headers: {
        "Content-Type": "application/json",
        ...(backend.token ? { Authorization: `Bearer ${backend.token}` } : {}),
      },
      body: JSON.stringify(input),
    });
    return schema.parse(await responseJson(response));
  } catch {
    throw new DomainError("WEB_UNAVAILABLE", 503);
  }
}

export function registerWebResearchTools(tools: ProductTools, backend: WebResearchConfig) {
  const { lifecycle } = tools;
  const authorize = async (access: ToolAccess) => {
    await access.authorize();
    await authorizeResponsibilityWork(lifecycle, access.scope.run_id);
  };
  tools.register("ngertiin.web_search", {
    schema: productToolSchemas["ngertiin.web_search"],
    resources: () => [],
    execute: async (input, access) => {
      const { query, limit } = webSearch.parse(input);
      await authorize(access);
      const { data } = await research(
        backend,
        "search",
        {
          query,
          limit,
          sources: [{ type: "web" }],
          timeout: 18_000,
        },
        searchResult,
      );
      await authorize(access);
      const hits = new Map<string, { url: string; title: string; snippet: string }>();
      for (const hit of data.web) {
        const url = webPageUrl(hit.url, backend.localOrigin);
        if (!url || hits.has(url)) continue;
        hits.set(url, {
          url,
          title: (hit.title || url).slice(0, 500),
          snippet: (hit.description ?? "").slice(0, 1000),
        });
        if (hits.size === limit) break;
      }
      return { sources: [...hits.values()] };
    },
  });
  tools.register("ngertiin.web_extract", {
    schema: productToolSchemas["ngertiin.web_extract"],
    resources: () => [],
    execute: async (input, access) => {
      const requested = webPageUrl(webExtract.parse(input).url, backend.localOrigin);
      if (!requested) throw new DomainError("INVALID_REQUEST", 422);
      await authorize(access);
      const { data } = await research(
        backend,
        "scrape",
        {
          url: requested,
          formats: ["markdown"],
          onlyMainContent: true,
          timeout: 18_000,
        },
        extractResult,
      );
      const url = webPageUrl(
        data.metadata?.url ?? data.metadata?.sourceURL ?? requested,
        backend.localOrigin,
      );
      if (!url) throw new DomainError("WEB_UNAVAILABLE", 503);
      const title = (data.metadata?.title || url).slice(0, 500);
      await lifecycle.store.transaction(async () => {
        await authorize(access);
        const run = await lifecycle.store.get("run", access.scope.run_id);
        if (!run.dispatch_token) throw new DomainError("STALE_DISPATCH");
        await lifecycle.observe(run.id, run.dispatch_token, {
          sources: [
            ...run.sources.filter((source) => source.url !== url),
            { url, title, operation: "openPage" as const },
          ].slice(-100),
        });
      });
      return {
        url,
        title,
        markdown: data.markdown.slice(0, 32_000),
        truncated: data.markdown.length > 32_000,
      };
    },
  });
}
