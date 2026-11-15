import { lstat, readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { developmentConfig } from "../config";
import type { AuthenticationEmail } from "./email";

export async function inboxMessages(directory: string) {
  let files: string[];
  try {
    files = await readdir(directory);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw error;
  }
  const messages: (AuthenticationEmail & { created_at: string })[] = [];
  for (const name of files
    .filter((name) => /^\d+-[a-f0-9-]+\.json$/.test(name))
    .sort()
    .reverse()
    .slice(0, 100)) {
    const path = join(directory, name);
    const info = await lstat(path);
    if (!info.isFile() || info.isSymbolicLink() || info.mode & 0o077 || info.size > 65536)
      throw new Error("A development email has invalid permissions or format.");
    messages.push(JSON.parse(await readFile(path, "utf8")));
  }
  return messages;
}

const escapeHtml = (value: string) =>
  value.replace(
    /[&<>"']/g,
    (character) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        character
      ] as string,
  );

export function startDevelopmentInbox(directory: string, port = 8025) {
  return Bun.serve({
    hostname: "127.0.0.1",
    port,
    async fetch(request, server) {
      const host = `127.0.0.1:${server.port}`;
      if (
        request.headers.get("Host") !== host ||
        request.headers.get("Sec-Fetch-Site") === "cross-site" ||
        (request.headers.has("Origin") && request.headers.get("Origin") !== `http://${host}`)
      )
        return new Response("Forbidden", { status: 403 });
      if (request.method !== "GET" || new URL(request.url).pathname !== "/")
        return new Response("Not found", { status: 404 });
      const messages = await inboxMessages(directory);
      return new Response(
        `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>Ngertiin development inbox</title><style>body{font:16px system-ui;max-width:720px;margin:48px auto;padding:0 24px;line-height:1.6}article{padding:20px 0;border-bottom:1px solid #ddd}small{color:#666}a{overflow-wrap:anywhere}</style><h1>Development inbox</h1><p>Local verification, password reset and organization invitations.</p><p><a href="/">Refresh inbox</a></p>${messages.length ? messages.map((message) => `<article><strong>${escapeHtml(message.to)}</strong> · ${escapeHtml(message.purpose)}<br><small>${escapeHtml(message.created_at)}</small><p><a href="${escapeHtml(message.url)}" rel="noreferrer">Open ${escapeHtml(message.purpose)} link</a></p></article>`).join("") : "<p>No messages yet.</p>"}</html>`,
        {
          headers: {
            "Content-Type": "text/html; charset=utf-8",
            "Cache-Control": "no-store",
            "X-Content-Type-Options": "nosniff",
            "Content-Security-Policy":
              "default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; frame-ancestors 'none'",
          },
        },
      );
    },
  });
}

if (import.meta.main) {
  const config = developmentConfig();
  if (config.authentication.email.delivery !== "local")
    throw new Error("The local inbox is available only with development email delivery.");
  const server = startDevelopmentInbox(config.authentication.email.directory);
  console.log(`Development email inbox: http://127.0.0.1:${server.port}`);
}
