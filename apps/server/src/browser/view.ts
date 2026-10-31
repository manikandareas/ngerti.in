import { connect, type Socket } from "node:net";
import { DomainError } from "../contracts";
import type { BrowserScope, Browsers } from "./service";

type View = {
  profile_id: string;
  session_id: string;
  generation: number;
  scope: BrowserScope;
  expires: number;
  origin: string;
  port: number;
};
type Peer = { view: View; tcp?: Socket; timer?: ReturnType<typeof setInterval> };
/** View-only RFB over binary WebSocket, with single-use scoped tickets and continuous revocation. */
export class BrowserViews {
  readonly #tickets = new Map<string, View>();
  readonly #peers = new Set<{ close(): void }>();
  readonly server;
  constructor(readonly browsers: Browsers) {
    this.server = Bun.serve<Peer>({
      hostname: "127.0.0.1",
      port: 0,
      maxRequestBodySize: 65536,
      fetch: (request, server) => {
        const url = new URL(request.url);
        const ticket = url.searchParams.get("ticket") ?? "";
        const view = this.#tickets.get(ticket);
        this.#tickets.delete(ticket);
        try {
          if (
            !view ||
            url.pathname !== "/vnc" ||
            Date.now() > view.expires ||
            (request.headers.get("Origin") !== null &&
              request.headers.get("Origin") !== view.origin)
          )
            return new Response(null, { status: 403 });
          this.browsers.session(view.session_id, view.scope, view.generation);
          if (server.upgrade(request, { data: { view } })) return;
        } catch {
          return new Response(null, { status: 403 });
        }
        return new Response(null, { status: 400 });
      },
      websocket: {
        open: (ws) => {
          this.#peers.add(ws);
          const check = () => {
            try {
              if (Date.now() > ws.data.view.expires) throw new DomainError("UNAUTHORIZED");
              this.browsers.session(
                ws.data.view.session_id,
                ws.data.view.scope,
                ws.data.view.generation,
              );
              return true;
            } catch {
              ws.close(1008, "Browser access expired.");
              ws.data.tcp?.destroy();
              return false;
            }
          };
          ws.data.timer = setInterval(check, 100);
          ws.data.tcp = connect({ host: "127.0.0.1", port: ws.data.view.port });
          ws.data.tcp.on("data", (bytes) => {
            if (check()) {
              const sent = ws.send(bytes);
              if (sent <= 0) {
                ws.close(1013);
                ws.data.tcp?.destroy();
              }
            }
          });
          ws.data.tcp.on("error", () => ws.close(1011, "Browser unavailable."));
          ws.data.tcp.on("close", () => ws.close());
        },
        message: (ws, bytes) => {
          try {
            this.browsers.session(
              ws.data.view.session_id,
              ws.data.view.scope,
              ws.data.view.generation,
            );
            if (typeof bytes === "string" || bytes.byteLength > 65536)
              throw new DomainError("INVALID_REQUEST");
            // x11vnc enforces view-only on the host. RFB handshake messages still pass through.
            if (!ws.data.tcp?.write(bytes)) ws.data.tcp?.destroy();
          } catch {
            ws.close(1008);
            ws.data.tcp?.destroy();
          }
        },
        close: (ws) => {
          clearInterval(ws.data.timer);
          ws.data.tcp?.destroy();
          this.#peers.delete(ws);
        },
      },
    });
  }
  async issue(sessionId: string, scope: BrowserScope, origin: string) {
    const session = this.browsers.session(sessionId, scope);
    const port = await this.browsers.host.vncPort(session.profile_id);
    this.browsers.session(sessionId, scope, session.generation);
    for (const [key, ticket] of this.#tickets)
      if (ticket.expires < Date.now()) this.#tickets.delete(key);
    if (this.#tickets.size >= 100) throw new DomainError("CONFLICT");
    const ticket = `${crypto.randomUUID()}${crypto.randomUUID()}`;
    const expires = Date.now() + 60_000;
    this.#tickets.set(ticket, {
      session_id: sessionId,
      profile_id: session.profile_id,
      generation: session.generation,
      scope: { ...scope },
      expires,
      origin,
      port,
    });
    return {
      session_id: sessionId,
      generation: session.generation,
      host: "backend",
      display: ":99",
      mode: "view_only",
      transport: "rfb_websocket",
      url: `ws://127.0.0.1:${this.server.port}/vnc?ticket=${ticket}`,
      expires_at: new Date(expires).toISOString(),
    };
  }
  close() {
    this.#tickets.clear();
    for (const peer of this.#peers) peer.close();
    this.server.stop(true);
  }
}
