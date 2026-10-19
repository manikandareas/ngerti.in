import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { AttachmentPicker } from "@/features/files/components/attachment-picker";
import { OutputFields } from "@/features/files/components/output-fields";
import { useAttachments } from "@/features/files/hooks/use-attachments";
import { GoalSelector } from "@/features/goals/components/goal-selector";
import { WorkEstimate } from "@/features/quotas/components/work-estimate";
import { useScheduleDraft } from "@/features/schedules/hooks/use-schedule-draft";
import { useScheduleCommands } from "@/features/schedules/hooks/use-schedules";
import type { Schedule } from "@/features/schedules/types";

export function ScheduleForm({
  threadId,
  schedule,
  onClose,
}: {
  threadId: string | null;
  schedule?: Schedule;
  onClose?: () => void;
}) {
  const scope = `${schedule?.id ?? threadId}:${schedule?.revision ?? "new"}`;
  const { value, update } = useScheduleDraft(scope, schedule?.spec);
  const attachments = useAttachments(`schedule:${scope}`);
  const command = useScheduleCommands();
  return (
    <form
      className="space-y-4 rounded-2xl border bg-card p-5"
      onSubmit={(event) => {
        event.preventDefault();
        if (!threadId) return;
        const inputs = [
          ...value.inputs,
          ...attachments.items.map((item) => ({
            revision_id: item.file.id,
            start: item.start,
            end: item.end,
          })),
        ];
        void command
          .propose(
            threadId,
            schedule ? "update" : "create",
            { ...value, inputs: value.runtime_kind === "browser" ? [] : inputs },
            schedule?.id,
            schedule?.revision,
          )
          .then((result) => {
            if (result && onClose) onClose();
          });
      }}
    >
      <h2 className="font-bold">{schedule ? "Ubah jadwal" : "Buat jadwal"}</h2>
      <GoalSelector
        id="schedule-goal"
        value={value.goal}
        disabled={command.pending}
        onChange={(goal) => update({ goal })}
      />
      <div className="space-y-2">
        <label htmlFor="schedule-title" className="text-sm">
          Nama jadwal
        </label>
        <Input
          id="schedule-title"
          value={value.title}
          maxLength={100}
          required
          onChange={(e) => update({ title: e.target.value })}
        />
      </div>
      <div className="space-y-2">
        <label htmlFor="schedule-instruction" className="text-sm">
          Pekerjaan Gwen
        </label>
        <Textarea
          id="schedule-instruction"
          value={value.instruction}
          maxLength={6000}
          required
          className="min-h-28"
          placeholder="Contoh: buat ringkasan mingguan dari halaman ini…"
          onChange={(e) => update({ instruction: e.target.value })}
        />
      </div>
      <div className="space-y-2">
        <label htmlFor="schedule-frequency" className="text-sm">
          Pengulangan
        </label>
        <Select
          value={value.frequency}
          onValueChange={(frequency) =>
            update({
              frequency: frequency as typeof value.frequency,
              interval_hours: frequency === "interval" ? (value.interval_hours ?? 3) : null,
            })
          }
        >
          <SelectTrigger id="schedule-frequency" className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="once">Sekali</SelectItem>
            <SelectItem value="daily">Setiap hari</SelectItem>
            <SelectItem value="weekly">Mingguan / pilih hari</SelectItem>
            <SelectItem value="interval">Setiap beberapa jam</SelectItem>
          </SelectContent>
        </Select>
      </div>
      {value.frequency === "interval" ? (
        <div className="space-y-2">
          <label htmlFor="schedule-interval" className="text-sm">
            Setiap berapa jam
          </label>
          <Input
            id="schedule-interval"
            type="number"
            min={1}
            max={8760}
            step={1}
            required
            value={value.interval_hours ?? ""}
            onChange={(e) =>
              update({ interval_hours: e.target.value === "" ? null : Number(e.target.value) })
            }
          />
          <p className="text-xs text-muted-foreground">
            Dihitung dari tanggal dan pukul mulai, termasuk lintas malam. Contoh: setiap 3 jam mulai
            09:00 akan berjalan pukul 09:00, 12:00, 15:00, dan seterusnya.
          </p>
        </div>
      ) : null}
      {value.frequency === "weekly" ? (
        <fieldset className="space-y-2">
          <legend className="mb-2 text-sm">Hari</legend>
          <div className="flex flex-wrap gap-3">
            {["Senin", "Selasa", "Rabu", "Kamis", "Jumat", "Sabtu", "Minggu"].map((name, day) => (
              <label key={name} className="flex min-h-10 items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={value.weekdays.includes(day)}
                  onChange={(e) =>
                    update({
                      weekdays: e.target.checked
                        ? [...value.weekdays, day].sort()
                        : value.weekdays.filter((v) => v !== day),
                    })
                  }
                />
                {name}
              </label>
            ))}
          </div>
        </fieldset>
      ) : null}
      <div className="grid min-w-0 gap-3 min-[420px]:grid-cols-2">
        <div className="min-w-0 space-y-2">
          <label htmlFor="schedule-date" className="text-sm">
            {value.frequency === "once" ? "Tanggal" : "Mulai tanggal"}
          </label>
          <Input
            id="schedule-date"
            type="date"
            className="min-w-0 max-w-full"
            value={value.start_date}
            required
            onInput={(e) => update({ start_date: e.currentTarget.value })}
            onChange={(e) => update({ start_date: e.target.value })}
          />
        </div>
        <div className="min-w-0 space-y-2">
          <label htmlFor="schedule-time" className="text-sm">
            Pukul
          </label>
          <Input
            id="schedule-time"
            type="time"
            value={value.local_time}
            required
            onInput={(e) => update({ local_time: e.currentTarget.value })}
            onChange={(e) => update({ local_time: e.target.value })}
          />
        </div>
      </div>
      <div className="space-y-2">
        <label htmlFor="schedule-zone" className="text-sm">
          Zona waktu
        </label>
        <Input
          id="schedule-zone"
          value={value.timezone}
          required
          placeholder="Asia/Makassar"
          onChange={(e) => update({ timezone: e.target.value })}
        />
        <p className="text-xs text-muted-foreground">
          Zona melekat pada jadwal, termasuk saat kamu berpindah lokasi.
        </p>
      </div>
      <div className="space-y-2">
        <label htmlFor="schedule-runtime" className="text-sm">
          Cara mengerjakan
        </label>
        <Select
          value={value.runtime_kind}
          onValueChange={(runtime_kind) =>
            update({ runtime_kind: runtime_kind as typeof value.runtime_kind })
          }
        >
          <SelectTrigger id="schedule-runtime" className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="text">Teks dan file</SelectItem>
            <SelectItem value="code">Python offline</SelectItem>
            <SelectItem value="browser">Browser pribadi</SelectItem>
          </SelectContent>
        </Select>
      </div>
      {value.runtime_kind === "browser" ? (
        <p className="text-xs text-muted-foreground">
          Tulis URL yang dimaksud dalam instruksi. Jika perlu login atau keputusan, pekerjaan
          menunggu bantuanmu.
        </p>
      ) : (
        <>
          <AttachmentPicker state={attachments} disabled={command.pending} />
          {value.inputs.length ? (
            <p className="text-xs">
              {value.inputs.length} revision file dari jadwal lama dipertahankan.{" "}
              <button type="button" className="underline" onClick={() => update({ inputs: [] })}>
                Lepaskan lampiran lama
              </button>
            </p>
          ) : null}
        </>
      )}
      <OutputFields
        value={value.outputs}
        onChange={(outputs) => update({ outputs })}
        disabled={command.pending}
      />
      <div className="space-y-2">
        <label htmlFor="schedule-cap" className="text-sm">
          Batas kerja per eksekusi
        </label>
        <Input
          id="schedule-cap"
          type="number"
          min={30000}
          max={120000}
          step={1000}
          value={value.per_run_cap}
          required
          onChange={(e) => update({ per_run_cap: Number(e.target.value) })}
        />
        <p className="text-xs text-muted-foreground">
          Unit kerja internal; penggunaan aktual dan cadangan terlihat pada Task. Batas akun/global
          tetap berlaku.
        </p>
      </div>
      <label className="flex min-h-11 items-center gap-3 text-sm">
        <input
          type="checkbox"
          checked={value.review_required}
          onChange={(e) => update({ review_required: e.target.checked })}
        />
        Tinjau hasil sebelum difinalisasi
      </label>
      <p className="text-xs text-muted-foreground">
        Instruksi dan konteks percakapan disimpan saat preview. Pekerjaan tetap dipicu saat browser
        ditutup; eksekusi otomatis memakai budget Task tanpa pesan chat baru.
      </p>
      <WorkEstimate
        scheduled
        runtimeKind={value.runtime_kind}
        perRunCap={value.per_run_cap}
        inputs={[
          ...value.inputs.map((item) => item.revision_id),
          ...attachments.items.map((item) => item.file.id),
        ]}
      />
      <div className="flex flex-wrap gap-2">
        <Button
          type="submit"
          disabled={command.pending || !threadId || attachments.progress !== null}
        >
          {command.pending ? "Menyiapkan…" : "Tinjau jadwal"}
        </Button>
        {onClose ? (
          <Button type="button" variant="outline" onClick={onClose}>
            Tutup editor
          </Button>
        ) : null}
      </div>
      {command.error ? (
        <p role="alert" className="text-sm text-danger">
          {command.error}
        </p>
      ) : null}
    </form>
  );
}
