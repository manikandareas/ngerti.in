import type { Connection } from "@/types/workspace";

export const runtimeStates: Record<string, string> = {
  supported: "Siap digunakan",
  missing: "Belum terpasang",
  too_old: "Perlu diperbarui",
  unknown: "Versi belum diketahui",
  probe_failed: "Gagal diperiksa",
};

export const observedStates: Record<string, string> = {
  authenticated: "Berhasil",
  unauthenticated: "Belum login",
  required: "Perlu login",
  rejected: "Ditolak",
  unknown: "Belum diketahui",
  succeeded: "Berhasil",
  failed: "Gagal",
  cancelled: "Dihentikan",
  not_attempted: "Belum dicoba",
};

/** Keep revocation tombstones; a delayed projection must not restore an older account. */
export function mergeConnections(...sources: Connection[][]) {
  const latest = new Map<string, Connection>();
  for (const source of sources)
    for (const connection of source) {
      const previous = latest.get(connection.id);
      if (!previous || connection.revision >= previous.revision)
        latest.set(connection.id, connection);
    }
  return [...latest.values()];
}
