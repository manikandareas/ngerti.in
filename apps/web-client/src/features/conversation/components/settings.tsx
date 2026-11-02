import { ChevronRight, KeyRound, ShieldCheck, Sparkles } from "lucide-react";
import { billingLabel } from "@/features/settings/components/shared";
import type { Agent, Connection } from "@/types/workspace";
import { ModelPicker } from "./model-picker";
import { PanelCard, PanelNavRow } from "./panel-primitives";

type ConnectionSettingsProps = {
  agent: Agent;
  connections: Connection[];
  refresh: () => Promise<unknown>;
  report: (error: string) => void;
  manageProviders: () => void;
};

// OpenMausBot DetailsTab: a compact Model row reuses the shared account/model menu.
export function AgentModelRow(props: ConnectionSettingsProps) {
  return (
    <div className="px-3.5 py-0.5">
      <ModelPicker
        {...props}
        contained
        label={
          <span className="flex min-w-0 flex-1 items-center gap-2.5">
            <span
              className="grid size-7 shrink-0 place-items-center rounded-lg bg-foreground/[0.05] text-muted-foreground max-md:size-8 max-md:rounded-full"
              aria-hidden="true"
            >
              <Sparkles size={15} strokeWidth={1.5} />
            </span>
            <span className="text-[14px] font-medium text-foreground">Model</span>
          </span>
        }
      />
    </div>
  );
}

const states: Record<string, string> = {
  authenticated: "Terhubung",
  unauthenticated: "Perlu login",
  required: "Perlu login",
  active: "Aktif",
  revoked: "Diputus",
  succeeded: "Terverifikasi",
  failed: "Gagal",
  cancelled: "Dihentikan",
  not_attempted: "Belum diuji",
  discovered: "Model tersedia",
  supported: "Didukung",
  unsupported: "Tidak didukung",
  unknown: "Belum diketahui",
};
const capabilityNames: Record<string, string> = {
  resume: "Melanjutkan sesi",
  steer: "Arahan saat bekerja",
  image_input: "Input gambar",
  video_input: "Input video",
  compaction: "Ringkasan konteks",
  product_tools: "Tools Ngertiin",
  settings: "Pengaturan sesi",
  permission_requests: "Keputusan tindakan",
};
export function ConnectionSettings(props: ConnectionSettingsProps) {
  const { agent, connections, manageProviders } = props;
  const connection = connections.find((item) => item.id === agent.connection_id);
  const selectedBilling = agent.billing_source ?? connection?.authentication.billing_source;
  return (
    <div className="space-y-3.5">
      <PanelCard>
        <AgentModelRow {...props} />
        <PanelNavRow
          title="Kelola providers"
          icon={KeyRound}
          hint={
            connection
              ? connection.harness === "muse"
                ? "Muse Code"
                : "ChatGPT"
              : "Hubungkan akun untuk mulai bekerja"
          }
          value={connection ? billingLabel(selectedBilling ?? "unknown") : undefined}
          onClick={manageProviders}
        />
      </PanelCard>
      {connection && (
        <details className="group/connection rounded-[12px] bg-composer ring-1 ring-inset ring-foreground/[0.06]">
          <summary className="flex min-h-[46px] cursor-pointer list-none items-center gap-2.5 px-3.5 py-[11px] text-[14px] [&::-webkit-details-marker]:hidden">
            <ShieldCheck size={15} strokeWidth={1.5} className="text-muted-foreground" />
            <span className="flex-1 font-medium">Status koneksi</span>
            <ChevronRight
              size={15}
              strokeWidth={1.5}
              className="text-muted-foreground group-open/connection:rotate-90"
            />
          </summary>
          <dl className="divide-y divide-foreground/[0.05] text-[13px] [&>div]:px-3.5 [&>div]:py-2.5 [&_dt]:mb-1 [&_dt]:text-muted-foreground [&_dd]:break-words">
            <div>
              <dt>Provider</dt>
              <dd>{connection.harness === "muse" ? "Muse Code" : "ChatGPT"}</dd>
            </div>
            <div>
              <dt>Autentikasi</dt>
              <dd>
                {connection.authentication.method === "api_key" ? "API key" : "Login akun"} ·{" "}
                {states[connection.login] ?? "Belum terverifikasi"}
              </dd>
            </div>
            <div>
              <dt>Sumber biaya dipilih</dt>
              <dd>{billingLabel(selectedBilling ?? "unknown")}</dd>
            </div>
            <div>
              <dt>Sumber biaya terverifikasi</dt>
              <dd>{billingLabel(connection.effective_billing_source)}</dd>
            </div>
            <div>
              <dt>Koneksi</dt>
              <dd>{states[connection.state] ?? "Belum terverifikasi"}</dd>
            </div>
            <div>
              <dt>Model tersedia</dt>
              <dd>
                {connection.models.length
                  ? `${connection.models.length} model`
                  : "Belum ada model. Periksa akun & model di Providers terlebih dahulu."}
              </dd>
            </div>
            <div>
              <dt>Inferensi</dt>
              <dd>{states[connection.inference] ?? "Belum terverifikasi"}</dd>
            </div>
            {Object.entries(connection.capabilities).map(([name, state]) => (
              <div key={name}>
                <dt>{capabilityNames[name] ?? name.replaceAll("_", " ")}</dt>
                <dd>{states[state] ?? "Belum diketahui"}</dd>
              </div>
            ))}
          </dl>
        </details>
      )}
    </div>
  );
}
