import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { command } from "@/lib/api-client";
import type { Agent, Connection } from "@/types/workspace";

export function ConnectionSettings({
  agent,
  connections,
  refresh,
  report,
  manageProviders,
}: {
  agent: Agent;
  connections: Connection[];
  refresh: () => Promise<unknown>;
  report: (error: string) => void;
  manageProviders: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const lock = useRef(false);
  const connection = connections.find((item) => item.id === agent.connection_id);
  const model = connection?.models.find((item) => item.id === agent.model_id);
  async function configure(changes: Record<string, unknown>) {
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    try {
      await command(`/v1/agents/${agent.id}/configuration`, {
        expected_revision: agent.revision,
        changes,
      });
      await refresh();
      report("");
    } catch (error) {
      report(error instanceof Error ? error.message : "Perubahan gagal.");
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }
  return (
    <div className="space-y-3">
      <Label htmlFor="agent-connection">Koneksi {agent.name}</Label>
      <Select
        value={agent.connection_id ?? ""}
        disabled={busy}
        onValueChange={(id) => {
          const selected = connections.find((item) => item.id === id);
          if (selected)
            void configure({
              connection_id: selected.id,
              harness: selected.harness,
              billing_source: selected.authentication.billing_source,
              model_id: null,
              reasoning: null,
            });
        }}
      >
        <SelectTrigger id="agent-connection" className="w-full">
          <SelectValue placeholder="Pilih koneksi" />
        </SelectTrigger>
        <SelectContent>
          {connections
            .filter((item) => item.state === "active" || item.id === agent.connection_id)
            .map((item) => (
              <SelectItem key={item.id} value={item.id} disabled={item.state !== "active"}>
                {item.harness === "codex" ? "ChatGPT" : "Muse Code"} ·{" "}
                {item.account_id ??
                  (item.authentication.method === "api_key" ? "API key" : "Belum login")}{" "}
                · {item.authentication.billing_source}
                {item.state === "revoked" ? " · Diputus" : ""}
              </SelectItem>
            ))}
        </SelectContent>
      </Select>
      <Button size="sm" variant="outline" onClick={manageProviders}>
        Kelola providers
      </Button>
      {connection && (
        <>
          <p className="text-caption text-muted-foreground">
            Biaya dipilih: {connection.authentication.billing_source} · Terverifikasi:{" "}
            {connection.effective_billing_source === "unknown"
              ? "Belum diketahui"
              : connection.effective_billing_source}
          </p>
          <Label htmlFor="agent-model">Model</Label>
          <Select
            disabled={busy || connection.state !== "active"}
            value={agent.model_id ?? "__none"}
            onValueChange={(id) =>
              void configure({ model_id: id === "__none" ? null : id, reasoning: null })
            }
          >
            <SelectTrigger id="agent-model" className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__none">Pilih model</SelectItem>
              {agent.model_id && !model && (
                <SelectItem value={agent.model_id} disabled>
                  {agent.model_id} · Tidak tersedia
                </SelectItem>
              )}
              {connection.models.map((item) => (
                <SelectItem value={item.id} key={item.id}>
                  {item.id}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {!connection.models.length && (
            <p className="text-caption text-muted-foreground">
              Belum ada model. Periksa akun & model di Providers terlebih dahulu.
            </p>
          )}
          <Label htmlFor="agent-reasoning">Reasoning</Label>
          <Select
            disabled={busy || connection.state !== "active"}
            value={agent.reasoning ?? "__default"}
            onValueChange={(value) =>
              void configure({ reasoning: value === "__default" ? null : value })
            }
          >
            <SelectTrigger id="agent-reasoning" className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__default">Default harness</SelectItem>
              {agent.reasoning && !model?.reasoning.includes(agent.reasoning) && (
                <SelectItem value={agent.reasoning} disabled>
                  {agent.reasoning} · Tidak tersedia
                </SelectItem>
              )}
              {model?.reasoning.map((level) => (
                <SelectItem value={level} key={level}>
                  {level}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </>
      )}
    </div>
  );
}
