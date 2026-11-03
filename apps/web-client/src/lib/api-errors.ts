const repairs: Record<string, string> = {
  LOGIN_REQUIRED: "Akun perlu dihubungkan kembali. Periksa login pada pengaturan koneksi.",
  SERVICE_UNAVAILABLE:
    "Koneksi sementara belum tersedia. Sistem akan mencoba kembali secara terbatas.",
  ROUTING_UNAVAILABLE: "Penjawab belum dapat dipilih. Coba lagi untuk pesan yang sama.",
  ROUTING_UNRESOLVED: "Penerima belum jelas. Perjelas permintaanmu sebelum mencoba lagi.",
  ROUTING_CONTEXT_LIMIT: "Konteks permintaan terlalu panjang. Ringkas pesan lalu coba lagi.",
  ROUTING_STALE: "Anggota atau konteks grup sudah berubah. Coba pilih penjawab kembali.",
  ADAPTER_UNAVAILABLE: "Layanan akun belum tersedia. Periksa service backend, lalu coba lagi.",
  CREDENTIAL_MISSING: "API key belum tersedia pada host. Tambahkan key melalui Providers.",
  VERSION_UNKNOWN: "Versi runtime belum dikenali. Periksa versi yang terpasang pada host backend.",
  PROBE_FAILED: "Runtime belum dapat diperiksa. Periksa instalasinya pada host backend.",
  MODEL_UNAVAILABLE: "Pilih model yang tersedia di pengaturan koneksi.",
  AUTH_REQUIRED: "Hubungkan akun pada pengaturan, lalu periksa kembali koneksinya.",
  AUTH_REJECTED: "Akun ditolak. Periksa login pada host harness.",
  BILLING_MISMATCH:
    "Sumber biaya tidak cocok dengan pilihanmu. Periksa koneksi tanpa mengganti billing otomatis.",
  EXECUTABLE_MISSING: "Harness belum ditemukan pada host backend.",
  VERSION_TOO_OLD: "Versi harness terlalu lama. Perbarui harness pada host backend.",
  NATIVE_REJECTED: "Harness menolak permintaan. Periksa model, reasoning, dan koneksi.",
  NATIVE_UNKNOWN: "Hasil pengiriman belum diketahui. Jangan kirim ulang; periksa status.",
  STALE_DISPATCH: "Sesi pekerjaan sudah berubah. Muat permintaan terbaru sebelum menjawab.",
  CAPABILITY_UNSUPPORTED: "Kemampuan ini tidak didukung oleh harness yang dipilih.",
  CAPABILITY_UNKNOWN: "Dukungan kemampuan ini belum diketahui. Periksa koneksi terlebih dahulu.",
  CONFLICT: "Data sudah berubah. Muat state terbaru sebelum mengubahnya lagi.",
  UNAUTHORIZED: "Koneksi lokal belum terautentikasi. Periksa service dan installation host.",
};
export function repairMessage(code: string) {
  return (
    repairs[code] ??
    "Periksa pengaturan dan status koneksi. Hasil yang belum diketahui perlu direkonsiliasi."
  );
}
