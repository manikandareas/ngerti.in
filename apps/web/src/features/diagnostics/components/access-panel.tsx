import { ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useRunAccess } from "@/features/diagnostics/hooks/use-run-access";

export function AccessPanel() {
  const { id, setId, lookup } = useRunAccess();
  return (
    <section className="col-span-full border-t py-6 [&_h2]:mb-3 [&_h2]:flex [&_h2]:items-center [&_h2]:gap-2 [&_form]:mt-4 [&_label]:mb-2 [&_label]:block [&_label]:text-xs [&_label]:font-extrabold [&_form>div]:flex [&_form>div]:gap-3">
      <h2>
        <ShieldCheck size={19} />
        Periksa kepemilikan pekerjaan
      </h2>
      <p className="text-[13px] text-muted-foreground">
        Salin ID pekerjaan dari akun pertama, lalu coba ID yang sama setelah masuk dengan akun
        kedua. Akun lain harus menerima “Pekerjaan tidak ditemukan”.
      </p>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          lookup.mutate();
        }}
      >
        <label htmlFor="access-run-id">ID pekerjaan</label>
        <div>
          <Input
            id="access-run-id"
            value={id}
            onChange={(event) => {
              setId(event.target.value);
              lookup.reset();
            }}
            placeholder="UUID pekerjaan"
            required
          />
          <Button variant="outline" type="submit" disabled={lookup.isPending}>
            {lookup.isPending ? "Memeriksa…" : "Periksa akses"}
          </Button>
        </div>
      </form>
      {lookup.data ? (
        <p
          className="my-6 flex flex-col items-start justify-between gap-4 rounded-xl bg-secondary px-5 py-4 text-sm min-[701px]:flex-row min-[701px]:items-center"
          role="status"
        >
          Pekerjaan ditemukan: {lookup.data.id} · {lookup.data.status}
        </p>
      ) : null}
      {!lookup.data && lookup.error ? (
        <p className="my-6 rounded-xl bg-danger-subtle px-5 py-4 text-sm text-danger" role="status">
          {lookup.error.message}
        </p>
      ) : null}
    </section>
  );
}
