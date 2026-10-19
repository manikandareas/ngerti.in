import { Link } from "@tanstack/react-router";
import { useId, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  useProactivityCommand,
  useProactivityPreferences,
} from "@/features/proactivity/hooks/use-proactivity-preferences";
import type { ProactivityIntensity, ProactivityPreference } from "@/features/proactivity/types";
import { IntensitySelect } from "./intensity-select";

function timeValue(minutes: number) {
  return `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;
}

function PreferenceForm({ preferences }: { preferences: ProactivityPreference }) {
  const id = useId();
  const command = useProactivityCommand();
  const [draft, setDraft] = useState<ProactivityPreference | null>(null);
  const value = draft ?? preferences;
  function update(patch: Partial<ProactivityPreference>) {
    setDraft({ ...value, ...patch });
  }
  return (
    <form
      className="space-y-4"
      onSubmit={(event) => {
        event.preventDefault();
        command.mutate(
          {
            expected_revision: value.revision,
            intensity: value.intensity,
            timezone: value.timezone,
            quiet_enabled: value.quiet_enabled,
            quiet_start: value.quiet_start,
            quiet_end: value.quiet_end,
            acknowledge: true,
          },
          { onSuccess: () => setDraft(null) },
        );
      }}
    >
      <IntensitySelect
        value={value.intensity}
        onChange={(v) => update({ intensity: v as ProactivityIntensity })}
        disabled={command.isPending}
      />
      <label htmlFor={`${id}-timezone`} className="block text-sm">
        Timezone
        <Input
          id={`${id}-timezone`}
          value={value.timezone}
          onChange={(e) => update({ timezone: e.target.value })}
          placeholder="Asia/Makassar"
          className="mt-2"
          required
        />
      </label>
      {!preferences.onboarded_at ? (
        <Button
          type="button"
          variant="ghost"
          className="h-auto whitespace-normal text-left"
          onClick={() => update({ timezone: Intl.DateTimeFormat().resolvedOptions().timeZone })}
        >
          Gunakan timezone perangkat
        </Button>
      ) : null}
      <div className="flex items-center justify-between gap-4">
        <label htmlFor={`${id}-quiet`} className="text-sm">
          Jam tenang
        </label>
        <input
          type="checkbox"
          className="size-5 accent-primary"
          id={`${id}-quiet`}
          checked={value.quiet_enabled}
          onChange={(e) => update({ quiet_enabled: e.target.checked })}
        />
      </div>
      {value.quiet_enabled ? (
        <div className="grid min-w-0 grid-cols-2 gap-3">
          {(["quiet_start", "quiet_end"] as const).map((key) => (
            <label key={key} className="min-w-0 text-sm" htmlFor={`${id}-${key}`}>
              {key === "quiet_start" ? "Mulai" : "Sampai"}
              <Input
                id={`${id}-${key}`}
                className="mt-2 min-w-0"
                type="time"
                value={timeValue(value[key])}
                required
                onChange={(e) => {
                  const [hour, minute] = e.target.value.split(":").map(Number);
                  if (Number.isFinite(hour) && Number.isFinite(minute))
                    update({ [key]: hour * 60 + minute });
                }}
              />
            </label>
          ))}
        </div>
      ) : null}
      <p className="text-xs text-muted-foreground">
        Intensitas mengatur selektivitas dan jarak saran, tanpa target jumlah pesan. Jam tenang
        mengikuti timezone di atas.
      </p>
      {command.isError ? (
        <div role="alert" className="space-y-2 text-sm">
          <p>{command.error.message}</p>
          <Button
            type="button"
            variant="outline"
            onClick={() => {
              setDraft(null);
              command.reset();
            }}
          >
            Muat versi terbaru
          </Button>
        </div>
      ) : null}
      {command.isSuccess ? (
        <p role="status" className="text-sm">
          Preferensi sudah tersimpan.
        </p>
      ) : null}
      <Button disabled={command.isPending}>
        {command.isPending
          ? "Menyimpan…"
          : preferences.onboarded_at
            ? "Simpan preferensi"
            : "Simpan pilihan dan lanjutkan"}
      </Button>
    </form>
  );
}

export function ProactivitySettings({ onboarding = false }: { onboarding?: boolean }) {
  const data = useProactivityPreferences();
  const command = useProactivityCommand();
  const prefs = data.data?.preferences;
  if (onboarding && (!prefs || prefs.onboarded_at)) return null;
  return (
    <section className="min-w-0 space-y-5 py-6" aria-label="Proaktivitas Gwen">
      <div>
        <h2 className="font-bold">Bantuan spontan dari Gwen</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          Gwen dapat menyampaikan perkembangan berguna atau meminta masukan tanpa menunggu pesanmu,
          termasuk saat aplikasi ditutup. Kamu bisa mengatakan “kurangi saran proaktif” atau
          “matikan pesan proaktif”.
        </p>
      </div>
      {prefs ? (
        <>
          {!prefs.onboarded_at ? (
            <p className="rounded-xl bg-muted p-3 text-sm">
              Pilih intensitas sebelum memulai. Normal disarankan untuk akun baru; pilihan Nonaktif
              tetap tersedia. Hasil Task dan Jadwal yang kamu minta tetap tersimpan.
            </p>
          ) : null}
          <PreferenceForm preferences={prefs} />
          {prefs.onboarded_at ? (
            <div className="flex flex-wrap gap-2">
              <Button
                variant="outline"
                disabled={command.isPending}
                onClick={() =>
                  command.mutate({
                    expected_revision: prefs.revision,
                    snoozed_until: new Date(Date.now() + 3600000).toISOString(),
                  })
                }
              >
                Jeda saran 1 jam
              </Button>
              {prefs.snoozed_until ? (
                <Button
                  variant="outline"
                  disabled={command.isPending}
                  onClick={() =>
                    command.mutate({ expected_revision: prefs.revision, clear_snooze: true })
                  }
                >
                  Akhiri jeda
                </Button>
              ) : null}
            </div>
          ) : null}
          {prefs.snoozed_until && new Date(prefs.snoozed_until) > new Date() ? (
            <p className="text-sm">
              Saran dijeda sampai {new Date(prefs.snoozed_until).toLocaleString()}.
            </p>
          ) : null}
          {command.isError ? (
            <p role="alert" className="text-sm">
              {command.error.message}
            </p>
          ) : null}
          {!onboarding && data.data?.deliveries.length ? (
            <div className="space-y-2">
              <h3 className="text-sm font-bold">Saran terbaru</h3>
              {data.data.deliveries.map((d) => (
                <p key={d.candidate_id} className="text-sm wrap-anywhere">
                  <Link to="/" search={{ thread: d.thread_id, view: "chat" }}>
                    {d.title ?? "Saran tersimpan"} · {d.thread_title}
                  </Link>
                </p>
              ))}
            </div>
          ) : null}
        </>
      ) : (
        <div role={data.isError ? "alert" : "status"}>
          <p>{data.isError ? "Preferensi belum dapat dimuat." : "Memuat preferensi…"}</p>
          <Button variant="outline" onClick={() => void data.refetch()}>
            Coba lagi
          </Button>
        </div>
      )}
    </section>
  );
}

export function ProactivityOnboarding() {
  const data = useProactivityPreferences();
  if (!data.data || data.data.preferences.onboarded_at) return null;
  return (
    <details open className="max-h-[50vh] overflow-y-auto">
      <summary className="cursor-pointer py-2 text-xs text-muted-foreground">
        Kenali bantuan spontan Gwen
      </summary>
      <ProactivitySettings onboarding />
    </details>
  );
}
