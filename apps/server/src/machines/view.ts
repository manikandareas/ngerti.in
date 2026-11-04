import { fromBinary, toBinary } from "@bufbuild/protobuf";
import { DomainError } from "../contracts";
import { OpenMediaResponseSchema } from "./protocol/stream_pb";
import type { Machines } from "./service";

type Peer = {
  send(data: string | ArrayBuffer | Uint8Array): unknown;
  close(code?: number, reason?: string): unknown;
  terminate?(): unknown;
};
type View = {
  id: string;
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
  constructor(readonly machines: Machines) {
    this.#unsubscribe = machines.onControl(() => this.sweep());
    this.#expiry = setInterval(() => {
      if (
        [...this.#peers.values()].some(
          (bridge) => bridge.view.interactive && bridge.socket.readyState === WebSocket.OPEN,
        )
      )
        machines.renewHuman();
      void machines
        .expireControl()
        .then(() => this.sweep())
        .catch(() => {});
    }, 1000);
    this.#expiry.unref();
  }
  private valid(view: View) {
    if (
      this.#views.get(view.id) !== view ||
      Date.now() >= view.expires ||
      this.machines.snapshot().generation !== view.generation
    )
      throw new DomainError("UNAUTHORIZED", 401);
    this.machines.assertViewer(view.revision, view.interactive);
    return view;
  }
  authorize(request: Request, media = false) {
    const url = new URL(request.url);
    const id = url.pathname.slice(prefix.length).split("/")[0];
    const view = id ? this.#views.get(id) : undefined;
    const origin = request.headers.get("Origin");
    if (
      !url.pathname.startsWith(prefix) ||
      !view ||
      (origin && origin !== view.origin) ||
      (media
        ? url.origin !== this.#mediaServer?.url.origin
        : ![view.origin, view.apiOrigin].includes(url.origin))
    )
      throw new DomainError("UNAUTHORIZED", 401);
    return this.valid(view);
  }
  async issue(origin: string, interactive = false, apiOrigin = origin) {
    const host = await this.machines.ready();
    const current = this.machines.snapshot();
    this.machines.assertViewer(current.lease.revision, interactive);
    const reply = (await host.rpc("SystemService/CreateViewerTicket", {
      ttl: "600s",
      policy: interactive ? "SESSION_POLICY_ALLOW_ACTIVATION" : "SESSION_POLICY_VIEW_ONLY",
      clipboard: interactive,
      filesRoot: interactive ? current.root : "",
      principal: { id: "owner", displayName: "You" },
    })) as { ticket: string };
    if (!reply.ticket) throw new DomainError("MACHINE_UNAVAILABLE", 503);
    this.machines.assertViewer(current.lease.revision, interactive);
    await this.sweep();
    if (this.#views.size >= 40) throw new DomainError("CONFLICT");
    const id = `${crypto.randomUUID().replaceAll("-", "")}${crypto.randomUUID().replaceAll("-", "")}`;
    const view: View = {
      id,
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
    return {
      viewer_id: id,
      viewer_url: `${prefix}${id}/viewer/#ticket=${encodeURIComponent(reply.ticket)}${interactive ? "" : "&view_only=1"}`,
      expires_at: new Date(view.expires).toISOString(),
      interactive,
      control_revision: view.revision,
      machine_id: current.id,
    };
  }
  private closeMedia(id: string) {
    const existing = this.#closingMedia.get(id);
    if (existing) return existing;
    const work = (async () => {
      try {
        await this.machines.host?.rpc(
          "StreamService/CloseMedia",
          { mediaSessionId: id },
          AbortSignal.timeout(5000),
        );
      } catch (error) {
        if (!/not.?found|already closed/i.test(String(error))) throw error;
      }
    })();
    const tracked = work
      .catch((error) => {
        this.machines.uncertainControl();
        throw error;
      })
      .finally(() => this.#closingMedia.delete(id));
    this.#closingMedia.set(id, tracked);
    return tracked;
  }
  private async revoke(view: View) {
    this.#views.delete(view.id);
    view.abort.abort();
    for (const [peer, bridge] of this.#peers)
      if (bridge.view === view) this.denyPeer(peer, "Machine control changed.");
    const pending = [...new Set(view.media.values())].map((id) => this.closeMedia(id));
    view.media.clear();
    await Promise.all(pending);
  }
  async remove(id: string) {
    const view = this.#views.get(id);
    if (view) await this.revoke(view);
    return { revoked: true };
  }
  private async sweep() {
    const pending: Promise<void>[] = [];
    for (const view of this.#views.values()) {
      try {
        this.valid(view);
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
      fetch: (request, server) => {
        try {
          const view = this.authorize(request, true);
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
        open: (peer) => this.open(peer.data.request, peer),
        message: (peer, message) => this.message(peer, message),
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
    const view = this.authorize(request);
    const { path, search } = this.path(request, view);
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
            media.wsPath = `ws://127.0.0.1:${this.mediaServer().port}${prefix}${view.id}/media?ticket=${encodeURIComponent(media.ticket)}`;
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
        this.valid(view);
      } catch (error) {
        for (const id of view.media.values()) void this.closeMedia(id).catch(() => {});
        throw error;
      }
      return new Response(Buffer.concat(frames), {
        status: upstream.status,
        headers: responseHeaders,
      });
    }
    this.valid(view);
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
  open(request: Request, peer: Peer) {
    this.#sockets.add(peer);
    try {
      const view = this.authorize(request, true);
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
      socket.onopen = () => {
        try {
          this.valid(view);
          for (const message of bridge.queued) socket.send(message);
          bridge.queued.length = 0;
        } catch {
          this.denyPeer(peer, "Machine view expired.");
        }
      };
      socket.onmessage = (event) => {
        try {
          this.valid(view);
          if (peer.send(event.data) === -1) throw new Error("Backpressure");
        } catch {
          this.denyPeer(peer, "Machine view expired.");
        }
      };
      socket.onclose = () => {
        this.denyPeer(peer, "Machine media closed.");
      };
      socket.onerror = () => {
        this.denyPeer(peer, "Machine view unavailable.");
      };
    } catch {
      this.denyPeer(peer, "Machine view denied.");
    }
  }
  message(peer: Peer, message: unknown) {
    const bridge = this.#peers.get(peer);
    if (!bridge) return this.denyPeer(peer, "Machine view denied.");
    try {
      this.valid(bridge.view);
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
    peer.terminate?.();
    void this.closeMedia(bridge.mediaId).catch(() => this.machines.uncertainControl());
  }
  private denyPeer(peer: Peer, reason: string) {
    peer.close(1008, reason);
    peer.terminate?.();
    this.closePeer(peer);
  }
  close() {
    this.#unsubscribe();
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
