import { useState } from "react";
import { Button } from "@/components/ui/button";
import { NativeChoice } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import type { Provider } from "./client";

export type KeyDraft = {
  provider: string;
  label: string;
  api_key: string;
  base_url: string;
  protocol: string;
  workload: string;
};

export function ConnectionForm({
  providers,
  initialProvider = "openrouter",
  preset,
  busy,
  blocked,
  onKey,
  onLogin,
}: {
  providers: Provider[];
  initialProvider?: string;
  preset?: { label: string; url: string; protocol: string };
  busy: boolean;
  blocked: boolean;
  onKey: (draft: KeyDraft) => Promise<boolean>;
  onLogin: (provider: string, label: string) => void;
}) {
  const [providerId, setProviderId] = useState(initialProvider);
  const [label, setLabel] = useState(preset?.label ?? "");
  const [key, setKey] = useState("");
  const [url, setUrl] = useState(preset?.url ?? "https://api.openai.com/v1");
  const [protocol, setProtocol] = useState(preset?.protocol ?? "chat_completions");
  const [coding, setCoding] = useState(false);
  const provider = providers.find((p) => p.id === providerId);
  const ready =
    !busy && !blocked && label.trim().length > 0 && (providerId !== "opencode-go" || coding);
  return (
    <section className="space-y-5" aria-labelledby="add-connection-title">
      <h2 id="add-connection-title" className="sr-only">
        Tambahkan koneksi
      </h2>
      <form
        className="space-y-4"
        onSubmit={async (event) => {
          event.preventDefault();
          if (!ready || !key.trim()) return;
          const submittedKey = key;
          setKey("");
          const saved = await onKey({
            provider: providerId,
            label,
            api_key: submittedKey,
            base_url: url,
            protocol,
            workload: providerId === "opencode-go" ? "coding" : "general",
          });
          if (saved) setLabel("");
        }}
      >
        <div className="grid gap-4">
          <label className="space-y-2 text-sm">
            <span className="block">Provider</span>
            <NativeSelect
              className="h-10 w-full rounded-md border bg-background px-3"
              value={providerId}
              disabled={busy || blocked}
              onChange={(event) => {
                setProviderId(event.target.value);
                setKey("");
                setCoding(false);
              }}
            >
              {providers.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.label}
                </option>
              ))}
            </NativeSelect>
          </label>
          <label htmlFor="connection-label" className="space-y-2 text-sm">
            <span className="block">Nama koneksi</span>
            <Input
              id="connection-label"
              value={label}
              maxLength={100}
              required
              placeholder="Mis. Akun pribadi atau Workspace coding"
              onChange={(event) => setLabel(event.target.value)}
              disabled={busy || blocked}
            />
          </label>
        </div>
        {providerId === "chatgpt" ? (
          <p className="text-sm text-muted-foreground">
            Gunakan izin ChatGPT plan pada instalasi lokal yang memenuhi ketentuan. Akses hosted
            memerlukan persetujuan provider tersendiri.
          </p>
        ) : providerId === "opencode-go" ? (
          <label className="flex items-start gap-3 text-sm">
            <NativeChoice
              type="checkbox"
              checked={coding}
              onChange={(event) => setCoding(event.target.checked)}
              className="mt-1"
            />
            <span>
              Saya menggunakan Go untuk agent coding dalam workspace pribadi. Permintaan memakai
              kuota Go; paket ini bukan akses serbaguna untuk semua tugas.
            </span>
          </label>
        ) : (
          <p className="text-sm text-muted-foreground">
            {providerId === "openrouter"
              ? "Login membuat API key untuk akun OpenRouter Anda. Penggunaan memotong kredit OpenRouter."
              : providerId === "opencode-zen"
                ? "Gunakan personal API key OpenCode. Model berbayar memakai saldo pay-as-you-go."
                : "Pilih endpoint dan protokol yang sesuai dengan akun API Anda."}
          </p>
        )}
        {providerId === "custom" && (
          <details open={preset ? undefined : true} className="space-y-4">
            <summary className="cursor-pointer text-sm font-medium">Endpoint dan protokol</summary>
            <label htmlFor="connection-endpoint" className="space-y-2 text-sm">
              <span className="block">Endpoint API</span>
              <Input
                id="connection-endpoint"
                required
                type="url"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
              />
            </label>
            <label className="space-y-2 text-sm">
              <span className="block">Protokol</span>
              <NativeSelect
                className="h-10 w-full rounded-md border bg-background px-3"
                value={protocol}
                onChange={(e) => setProtocol(e.target.value)}
              >
                <option value="chat_completions">OpenAI Chat Completions</option>
                <option value="codex_responses">OpenAI Responses</option>
                <option value="anthropic_messages">Anthropic Messages</option>
              </NativeSelect>
            </label>
          </details>
        )}
        {provider?.auth_methods.includes("api_key") && (
          <label htmlFor="connection-key" className="block space-y-2 text-sm">
            <span className="block">API key</span>
            <Input
              id="connection-key"
              type="password"
              autoComplete="off"
              spellCheck={false}
              value={key}
              onChange={(event) => setKey(event.target.value)}
              placeholder="Tempel key dari provider"
              disabled={busy || blocked}
            />
          </label>
        )}
        <div className="flex flex-wrap gap-3">
          {provider?.auth_methods.includes("oauth") && (
            <Button
              type="button"
              disabled={!ready || !provider.available}
              onClick={() => onLogin(providerId, label)}
            >
              {providerId === "chatgpt" ? "Sign in with ChatGPT" : "Login dengan OpenRouter"}
            </Button>
          )}
          {provider?.auth_methods.includes("api_key") && (
            <Button
              type="submit"
              disabled={!ready || !key.trim()}
              variant={providerId === "openrouter" ? "outline" : "default"}
            >
              {busy ? "Menyimpan…" : "Simpan API key"}
            </Button>
          )}
        </div>
        {providerId === "chatgpt" && !provider?.available && (
          <p className="text-sm text-muted-foreground">
            ChatGPT plan belum diaktifkan untuk instalasi ini. Hubungi pengelola instalasi.
          </p>
        )}
      </form>
    </section>
  );
}
