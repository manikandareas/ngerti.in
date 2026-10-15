import { useAuth } from "@clerk/tanstack-react-start";
import { useMutation } from "@tanstack/react-query";
import { ShieldCheck } from "lucide-react";
import { useState } from "react";
import { api, type Run } from "../lib/api";

export function AccessPanel() {
  const { getToken } = useAuth();
  const [id, setId] = useState("");
  const lookup = useMutation({
    mutationFn: async () =>
      api<Run>(`/dev/runs/${encodeURIComponent(id.trim())}`, await getToken()),
  });
  return (
    <section className="access-section">
      <h2>
        <ShieldCheck size={19} />
        Periksa kepemilikan pekerjaan
      </h2>
      <p className="subtle">
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
          <input
            id="access-run-id"
            value={id}
            onChange={(event) => {
              setId(event.target.value);
              lookup.reset();
            }}
            placeholder="UUID pekerjaan"
            required
          />
          <button className="button secondary" type="submit" disabled={lookup.isPending}>
            {lookup.isPending ? "Memeriksa…" : "Periksa akses"}
          </button>
        </div>
      </form>
      {lookup.data ? (
        <p className="notice" role="status">
          Pekerjaan ditemukan: {lookup.data.id} · {lookup.data.status}
        </p>
      ) : lookup.error ? (
        <p className="notice error" role="status">
          {lookup.error.message}
        </p>
      ) : null}
    </section>
  );
}
