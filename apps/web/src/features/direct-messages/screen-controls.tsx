import { useAuth } from "@clerk/tanstack-react-start";
import { Monitor } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import { ApiError } from "@/lib/api";
import { command, submit } from "./client";
import type { Thread } from "./state";

type Screen = {
  grant?: string;
  expires_at?: number;
  control?: string;
  image?: string;
  observation?: Screen;
  ready?: boolean;
};
type Login = { id: string; label: string; origin: string; identifier: string };

export function ScreenControls({ thread }: { thread: Thread }) {
  const { getToken, userId } = useAuth();
  const [open, setOpen] = useState(false);
  const [docked, setDocked] = useState(false);
  const [agentId, setAgentId] = useState(thread.agents[0]?.agent_id ?? "");
  const [connection, setConnection] = useState<Screen | null>(null);
  const [frame, setFrame] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [secret, setSecret] = useState("");
  const [logins, setLogins] = useState<Login[]>([]);
  const [origin, setOrigin] = useState("");
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [otpSecret, setOtpSecret] = useState("");
  const [diagnostic, setDiagnostic] = useState("");
  const epoch = useRef(0);
  const restored = useRef("");
  const storageKey = userId ? `nma.screen.v1:${userId}:${thread.thread_id}:${agentId}` : "";
  useEffect(() => {
    if (!storageKey || restored.current === storageKey) return;
    restored.current = storageKey;
    try {
      const saved = JSON.parse(sessionStorage.getItem(storageKey) ?? "null") as Screen | null;
      if (saved?.grant && (saved.expires_at ?? 0) * 1000 > Date.now()) setConnection(saved);
    } catch {
      sessionStorage.removeItem(storageKey);
    }
  }, [storageKey]);
  useEffect(() => {
    if (!storageKey || restored.current !== storageKey) return;
    if (connection?.grant)
      sessionStorage.setItem(
        storageKey,
        JSON.stringify({
          grant: connection.grant,
          expires_at: connection.expires_at,
          control: connection.control,
        }),
      );
  }, [storageKey, connection]);
  const scope = useCallback(
    () => ({ thread_id: thread.thread_id, agent_id: agentId }),
    [thread.thread_id, agentId],
  );
  const request = useCallback(
    async (action: string, extra: object = {}) =>
      submit<Screen>(command("screen.action", { ...scope(), action, ...extra }), await getToken()),
    [scope, getToken],
  );

  useEffect(() => {
    if (!connection?.grant || !open || busy || connection.control === "disconnected") return;
    let active = true;
    let timer: ReturnType<typeof setTimeout>;
    async function refresh() {
      try {
        const value = await request("frame", { grant: connection?.grant });
        if (active && value.image) setFrame(value.image);
      } catch (e) {
        if (active) {
          setError(
            e instanceof Error
              ? e.message
              : "Layar terputus. Hubungkan kembali; agent tetap menunggu.",
          );
          setConnection((current) => (current ? { ...current, control: "disconnected" } : current));
        }
        return;
      }
      if (active) timer = setTimeout(() => void refresh(), 1500);
    }
    void refresh();
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [connection?.grant, connection?.control, request, open, busy]);

  async function act(action: string, extra: object = {}) {
    if (busy) return;
    const currentEpoch = epoch.current;
    setBusy(true);
    setError("");
    try {
      if (action === "connect" && connection?.grant) {
        // Retire this viewer before replacing its grant so human ownership cannot
        // remain attached to an inaccessible token after a network interruption.
        try {
          await request("revoke", { grant: connection.grant });
        } catch (cause) {
          if (!(cause instanceof ApiError && cause.code === "SCREEN_ACCESS_REFUSED")) throw cause;
        }
      }
      const value = await request(action, {
        ...(connection?.grant && action !== "connect" ? { grant: connection.grant } : {}),
        ...extra,
      });
      if (epoch.current !== currentEpoch) return;
      if (action === "revoke" || action === "pause") {
        setConnection(null);
        setFrame("");
        if (storageKey) sessionStorage.removeItem(storageKey);
      } else setConnection((current) => ({ ...current, ...value }));
      if (value.observation?.image) setFrame(value.observation.image);
      if (action === "resume" || action === "revoke" || action === "pause") setSecret("");
      if (action === "diagnostics") {
        setDiagnostic(
          value.ready
            ? "Layar siap digunakan."
            : "Layar belum siap. Periksa konfigurasi komputer agent.",
        );
      }
    } catch (e) {
      if (epoch.current === currentEpoch) {
        setError(
          e instanceof Error ? e.message : "Operasi layar gagal. Input tidak diulang otomatis.",
        );
        if (action === "revoke") {
          setConnection(null);
          setFrame("");
          if (storageKey) sessionStorage.removeItem(storageKey);
        }
      }
    } finally {
      if (epoch.current === currentEpoch) setBusy(false);
    }
  }

  async function vault(action: string, item: object) {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      const token = await getToken();
      await submit(command("browser.vault", { ...scope(), action, item }), token);
      const value = await submit<{ items: Login[] }>(
        command("browser.vault", { ...scope(), action: "list", item: {} }),
        token,
      );
      setLogins(value.items);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Penyimpanan login gagal.");
    } finally {
      setBusy(false);
    }
  }

  const human = connection?.control === "human";
  const labels: Record<string, string> = {
    agent: "Agent memegang kontrol",
    human: "Anda memegang kontrol",
    requested: "Agent meminta bantuan",
    pending: "Menunggu input agent selesai",
    disconnected: "Terputus — input ditahan",
  };
  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next && busy) return;
        setOpen(next);
        if (!next) {
          setSecret("");
          setPassword("");
          setOtpSecret("");
          if (human) void act("revoke");
        }
      }}
    >
      <DialogTrigger asChild>
        <Button type="button" variant="outline" size="sm">
          <Monitor className="size-4" /> Layar dan bantuan login
        </Button>
      </DialogTrigger>
      <DialogContent
        showOverlay={!docked}
        data-context-editor={docked ? "true" : undefined}
        className={`max-h-[94dvh] overflow-y-auto rounded-t-2xl sm:max-w-5xl sm:rounded-2xl max-sm:top-auto max-sm:bottom-0 max-sm:translate-y-0 max-sm:w-full ${docked ? "lg:left-auto lg:right-2.5 lg:top-2.5 lg:bottom-2.5 lg:w-[360px] lg:max-w-[360px] lg:translate-x-0 lg:translate-y-0 lg:content-start" : ""}`}
      >
        <DialogTitle>Layar dan bantuan login</DialogTitle>
        <DialogDescription>
          Layar privat agent di percakapan ini. Menutup layar saat Anda memegang kontrol menahan
          input sampai kontrol dikembalikan.
        </DialogDescription>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="hidden w-fit lg:inline-flex"
          onClick={() => setDocked(!docked)}
        >
          {docked ? "Perbesar layar" : "Tampilkan sebagai panel"}
        </Button>
        <div className="mt-3 space-y-3">
          <label className="block">
            Agent{" "}
            <NativeSelect
              className="max-w-full rounded border bg-background p-2"
              value={agentId}
              disabled={busy || !!connection}
              onChange={(e) => {
                epoch.current++;
                setAgentId(e.target.value);
                setFrame("");
                setLogins([]);
              }}
            >
              {thread.agents.map((agent) => (
                <option key={agent.agent_id} value={agent.agent_id}>
                  {agent.display_name}
                </option>
              ))}
            </NativeSelect>
          </label>
          <p role="status" className="rounded-xl bg-muted px-4 py-3 text-sm font-medium">
            {connection
              ? labels[connection.control ?? "agent"]
              : "Hubungkan layar privat percakapan ini."}
          </p>
          <div className="flex flex-wrap gap-2">
            {!connection ? (
              <Button
                size="sm"
                variant="outline"
                disabled={busy || !agentId}
                onClick={() => void act("connect")}
              >
                Hubungkan layar
              </Button>
            ) : (
              <>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={busy || human}
                  onClick={() => void act("takeover")}
                >
                  Ambil kontrol
                </Button>
                {connection.control === "disconnected" && (
                  <Button size="sm" disabled={busy} onClick={() => void act("connect")}>
                    Hubungkan kembali
                  </Button>
                )}
                <Button
                  size="sm"
                  variant="outline"
                  disabled={busy || connection.control === "agent"}
                  onClick={() => void act("resume")}
                >
                  Kembalikan ke agent
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={busy}
                  onClick={() => void act("revoke")}
                >
                  Putuskan akses
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={busy}
                  onClick={() => void act("pause")}
                >
                  Jeda komputer
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={busy}
                  onClick={() => void act("diagnostics")}
                >
                  Periksa koneksi
                </Button>
              </>
            )}
          </div>
          {diagnostic && <p role="status">{diagnostic}</p>}
          {!frame && (
            <div className="flex min-h-52 flex-col items-center justify-center gap-3 rounded-xl border bg-muted/50 p-6 text-center text-sm text-muted-foreground">
              <Monitor className="size-8" />
              <p>{busy ? "Menghubungkan layar…" : "Layar komputer agent akan tampil di sini."}</p>
              <p>Ambil kontrol untuk membantu login, lalu kembalikan ke agent.</p>
            </div>
          )}
          {frame && (
            <button
              type="button"
              className="block w-full overflow-hidden rounded-xl border bg-muted disabled:cursor-default"
              aria-label="Layar komputer privat; klik saat memegang kontrol"
              disabled={!human || busy}
              onClick={(e) => {
                const bounds = e.currentTarget.getBoundingClientRect();
                void act("input", {
                  input: {
                    kind: "click",
                    x: Math.min(
                      1279,
                      Math.max(0, Math.floor(((e.clientX - bounds.left) * 1280) / bounds.width)),
                    ),
                    y: Math.min(
                      799,
                      Math.max(0, Math.floor(((e.clientY - bounds.top) * 800) / bounds.height)),
                    ),
                  },
                });
              }}
            >
              <img src={frame} alt="Layar komputer privat" className="h-auto w-full" />
            </button>
          )}
          {human && (
            <div className="space-y-2">
              <p>
                Klik target pada layar, lalu kirim teks atau tombol. Agent menunggu sampai kontrol
                dikembalikan. Setelah itu, lanjutkan melalui percakapan.
              </p>
              <form
                className="flex gap-2"
                onSubmit={(e) => {
                  e.preventDefault();
                  if (busy || !secret) return;
                  const text = secret;
                  setSecret("");
                  void act("input", { input: { kind: "text", text } });
                }}
              >
                <Input
                  aria-label="Teks privat ke layar"
                  type="password"
                  autoComplete="off"
                  className="min-w-0 flex-1 rounded border bg-background p-2"
                  value={secret}
                  onChange={(e) => setSecret(e.target.value)}
                />
                <Button size="sm" disabled={busy || !secret}>
                  Kirim teks
                </Button>
              </form>
              <div className="flex flex-wrap gap-2">
                {["Tab", "Return", "BackSpace", "Escape", "ctrl+a", "ctrl+l", "ctrl+s"].map(
                  (key) => (
                    <Button
                      key={key}
                      size="sm"
                      variant="outline"
                      disabled={busy}
                      onClick={() => void act("input", { input: { kind: "key", key } })}
                    >
                      {key}
                    </Button>
                  ),
                )}
              </div>
            </div>
          )}
          <details className="rounded-xl border p-4">
            <summary className="cursor-pointer">Login tersimpan</summary>
            <div className="mt-2 space-y-2">
              <Button
                size="sm"
                variant="outline"
                disabled={busy}
                onClick={() => void vault("list", {})}
              >
                Muat login
              </Button>
              {logins.map((login) => (
                <div key={login.id} className="flex flex-wrap items-center gap-2">
                  <span className="min-w-0 break-all">
                    {login.label} · {login.origin} · {login.identifier}
                  </span>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={busy}
                    onClick={() => void vault("delete", { handle: login.id })}
                  >
                    Hapus
                  </Button>
                </div>
              ))}
              <form
                className="grid gap-2"
                onSubmit={(e) => {
                  e.preventDefault();
                  const value = password;
                  const seed = otpSecret;
                  setPassword("");
                  setOtpSecret("");
                  void vault("add", {
                    label: origin,
                    origin,
                    identifier,
                    password: value,
                    otp_secret: seed,
                  });
                }}
              >
                <Input
                  aria-label="Origin login"
                  type="url"
                  required
                  placeholder="https://situs.example"
                  className="min-w-0 rounded border bg-background p-2"
                  value={origin}
                  onChange={(e) => setOrigin(e.target.value)}
                />
                <Input
                  aria-label="Username login"
                  required
                  autoComplete="off"
                  placeholder="Username atau email"
                  className="min-w-0 rounded border bg-background p-2"
                  value={identifier}
                  onChange={(e) => setIdentifier(e.target.value)}
                />
                <Input
                  aria-label="Password tersimpan"
                  type="password"
                  required
                  autoComplete="new-password"
                  placeholder="Password"
                  className="min-w-0 rounded border bg-background p-2"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
                <Button size="sm" variant="outline" disabled={busy || !password}>
                  Simpan login
                </Button>
                <Input
                  aria-label="Kunci autentikator opsional"
                  type="password"
                  autoComplete="off"
                  placeholder="Kunci autentikator 2FA (opsional)"
                  className="min-w-0 rounded border bg-background p-2"
                  value={otpSecret}
                  onChange={(e) => setOtpSecret(e.target.value)}
                />
              </form>
            </div>
          </details>
          {error && (
            <p role="alert" className="break-words text-destructive-foreground">
              {error}
            </p>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
