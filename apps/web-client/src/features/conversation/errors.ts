const repairs: Record<string, string> = {
  MODEL_UNAVAILABLE: "Pilih model yang tersedia di pengaturan koneksi.",
  AUTH_REQUIRED: "Hubungkan akun pada pengaturan, lalu periksa kembali koneksinya.",
  AUTH_REJECTED: "Akun ditolak. Periksa login pada host harness.",
  BILLING_MISMATCH:
    "Sumber biaya tidak cocok dengan pilihanmu. Periksa koneksi tanpa mengganti billing otomatis.",
  EXECUTABLE_MISSING: "Harness belum ditemukan pada host backend.",
  VERSION_TOO_OLD: "Versi harness terlalu lama. Perbarui harness pada host backend.",
  NATIVE_REJECTED: "Harness menolak permintaan. Periksa model, reasoning, dan koneksi.",
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
