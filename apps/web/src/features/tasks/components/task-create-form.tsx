import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useCreateTask } from "@/features/tasks/hooks/use-create-task";

interface TaskCreateFormProps {
  threadId: string | null;
}

export function TaskCreateForm({ threadId }: TaskCreateFormProps) {
  const { form, sending, error, create } = useCreateTask(threadId);
  const { instruction, review } = form;
  return (
    <form
      className="space-y-4 rounded-2xl border bg-card p-5"
      onSubmit={(event) => {
        event.preventDefault();
        void create();
      }}
    >
      <label htmlFor="task-instruction" className="block text-sm font-bold">
        Titipkan pekerjaan teks
      </label>
      <Textarea
        id="task-instruction"
        placeholder="Contoh: susun rencana peluncuran dari diskusi di percakapan ini…"
        value={instruction}
        disabled={sending}
        maxLength={6000}
        className="min-h-28"
        onChange={(event) => {
          const value = event.target.value;
          form.update(value, review);
        }}
      />
      <label className="flex items-start gap-3 text-sm">
        <input
          type="checkbox"
          checked={review}
          disabled={sending}
          onChange={(event) => form.update(instruction, event.target.checked)}
          className="mt-1 size-4 accent-primary"
        />
        Minta review sebelum hasil difinalisasi
      </label>
      <p className="text-xs text-muted-foreground">
        Menggunakan konteks percakapan yang sedang dipilih. Membuat task memakai 1 pesan; review,
        stop dan mencoba ulang task tidak menambah pesan. Pekerjaan dibatasi budget dan tetap
        berjalan saat browser ditutup.
      </p>
      <Button type="submit" disabled={sending || !threadId || !instruction.trim()}>
        {sending ? "Menyimpan task…" : "Mulai task"}
      </Button>
      {error ? (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      ) : null}
    </form>
  );
}
