import { isIP } from "node:net";
import { z } from "zod";

export type WebResearchConfig = {
  endpoint: URL;
  token?: string;
  localOrigin?: string;
};

export function webResearchConfig(
  endpoint: string | undefined,
  token: string | undefined,
  development: boolean,
): WebResearchConfig | undefined {
  token = token?.trim() || undefined;
  if (!endpoint && !token) return;
  const url = URL.parse(endpoint ?? "https://api.firecrawl.dev/");
  if (!url) throw new Error("Invalid Firecrawl configuration.");
  const loopback = development && ["127.0.0.1", "[::1]"].includes(url.hostname);
  if (
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    !(url.protocol === "https:" || (loopback && url.protocol === "http:")) ||
    (!token && !loopback) ||
    (token !== undefined && !/^[\x21-\x7e]{1,4096}$/.test(token))
  )
    throw new Error("Invalid Firecrawl configuration.");
  url.pathname = `${url.pathname.replace(/\/+$/, "")}/`;
  return { endpoint: url, token, localOrigin: loopback ? url.origin : undefined };
}

export function webPageUrl(raw: string, localOrigin?: string) {
  const url = URL.parse(raw);
  if (!url || !["http:", "https:"].includes(url.protocol) || url.username || url.password)
    return null;
  const host = url.hostname.replace(/\.$/, "");
  if (
    url.origin !== localOrigin &&
    (isIP(host.replace(/^\[|\]$/g, "")) ||
      !host.includes(".") ||
      /\.(?:localhost|local|internal|lan)$/i.test(host))
  )
    return null;
  if (
    [...url.searchParams.keys()].some((key) =>
      /token|ticket|key|secret|password|credential|signature|session|auth|^sig$/i.test(key),
    )
  )
    return null;
  url.hash = "";
  return url.href.length <= 4000 ? url.href : null;
}

export const webSearch = z.strictObject({
  query: z.string().trim().min(1).max(500),
  limit: z.int().min(1).max(10).default(5),
});
export const webExtract = z.strictObject({ url: z.url().max(4000) });
