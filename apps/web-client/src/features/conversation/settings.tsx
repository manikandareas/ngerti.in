import { useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { command, request } from "./api";
import type { Agent, Availability, Connection } from "./types";

export function ConnectionSettings({
  agent,
  connections,
  refresh,
  report,
}: {
  agent?: Agent;
  connections: Connection[];
  refresh: () => Promise<unknown>;
  report: (error: string) => void;
}) {
  const [availability, setAvailability] = useState<Availability[]>([]);
  const [busy, setBusy] = useState(false);
  const [login, setLogin] = useState<{
    auth_url?: string;
    user_code?: string;
    status?: string;
  } | null>(null);
  const [harness, setHarness] = useState("codex");
  const [method, setMethod] = useState("native_login");
  const [credential, setCredential] = useState("");
  const connection = connections.find((item) => item.id === agent?.connection_id);
  useEffect(() => {
    request<Availability[]>("/v1/harnesses")
      .then(setAvailability)
      .catch((error) => report(error.message));
  }, [report]);
  async function act(action: () => Promise<unknown>) {
    setBusy(true);
    try {
      await action();
      await refresh();
      report("");
    } catch (error) {
      report(error instanceof Error ? error.message : "Permintaan gagal");
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="space-y-5">
      {availability.map((item) => (
        <div key={item.harness} className="flex items-start justify-between gap-3 text-sm">
          <div>
            <p className="font-medium capitalize">
              {item.harness === "codex" ? "Codex / ChatGPT" : "Muse Code"}
            </p>
            <p className="text-caption text-muted-foreground">
              {item.version ?? "Versi belum diketahui"} · minimum {item.manifest.minimum_version}
            </p>
          </div>
          <Badge variant="outline">{item.state}</Badge>
        </div>
      ))}
      {agent && (
        <div className="space-y-3">
          <Label htmlFor="agent-connection">Koneksi {agent.name}</Label>
          <NativeSelect
            id="agent-connection"
            value={agent.connection_id ?? ""}
            disabled={busy}
            onChange={(e) => {
              const selected = connections.find((c) => c.id === e.target.value);
              if (selected)
                void act(() =>
                  command(`/v1/agents/${agent.id}/configuration`, {
                    expected_revision: agent.revision,
                    changes: {
                      connection_id: selected.id,
                      harness: selected.harness,
                      billing_source: selected.authentication.billing_source,
                      model_id: null,
                      reasoning: null,
                    },
                  }),
                );
            }}
          >
            <NativeSelectOption value="">Pilih koneksi</NativeSelectOption>
            {connections
              .filter((c) => c.state === "active")
              .map((c) => (
                <NativeSelectOption key={c.id} value={c.id}>
                  {c.harness} · {c.account_id ?? "Belum masuk"} · {c.authentication.billing_source}
                </NativeSelectOption>
              ))}
          </NativeSelect>
          {connection && (
            <>
              <p className="text-caption text-muted-foreground">
                Akun: {connection.account_id ?? "Belum diketahui"} · Login: {connection.login}
                <br />
                Biaya dipilih: {connection.authentication.billing_source} · Terverifikasi:{" "}
                {connection.effective_billing_source}
                <br />
                Model discovery: {connection.discovery} · Inference: {connection.inference}
              </p>
              <div className="flex flex-wrap gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  disabled={busy}
                  onClick={() =>
                    void act(() => request(`/v1/connections/${connection.id}/inspect`, {}))
                  }
                >
                  Periksa akun & model
                </Button>
                {connection.authentication.method === "native_login" && (
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={busy}
                    onClick={() =>
                      void act(async () =>
                        setLogin(await request(`/v1/connections/${connection.id}/login`, {})),
                      )
                    }
                  >
                    Hubungkan akun
                  </Button>
                )}
              </div>
              {login && (
                <div className="rounded-lg border p-3 text-sm">
                  <p>{login.status}</p>
                  {login.user_code && <code>{login.user_code}</code>}
                  {login.auth_url && /^https:\/\//.test(login.auth_url) && (
                    <a
                      className="text-link underline"
                      href={login.auth_url}
                      target="_blank"
                      rel="noreferrer"
                    >
                      Lanjutkan login
                    </a>
                  )}
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() =>
                      void act(async () => {
                        await request(`/v1/connections/${connection.id}/login/cancel`, {});
                        setLogin(null);
                      })
                    }
                  >
                    Batalkan login
                  </Button>
                </div>
              )}
              <Label htmlFor="agent-model">Model</Label>
              <NativeSelect
                id="agent-model"
                disabled={busy}
                value={agent.model_id ?? ""}
                onChange={(e) =>
                  void act(() =>
                    command(`/v1/agents/${agent.id}/configuration`, {
                      expected_revision: agent.revision,
                      changes: { model_id: e.target.value || null, reasoning: null },
                    }),
                  )
                }
              >
                <NativeSelectOption value="">Pilih model</NativeSelectOption>
                {connection.models.map((model) => (
                  <NativeSelectOption value={model.id} key={model.id}>
                    {model.id}
                  </NativeSelectOption>
                ))}
              </NativeSelect>
              <Label htmlFor="agent-reasoning">Reasoning</Label>
              <NativeSelect
                id="agent-reasoning"
                disabled={busy}
                value={agent.reasoning ?? ""}
                onChange={(e) =>
                  void act(() =>
                    command(`/v1/agents/${agent.id}/configuration`, {
                      expected_revision: agent.revision,
                      changes: { reasoning: e.target.value || null },
                    }),
                  )
                }
              >
                <NativeSelectOption value="">Default harness</NativeSelectOption>
                {connection.models
                  .find((m) => m.id === agent.model_id)
                  ?.reasoning.map((level) => (
                    <NativeSelectOption value={level} key={level}>
                      {level}
                    </NativeSelectOption>
                  ))}
              </NativeSelect>
              <details>
                <summary className="cursor-pointer text-sm">Kemampuan harness</summary>
                <dl className="mt-3 space-y-2 text-caption">
                  {Object.entries(connection.capabilities).map(([name, state]) => (
                    <div className="flex justify-between gap-4" key={name}>
                      <dt>{name.replaceAll("_", " ")}</dt>
                      <dd>{state}</dd>
                    </div>
                  ))}
                </dl>
              </details>
            </>
          )}
        </div>
      )}
      <details>
        <summary className="cursor-pointer text-sm font-medium">Tambah koneksi</summary>
        <div className="mt-3 space-y-3">
          <Label htmlFor="new-harness">Harness</Label>
          <NativeSelect
            id="new-harness"
            value={harness}
            onChange={(e) => setHarness(e.target.value)}
          >
            <NativeSelectOption value="codex">Codex / ChatGPT</NativeSelectOption>
            <NativeSelectOption value="muse">Muse Code</NativeSelectOption>
          </NativeSelect>
          <Label htmlFor="new-billing">Metode dan sumber biaya</Label>
          <NativeSelect id="new-billing" value={method} onChange={(e) => setMethod(e.target.value)}>
            <NativeSelectOption value="native_login">Login akun · subscription</NativeSelectOption>
            <NativeSelectOption value="api_key">API key · biaya API</NativeSelectOption>
          </NativeSelect>
          {method === "api_key" && (
            <>
              <Label htmlFor="credential">Referensi credential di host</Label>
              <Input
                id="credential"
                value={credential}
                onChange={(e) => setCredential(e.target.value)}
                placeholder="UUID credential yang tersimpan"
              />
              <p className="text-caption text-muted-foreground">
                Gunakan credential yang sudah disiapkan pada host backend.
              </p>
            </>
          )}
          <Button
            disabled={busy || (method === "api_key" && !credential)}
            onClick={() =>
              void act(() =>
                command("/v1/connections", {
                  harness,
                  authentication:
                    method === "native_login"
                      ? { method, billing_source: "subscription" }
                      : { method, billing_source: "api_key", credential_ref: credential },
                }),
              )
            }
          >
            Tambah koneksi
          </Button>
        </div>
      </details>
    </div>
  );
}
