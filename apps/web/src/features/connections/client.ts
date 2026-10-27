import { ApiError, api } from "@/lib/api";

export const base = "/api/agent-engine/v1";
export type Provider = {
  id: string;
  label: string;
  auth_methods: string[];
  billing: string;
  workload: string;
  available: boolean;
};
export type Connection = {
  connection_id: string;
  provider: string;
  label: string;
  billing: string;
  account_id: string;
  registration_id: string | null;
  status: string;
  remote_revocation: string;
  base_url: string;
  protocol: string;
  workload: string;
  catalog_status: string;
  models: { id: string; label: string }[];
};
export type Listing = { items: Connection[]; providers: Provider[] };
export type Login = {
  attempt_id: string;
  status: string;
  expires_at: number;
  authorize_url?: string;
  error?: string;
  connection_id?: string;
};
export const statuses: Record<string, string> = {
  configured: "Periksa akses model",
  connected: "Model tersedia",
  disconnected: "Terputus",
  reconnect_required: "Hubungkan kembali",
};
const errors: Record<string, string> = {
  APP_AUTH_FAILED: "Login aplikasi belum berhasil. Periksa izin akun lalu mulai login kembali.",
  APP_GOOGLE_OAUTH_REQUIRED:
    "Koneksi Google perlu OAuth client milik Ngertiin. Pengelola aplikasi harus menyiapkan Client ID dan Client Secret di Google Cloud terlebih dahulu. Anda tidak perlu mengisi URL server.",
  APP_OAUTH_CLIENT_REQUIRED:
    "OAuth GitHub memerlukan Client ID aplikasi Ngertiin. Gunakan Atur ulang koneksi dan pilih Token akses, atau isi OAuth Client ID pada pengaturan tambahan.",
  OAUTH_STATE_INVALID: "Sesi login aplikasi sudah berubah atau kedaluwarsa. Mulai login kembali.",
  CONNECTOR_UNAVAILABLE:
    "Server aplikasi belum dapat dihubungi. Periksa koneksi dan coba periksa tools kembali.",
  INVALID_ENDPOINT:
    "Alamat layanan belum diizinkan. Minta operator menyiapkan URL server aplikasi ini.",
  ACCESS_REVOKED:
    "Izin koneksi sudah berubah. Perbarui koneksi dan simpan kembali pengaturan agent.",
  MODEL_UNAVAILABLE: "Model belum tersedia. Periksa koneksi dan pilih model untuk agent ini.",
  PROVIDER_RECONNECT_REQUIRED: "Akses sudah berakhir. Hubungkan akun kembali.",
  PROVIDER_ENTITLEMENT_REQUIRED: "Akun ini belum memiliki izin atau paket untuk akses tersebut.",
  PROVIDER_QUOTA_EXHAUSTED: "Kuota atau saldo provider habis. Periksa penggunaan di akun provider.",
  PROVIDER_REQUEST_REJECTED:
    "Permintaan ditolak provider. Periksa model dan pengaturan koneksi yang dipilih.",
  PROTOCOL_UNAVAILABLE:
    "Protokol ini belum tersedia pada instalasi engine. Perbarui paket runtime sebelum menggunakannya.",
  CREDENTIAL_METADATA_REJECTED:
    "Provider mengembalikan metadata yang tidak aman. Koneksi belum diperbarui.",
  PROVIDER_RATE_LIMITED:
    "Batas permintaan provider tercapai. Tunggu sebentar sebelum mencoba kembali.",
  PROVIDER_UNAVAILABLE: "Provider belum dapat dihubungi. Coba kembali beberapa saat lagi.",
  PROVIDER_DEPLOYMENT_UNVERIFIED:
    "ChatGPT plan belum diaktifkan untuk instalasi ini. Pilihan ini memerlukan konfigurasi lokal yang memenuhi ketentuan provider.",
  CONNECTION_IDENTITY_CONFLICT:
    "Identitas koneksi berbeda. Tambahkan akun sebagai koneksi baru agar pilihan agent tetap jelas.",
  ENGINE_UNAVAILABLE: "Akun sedang disiapkan. Tunggu sebentar, lalu muat ulang.",
};
export function providerFailureMessage(code: string) {
  return errors[code] || code;
}
export function connectionError(error: unknown) {
  return error instanceof ApiError
    ? errors[error.code ?? ""] || error.message
    : "Perubahan belum terkonfirmasi. Silakan coba kembali.";
}
export function send<T>(path: string, token: string | null, body?: unknown, method = "POST") {
  return api<T>(`${base}${path}`, token, {
    method,
    headers: { "Content-Type": "application/json" },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
}
