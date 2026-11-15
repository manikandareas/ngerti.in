import { fromBinary, toBinary } from "@bufbuild/protobuf";
import type { SessionLease } from "../auth/service";
import { DomainError } from "../contracts";
import { asyncMap } from "../persistence/async-collections";
import { OpenMediaResponseSchema } from "./protocol/stream_pb";
import type { Machines } from "./service";
import { viewerSessionScript } from "./viewer-transport";

export type ViewerPeer = {
  send(data: string | ArrayBuffer | Uint8Array): unknown;
  close(code?: number, reason?: string): unknown;
  terminate?(): unknown;
};
type Peer = ViewerPeer;
type View = {
  id: string;
  lease?: SessionLease;
  ticket: string;
  revision: number;
  generation: number;
  interactive: boolean;
  expires: number;
  origin: string;
  apiOrigin: string;
  abort: AbortController;
  media: Map<string, string>;
};
type Bridge = {
  view: View;
  socket: WebSocket;
  mediaId: string;
  queued: (string | Uint8Array<ArrayBuffer>)[];
  queuedBytes: number;
};
const prefix = "/v1/machine/viewer/";

/** Upstream HTML5 viewer, with scoped tickets and live takeover-revision fencing. */
export class MachineViews {
  readonly #views = new Map<string, View>();
  readonly #peers = new Map<Peer, Bridge>();
  readonly #sockets = new Set<Peer>();
  #mediaServer: Bun.Server<{ request: Request }> | undefined;
  readonly #closingMedia = new Map<string, Promise<void>>();
  readonly #unsubscribe: () => void;
  readonly #expiry: ReturnType<typeof setInterval>;
  constructor(
    readonly machines: Machines,
    readonly revoked: (id: string) => void = () => {},
  ) {
    // Collectors outlive the request that first opened this domain. Each viewer
    // validates its own session; an expired creator must not fence later logins.
    const detached = <T>(action: () => T) => machines.lifecycle.store.outsideDataContext(action);
    this.#unsubscribe = machines.onControl(() => detached(() => this.sweep()));
    this.#expiry = detached(() =>
      setInterval(() => {
        void (async () => {
          try {
            if (
              [...this.#peers.values()].some(
                (bridge) => bridge.view.interactive && bridge.socket.readyState === WebSocket.OPEN,
              )
            )
              await machines.renewHuman();
            await machines.expireControl();
          } finally {
            // A revoked principal can no longer read machine state. Its existing media must
            // still be swept and closed even when lease maintenance is denied.
            await this.sweep();
          }
        })().catch(() => {});
      }, 1000),
    );
    this.#expiry.unref();
  }
  private async valid(view: View) {
    await view.lease?.assert();
    if (
      this.#views.get(view.id) !== view ||
      Date.now() >= view.expires ||
      (await this.machines.snapshot()).generation !== view.generation
    )
      throw new DomainError("UNAUTHORIZED", 401);
    await this.machines.assertViewer(view.revision, view.interactive, view.lease?.sessionId);
    return view;
  }
  async authorize(request: Request, media = false) {
    const url = new URL(request.url);
    const id = url.pathname.slice(prefix.length).split("/")[0];
    const view = id ? this.#views.get(id) : undefined;
    const origin = request.headers.get("Origin");
    // TLS terminates at the loopback proxy. Bind to the configured account origin and exact
    // public Host, never to caller-supplied Forwarded/X-Forwarded-* values.
    const requestOrigin =
      view?.lease &&
      view.apiOrigin.startsWith("https:") &&
      url.protocol === "http:" &&
      url.host === new URL(view.apiOrigin).host
        ? view.apiOrigin
        : url.origin;
    if (
      !url.pathname.startsWith(prefix) ||
      !view ||
      (origin && origin !== view.origin) ||
      (media
        ? url.origin !== this.#mediaServer?.url.origin
        : ![view.origin, view.apiOrigin].includes(requestOrigin))
    )
      throw new DomainError("UNAUTHORIZED", 401);
    const organization = request.headers.get("X-Ngertiin-Organization");
    if (organization && view.lease?.organizationId && organization !== view.lease.organizationId)
      throw new DomainError("SCOPE_DENIED", 403);
    await view.lease?.authorizeRequest?.(request);
    return await this.valid(view);
  }
  async issue(origin: string, interactive = false, apiOrigin = origin, lease?: SessionLease) {
    await lease?.assert();
    const host = await this.machines.ready();
    const current = await this.machines.snapshot();
    await this.machines.assertViewer(current.lease.revision, interactive, lease?.sessionId);
    const reply = (await host.rpc("SystemService/CreateViewerTicket", {
      ttl: "600s",
      policy: interactive ? "SESSION_POLICY_ALLOW_ACTIVATION" : "SESSION_POLICY_VIEW_ONLY",
      clipboard: interactive,
      filesRoot: interactive ? current.root : "",
      principal: { id: lease?.userId ?? "owner", displayName: "You" },
    })) as { ticket: string };
    if (!reply.ticket) throw new DomainError("MACHINE_UNAVAILABLE", 503);
    await lease?.assert();
    await this.machines.assertViewer(current.lease.revision, interactive, lease?.sessionId);
    await this.sweep();
    if (this.#views.size >= 40) throw new DomainError("CONFLICT");
    const id = `${crypto.randomUUID().replaceAll("-", "")}${crypto.randomUUID().replaceAll("-", "")}`;
    const view: View = {
      id,
      lease,
      ticket: reply.ticket,
      revision: current.lease.revision,
      generation: current.generation,
      interactive,
      expires: Date.now() + 590_000,
      origin,
      apiOrigin,
      abort: new AbortController(),
      media: new Map(),
    };
    this.#views.set(id, view);
    if (lease) {
      lease.signal.addEventListener(
        "abort",
        () => {
          void this.revoke(view).catch(() => {});
        },
        { once: true },
      );
      if (lease.signal.aborted) {
        await this.revoke(view);
        throw new DomainError("UNAUTHORIZED", 401);
      }
    }
    return {
      viewer_id: id,
      viewer_url: `${prefix}${id}/viewer/#ticket=${encodeURIComponent(reply.ticket)}${interactive ? "" : "&view_only=1"}`,
      expires_at: new Date(view.expires).toISOString(),
      interactive,
      control_revision: view.revision,
      machine_id: current.id,
    };
  }
  async renew(id: string, origin: string, sessionId?: string) {
    const view = this.#views.get(id);
    if (!view || ![view.origin, view.apiOrigin].includes(origin))
      throw new DomainError("UNAUTHORIZED", 401);
    if (view.lease && view.lease.sessionId !== sessionId)
      throw new DomainError("SCOPE_DENIED", 403);
    await this.valid(view);
    const reply = (await this.machines.host?.rpc("SystemService/CreateViewerTicket", {
      ttl: "600s",
      policy: view.interactive ? "SESSION_POLICY_ALLOW_ACTIVATION" : "SESSION_POLICY_VIEW_ONLY",
      clipboard: view.interactive,
      filesRoot: view.interactive ? (await this.machines.snapshot()).root : "",
      principal: { id: view.lease?.userId ?? "owner", displayName: "You" },
    })) as { ticket?: string } | undefined;
    await this.valid(view);
    if (!reply?.ticket) throw new DomainError("MACHINE_UNAVAILABLE", 503);
    view.ticket = reply.ticket;
    view.expires = Date.now() + 590_000;
    return {
      viewer_id: view.id,
      expires_at: new Date(view.expires).toISOString(),
      control_revision: view.revision,
    };
  }
  private async closeMedia(id: string) {
    const existing = this.#closingMedia.get(id);
    if (existing) return existing;
    const work = (async () => {
      try {
        await this.machines.host?.revokeMedia(id);
      } catch (error) {
        if (!/not.?found|already closed/i.test(String(error))) throw error;
      }
    })();
    const tracked = work
      .catch(async (error) => {
        await this.machines.uncertainControl();
        throw error;
      })
      .finally(() => this.#closingMedia.delete(id));
    this.#closingMedia.set(id, tracked);
    return tracked;
  }
  private async revoke(view: View) {
    this.#views.delete(view.id);
    this.revoked(view.id);
    view.abort.abort();
    view.lease?.release();
    for (const [peer, bridge] of this.#peers)
      if (bridge.view === view) this.denyPeer(peer, "Machine control changed.");
    const pending = await asyncMap(
      [...new Set(view.media.values())],
      async (id) => await this.closeMedia(id),
    );
    view.media.clear();
    await Promise.all(pending);
  }
  async remove(id: string, sessionId?: string) {
    const view = this.#views.get(id);
    if (view?.lease && view.lease.sessionId !== sessionId)
      throw new DomainError("SCOPE_DENIED", 403);
    if (view) await this.revoke(view);
    return { revoked: true };
  }
  private async sweep() {
    const pending: Promise<void>[] = [];
    for (const view of this.#views.values()) {
      try {
        await this.valid(view);
      } catch {
        pending.push(this.revoke(view));
      }
    }
    await Promise.all([...pending, ...this.#closingMedia.values()]);
  }
  private mediaServer() {
    if (this.#mediaServer) return this.#mediaServer;
    this.#mediaServer = Bun.serve<{ request: Request }>({
      hostname: "127.0.0.1",
      port: 0,
      fetch: async (request, server) => {
        try {
          const view = await this.authorize(request, true);
          const ticket = new URL(request.url).searchParams.get("ticket") ?? "";
          if (!view.media.has(ticket)) return new Response(null, { status: 401 });
          if (server.upgrade(request, { data: { request } })) return;
        } catch {
          return new Response(null, { status: 401 });
        }
        return new Response(null, { status: 400 });
      },
      websocket: {
        maxPayloadLength: 65_536,
        backpressureLimit: 8 * 1024 * 1024,
        closeOnBackpressureLimit: true,
        open: async (peer) => await this.open(peer.data.request, peer),
        message: async (peer, message) => await this.message(peer, message),
        close: (peer) => this.closePeer(peer),
      },
    });
    this.#mediaServer.unref();
    return this.#mediaServer;
  }
  private path(request: Request, view: View) {
    const url = new URL(request.url);
    const path = url.pathname.slice(`${prefix}${view.id}/`.length);
    if (path.includes("%") || path.includes("..") || path.includes("\\"))
      throw new DomainError("SCOPE_DENIED", 403);
    return { path, search: url.search };
  }
  async proxy(request: Request) {
    const view = await this.authorize(request);
    const { path, search } = this.path(request, view);
    if (path === "viewer/ngertiin-session.js")
      return new Response(viewerSessionScript, {
        headers: { "Content-Type": "text/javascript", "Cache-Control": "no-store" },
      });
    if (path === "viewer/ngertiin-health.js")
      return new Response(viewerHealthScript, {
        headers: { "Content-Type": "text/javascript", "Cache-Control": "no-store" },
      });
    if (path === "viewer/ngertiin-preview.css")
      return new Response(viewerPreviewStyle, {
        headers: { "Content-Type": "text/css", "Cache-Control": "no-store" },
      });
    const staticAsset = request.method === "GET" && path.startsWith("viewer/");
    const rpc =
      /^cua\.env\.v1\.(SystemService|StreamService|PresenceService|ComputerService|FilesystemService)\/(\w+)$/.exec(
        path,
      );
    const signedFile = path === "files" || path.startsWith("files/");
    if (!staticAsset && !rpc && !signedFile) throw new DomainError("SCOPE_DENIED", 403);
    if (rpc?.[1] === "SystemService" && !["GetCapabilities", "Health"].includes(rpc[2] ?? ""))
      throw new DomainError("SCOPE_DENIED", 403);
    if (
      !view.interactive &&
      rpc?.[1] === "ComputerService" &&
      !["GetDisplays", "Screenshot", "GetCursor"].includes(rpc[2] ?? "")
    )
      throw new DomainError("SCOPE_DENIED", 403);
    if (!view.interactive && (rpc?.[1] === "FilesystemService" || signedFile))
      throw new DomainError("SCOPE_DENIED", 403);
    const host = this.machines.host;
    if (!host) throw new DomainError("MACHINE_UNAVAILABLE", 503);
    const headers = new Headers(request.headers);
    for (const name of [
      "host",
      "origin",
      "referer",
      "cookie",
      "authorization",
      "x-cua-env-authorization",
      "content-length",
      "connection",
      "upgrade",
    ])
      headers.delete(name);
    headers.set("x-cua-env-authorization", `Bearer ${view.ticket}`);
    headers.set("accept-encoding", "identity");
    headers.delete("grpc-accept-encoding");
    const upstream = await fetch(`${host.configuration.endpoint}/${path}${search}`, {
      method: request.method,
      headers,
      body: ["GET", "HEAD"].includes(request.method) ? undefined : request.body,
      signal: AbortSignal.any([view.abort.signal, request.signal]),
      redirect: "manual",
    });
    const responseHeaders = new Headers(upstream.headers);
    responseHeaders.set("Cache-Control", "no-store");
    responseHeaders.set("Referrer-Policy", "no-referrer");
    responseHeaders.delete("set-cookie");
    responseHeaders.delete("content-length");
    if (staticAsset) {
      const csp = responseHeaders.get("Content-Security-Policy");
      if (csp)
        responseHeaders.set(
          "Content-Security-Policy",
          csp.replace("frame-ancestors 'none'", "frame-ancestors 'self'"),
        );
      responseHeaders.delete("X-Frame-Options");
    }
    if (rpc?.[1] === "StreamService" && rpc[2] === "OpenMedia" && upstream.ok) {
      const bytes = new Uint8Array(await upstream.arrayBuffer());
      if (bytes.length > 2_097_152) throw new DomainError("INVALID_REQUEST", 413);
      const frames: Uint8Array[] = [];
      // Rewrite only the generated media endpoint; preserve gRPC-Web trailers.
      for (let offset = 0; offset + 5 <= bytes.length; ) {
        const flags = bytes[offset] as number;
        const length = new DataView(bytes.buffer, bytes.byteOffset + offset + 1, 4).getUint32(0);
        if (offset + 5 + length > bytes.length) throw new DomainError("MACHINE_UNKNOWN");
        if ((flags & 0x80) === 0) {
          const media = fromBinary(
            OpenMediaResponseSchema,
            bytes.subarray(offset + 5, offset + 5 + length),
          );
          if (media.mediaSessionId && media.ticket) {
            view.media.set(media.ticket, media.mediaSessionId);
            media.wsPath = view.lease
              ? `media?ticket=${encodeURIComponent(media.ticket)}`
              : `ws://127.0.0.1:${this.mediaServer().port}${prefix}${view.id}/media?ticket=${encodeURIComponent(media.ticket)}`;
          }
          const payload = toBinary(OpenMediaResponseSchema, media);
          const frame = new Uint8Array(5 + payload.length);
          frame[0] = flags;
          new DataView(frame.buffer).setUint32(1, payload.length);
          frame.set(payload, 5);
          frames.push(frame);
        } else frames.push(bytes.slice(offset, offset + 5 + length));
        offset += 5 + length;
      }
      try {
        await this.valid(view);
      } catch (error) {
        for (const id of view.media.values()) void this.closeMedia(id).catch(() => {});
        throw error;
      }
      return new Response(Buffer.concat(frames), {
        status: upstream.status,
        headers: responseHeaders,
      });
    }
    await this.valid(view);
    if (staticAsset && upstream.ok && responseHeaders.get("Content-Type")?.includes("text/html")) {
      const html = await upstream.text();
      return new Response(
        html.replace(
          "</head>",
          '<script src="./ngertiin-session.js"></script><link rel="stylesheet" href="./ngertiin-preview.css"><script src="./ngertiin-health.js" defer></script></head>',
        ),
        { status: upstream.status, headers: responseHeaders },
      );
    }
    return new Response(this.stream(upstream.body, view.abort.signal, request.signal), {
      status: upstream.status,
      headers: responseHeaders,
    });
  }
  private stream(body: ReadableStream<Uint8Array> | null, ...signals: AbortSignal[]) {
    if (!body) return null;
    const reader = body.getReader();
    let finished = false;
    let abort = () => {};
    const cleanup = () => {
      for (const signal of signals) signal.removeEventListener("abort", abort);
    };
    return new ReadableStream<Uint8Array>({
      start(controller) {
        abort = () => {
          if (finished) return;
          finished = true;
          cleanup();
          controller.close();
          void reader.cancel().catch(() => {});
        };
        for (const signal of signals) signal.addEventListener("abort", abort, { once: true });
        if (signals.some((signal) => signal.aborted)) abort();
      },
      async pull(controller) {
        if (finished) return;
        try {
          const chunk = await reader.read();
          if (finished) return;
          if (chunk.done) {
            finished = true;
            cleanup();
            controller.close();
          } else controller.enqueue(chunk.value);
        } catch (error) {
          if (!finished) {
            finished = true;
            cleanup();
            controller.error(error);
          }
        }
      },
      cancel() {
        if (!finished) {
          finished = true;
          cleanup();
          void reader.cancel().catch(() => {});
        }
      },
    });
  }
  async open(request: Request, peer: Peer, localMedia = true) {
    this.#sockets.add(peer);
    try {
      const view = await this.authorize(request, localMedia);
      const ticket = new URL(request.url).searchParams.get("ticket") ?? "";
      const mediaId = view.media.get(ticket);
      if (!mediaId || !this.machines.host) throw new DomainError("UNAUTHORIZED", 401);
      const endpoint = new URL("/media", this.machines.host.configuration.endpoint);
      endpoint.protocol = "ws:";
      endpoint.searchParams.set("ticket", ticket);
      const socket = new WebSocket(endpoint);
      socket.binaryType = "arraybuffer";
      const bridge: Bridge = { view, socket, mediaId, queued: [], queuedBytes: 0 };
      this.#peers.set(peer, bridge);
      socket.onopen = async () => {
        try {
          await this.valid(view);
          for (const message of bridge.queued) socket.send(message);
          bridge.queued.length = 0;
        } catch {
          this.denyPeer(peer, "Machine view expired.");
        }
      };
      socket.onmessage = async (event) => {
        try {
          await this.valid(view);
          if (peer.send(event.data) === -1) throw new Error("Backpressure");
        } catch {
          this.denyPeer(peer, "Machine view expired.");
        }
      };
      socket.onclose = (event) => {
        // Preserve upstream ticket-expiry semantics so Cua can reopen its media session.
        peer.close(event.code === 1006 ? 1011 : event.code, "Machine media reconnecting.");
        this.closePeer(peer);
      };
      socket.onerror = () => {
        peer.close(1011, "Machine media reconnecting.");
        this.closePeer(peer);
      };
    } catch {
      this.denyPeer(peer, "Machine view denied.");
    }
  }
  async message(peer: Peer, message: unknown) {
    const bridge = this.#peers.get(peer);
    if (!bridge) return this.denyPeer(peer, "Machine view denied.");
    try {
      await this.valid(bridge.view);
      const data =
        message instanceof Uint8Array
          ? Uint8Array.from(message)
          : typeof message === "string"
            ? message
            : JSON.stringify(message);
      const size = typeof data === "string" ? Buffer.byteLength(data) : data.byteLength;
      if (size > 65_536) throw new DomainError("INVALID_REQUEST", 413);
      if (bridge.socket.readyState === WebSocket.OPEN) bridge.socket.send(data);
      else {
        bridge.queuedBytes += size;
        if (bridge.queuedBytes > 131_072) throw new DomainError("INVALID_REQUEST", 413);
        bridge.queued.push(data);
      }
    } catch {
      this.denyPeer(peer, "Machine control changed.");
    }
  }
  closePeer(peer: Peer) {
    this.#sockets.delete(peer);
    const bridge = this.#peers.get(peer);
    if (!bridge) {
      peer.terminate?.();
      return;
    }
    this.#peers.delete(peer);
    bridge.socket.onclose = null;
    bridge.socket.close();
    // Allow an upstream close frame to flush; terminate would erase its expiry code.
    // Transport detach is recoverable. Explicit view revoke/expiry closes media.
  }
  private denyPeer(peer: Peer, reason: string) {
    peer.close(1008, reason);
    peer.terminate?.();
    this.closePeer(peer);
  }
  async close() {
    await this.#unsubscribe();
    clearInterval(this.#expiry);
    for (const view of this.#views.values()) void this.revoke(view).catch(() => {});
    for (const peer of this.#sockets) this.closePeer(peer);
    // Bun 1.3.10 keeps a stale WS count after close. Stop this isolated listener
    // without awaiting that counter; the main HTTP API can still drain normally.
    void this.#mediaServer?.stop(true);
    this.#mediaServer?.unref();
    this.#mediaServer = undefined;
  }
}

// Loaded as a same-origin external asset to honor the pinned viewer CSP.
const viewerHealthScript = `(() => {
  if (new URLSearchParams(location.hash.slice(1)).get('ngertiin_preview') === '1') document.documentElement.dataset.ngertiinPreview = 'true';
  const viewerId = location.pathname.split('/viewer/')[1]?.split('/')[0];
  setInterval(() => {
    const root = document.querySelector('[data-status]');
    const stats = window.__cuaViewer?.stats?.();
    parent.postMessage({type:'ngertiin:computer-health', viewer_id:viewerId,
      status:root?.dataset.status ?? 'connecting', frames_decoded:stats?.framesDecoded ?? 0}, location.origin);
  }, 1000);
})();`;

// Compact product previews retain connection/error overlays while hiding viewer controls.
const viewerPreviewStyle = `html[data-ngertiin-preview="true"] :is(.cua-toolbar, .cua-chips, .cua-stats, .cua-overlay button) { display: none !important; }`;
