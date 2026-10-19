import { Button } from "@/components/ui/button";
import {
  useProactivityCommand,
  useProactivityScope,
} from "@/features/proactivity/hooks/use-proactivity-preferences";
import { IntensitySelect } from "./intensity-select";

export function ProactivityScopeControl({ scope, id }: { scope: "thread" | "goal"; id: string }) {
  const data = useProactivityScope(scope, id);
  const command = useProactivityCommand();
  const value = data.data;
  function change(patch: Record<string, unknown>) {
    if (value) command.mutate({ scope, scope_id: id, expected_revision: value.revision, ...patch });
  }
  return (
    <details className="min-w-0 rounded-xl border px-3 py-2 text-sm">
      <summary className="cursor-pointer py-1">
        Saran proaktif {scope === "thread" ? "di percakapan ini" : "untuk tujuan ini"}
      </summary>
      <div className="space-y-3 py-3">
        {value ? (
          <>
            <IntensitySelect
              value={value.intensity ?? "inherit"}
              inherit
              disabled={command.isPending}
              onChange={(v) => change(v === "inherit" ? { inherit: true } : { intensity: v })}
            />
            <div className="flex flex-wrap gap-2">
              <Button
                variant="outline"
                disabled={command.isPending}
                onClick={() =>
                  change({ snoozed_until: new Date(Date.now() + 3600000).toISOString() })
                }
              >
                Jeda 1 jam
              </Button>
              {value.snoozed_until ? (
                <Button
                  variant="outline"
                  disabled={command.isPending}
                  onClick={() => change({ clear_snooze: true })}
                >
                  Akhiri jeda
                </Button>
              ) : null}
            </div>
            {value.snoozed_until && new Date(value.snoozed_until) > new Date() ? (
              <p>Jeda sampai {new Date(value.snoozed_until).toLocaleString()}.</p>
            ) : null}
            <p className="text-xs text-muted-foreground">
              Pengaturan akun dan jam tenang tetap berlaku. Task/Jadwal yang sudah diminta tetap
              berjalan.
            </p>
          </>
        ) : (
          <Button variant="outline" onClick={() => void data.refetch()}>
            Muat preferensi
          </Button>
        )}
        {command.isError || data.isError ? (
          <p role="alert">{command.error?.message ?? "Preferensi belum tersinkron."}</p>
        ) : null}
        {command.isSuccess ? <p role="status">Preferensi sudah diperbarui.</p> : null}
      </div>
    </details>
  );
}
