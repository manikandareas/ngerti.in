import { createReadStream, existsSync, statSync } from "node:fs";
import {
  createServer,
  request as httpRequest,
  type IncomingMessage,
  type OutgoingHttpHeaders,
  type ServerResponse,
} from "node:http";
import { extname, resolve, sep } from "node:path";
import { pipeline } from "node:stream";
import type { Log } from "./log";
import { startupPage, startupScript } from "./startup";

const mime: Record<string, string> = {
  ".html": "text/html",
  ".js": "text/javascript",
  ".css": "text/css",
  ".json": "application/json",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".woff2": "font/woff2",
  ".ico": "image/x-icon",
};
export type GatewayOptions = {
  port: number;
  assets: string;
  vite?: string;
  token: () => string;
  backend: () => string | undefined;
  status: () => { state: string; message: string };
  retry: () => void;
  log: Log;
};
export async function startGateway(options: GatewayOptions) {
  const origin = `http://127.0.0.1:${options.port}`;
  const host = new URL(origin).host;
  const sockets = new Set<import("node:net").Socket>();
  const proxy = (
    incoming: IncomingMessage,
    response: ServerResponse,
    target: string,
    api: boolean,
  ) => {
    const headers: OutgoingHttpHeaders = { ...incoming.headers, host: new URL(target).host };
    delete headers.authorization;
    delete headers["proxy-authorization"];
    delete headers["x-forwarded-host"];
    delete headers["x-forwarded-for"];
    if (api) headers.authorization = `Bearer ${options.token()}`;
    const upstream = httpRequest(
      new URL(incoming.url ?? "/", target),
      { method: incoming.method, headers },
      (reply) => {
        const returned = { ...reply.headers };
        delete returned["access-control-allow-origin"];
        response.writeHead(reply.statusCode ?? 502, returned);
        pipeline(reply, response, () => {});
      },
    );
    upstream.on("error", () => {
      if (!response.headersSent) response.writeHead(502, { "Content-Type": "application/json" });
      response.end(
        JSON.stringify({
          error: { code: "API_UNAVAILABLE", message: "Reconnecting to your workspace…" },
        }),
      );
    });
    response.on("close", () => upstream.destroy());
    pipeline(incoming, upstream, () => {});
  };
  const server = createServer((request, response) => {
    try {
      const path = request.url ?? "/";
      if (
        request.headers.host !== host ||
        (request.headers.origin && request.headers.origin !== origin) ||
        request.headers["sec-fetch-site"] === "cross-site" ||
        !path.startsWith("/") ||
        path.startsWith("//")
      ) {
        response.writeHead(403).end();
        return;
      }
      response.setHeader("X-Content-Type-Options", "nosniff");
      response.setHeader("Referrer-Policy", "no-referrer");
      if (path === "/_desktop/status") {
        response
          .writeHead(200, { "Content-Type": "application/json", "Cache-Control": "no-store" })
          .end(JSON.stringify(options.status()));
        return;
      }
      if (path === "/_desktop/retry") {
        if (request.method !== "POST") {
          response.writeHead(405).end();
          return;
        }
        options.retry();
        response.writeHead(202).end();
        return;
      }
      if (path === "/_desktop/wait.js") {
        response.writeHead(200, { "Content-Type": "text/javascript" }).end(startupScript);
        return;
      }
      if (/^\/(v1|health)(\/|$)/.test(path)) {
        const backend = options.backend();
        if (!backend) {
          response.writeHead(503, { "Content-Type": "application/json" }).end(
            JSON.stringify({
              error: { code: "API_UNAVAILABLE", message: "Your workspace is starting." },
            }),
          );
          return;
        }
        proxy(request, response, backend, true);
        return;
      }
      if (options.status().state !== "ready") {
        response
          .writeHead(200, {
            "Content-Type": "text/html",
            "Cache-Control": "no-store",
            "Content-Security-Policy":
              "default-src 'self'; style-src 'unsafe-inline'; script-src 'self'",
          })
          .end(startupPage);
        return;
      }
      if (options.vite) {
        proxy(request, response, options.vite, false);
        return;
      }
      if (!["GET", "HEAD"].includes(request.method ?? "")) {
        response.writeHead(405).end();
        return;
      }
      let decoded: string;
      try {
        decoded = decodeURIComponent(new URL(path, origin).pathname);
      } catch {
        response.writeHead(400).end();
        return;
      }
      if (decoded.includes("\\") || decoded.includes("\0") || decoded.split("/").includes("..")) {
        response.writeHead(403).end();
        return;
      }
      const root = resolve(options.assets);
      let file = resolve(root, `.${decoded}`);
      if (!file.startsWith(`${root}${sep}`) && file !== root) {
        response.writeHead(403).end();
        return;
      }
      if (!existsSync(file) || !statSync(file).isFile()) {
        if (extname(decoded)) {
          response.writeHead(404).end();
          return;
        }
        file = resolve(root, "index.html");
      }
      if (!existsSync(file)) {
        response.writeHead(503).end("Build the web client before starting the desktop.");
        return;
      }
      response.writeHead(200, {
        "Content-Type": mime[extname(file)] ?? "application/octet-stream",
        "Cache-Control": "no-cache",
        "Content-Security-Policy":
          "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self' data:; connect-src 'self' ws://127.0.0.1:* http://127.0.0.1:*; frame-src 'self' blob:; object-src 'none'; base-uri 'self'; frame-ancestors 'self'",
      });
      if (request.method === "HEAD") response.end();
      else pipeline(createReadStream(file), response, () => {});
    } catch {
      options.log("desktop.gateway.unavailable");
      if (!response.headersSent) response.writeHead(503, { "Content-Type": "application/json" });
      response.end(
        JSON.stringify({
          error: { code: "API_UNAVAILABLE", message: "Reconnect your workspace and try again." },
        }),
      );
    }
  });
  server.on("connection", (socket) => {
    sockets.add(socket);
    socket.on("close", () => sockets.delete(socket));
  });
  server.on("upgrade", (request, socket, head) => {
    if (!options.vite || request.headers.host !== host || request.headers.origin !== origin) {
      socket.destroy();
      return;
    }
    const target = new URL(options.vite);
    const upstream = httpRequest({
      hostname: target.hostname,
      port: target.port,
      path: request.url,
      headers: { ...request.headers, host: target.host },
    });
    upstream.on("upgrade", (reply, peer, data) => {
      socket.write(
        `HTTP/1.1 ${reply.statusCode} Switching Protocols\r\n${Object.entries(reply.headers)
          .map(([k, v]) => `${k}: ${v}`)
          .join("\r\n")}\r\n\r\n`,
      );
      if (data.length) socket.write(data);
      if (head.length) peer.write(head);
      peer.pipe(socket).pipe(peer);
      socket.on("close", () => peer.destroy());
      peer.on("error", () => socket.destroy());
    });
    upstream.on("error", () => socket.destroy());
    upstream.end();
  });
  await new Promise<void>((ok, fail) => {
    server.once("error", fail);
    server.listen(options.port, "127.0.0.1", () => {
      server.off("error", fail);
      ok();
    });
  });
  return {
    origin,
    async close() {
      for (const socket of sockets) socket.destroy();
      await new Promise<void>((ok) => server.close(() => ok()));
    },
  };
}
