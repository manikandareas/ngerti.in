import { Input } from "@/components/ui/input";

type Props = {
  configured: boolean;
  clientId: string;
  clientSecret: string;
  onClientId: (value: string) => void;
  onClientSecret: (value: string) => void;
};

export function GoogleSetup({
  configured,
  clientId,
  clientSecret,
  onClientId,
  onClientSecret,
}: Props) {
  const redirect = typeof window !== "undefined" ? `${window.location.origin}/connections` : "";
  return (
    <div className="space-y-3 rounded-lg border p-3 text-sm sm:col-span-2">
      <p>
        Hubungkan Gmail pribadi atau akun Google Workspace. Koneksi ini mencakup Gmail, Drive,
        Calendar, Docs, dan Sheets; URL server disiapkan Ngertiin.
      </p>
      {configured ? (
        <p className="text-muted-foreground">
          OAuth aplikasi sudah disiapkan. Simpan koneksi, lalu lanjutkan login Google.
        </p>
      ) : (
        <>
          <p className="font-medium">
            Pengelola Ngertiin perlu menyiapkan OAuth Google sekali terlebih dahulu.
          </p>
          <ol className="list-decimal space-y-2 pl-5 text-muted-foreground">
            <li>
              Buat atau pilih project di{" "}
              <a
                href="https://console.cloud.google.com/"
                target="_blank"
                rel="noreferrer"
                className="underline"
              >
                Google Cloud
              </a>
              , lalu aktifkan Gmail API, Google Drive API, Google Calendar API, Google Docs API, dan
              Google Sheets API.
            </li>
            <li>
              Di Google Auth Platform, siapkan aplikasi External. Jika masih Testing, tambahkan
              alamat Gmail Anda sebagai test user.
            </li>
            <li>
              Buat OAuth client jenis Web application dengan Authorized redirect URI berikut:{" "}
              <code className="block break-all py-1">{redirect}</code>
            </li>
            <li>
              Masukkan Client ID dan Client Secret aplikasi di bawah. Keduanya berasal dari Google
              Cloud, bukan password akun Google.
            </li>
          </ol>
          <p className="text-xs text-muted-foreground">
            Untuk penggunaan publik, ikuti proses verifikasi dan kebijakan Google. Token aplikasi
            Testing dengan scope sensitif dapat berakhir setelah tujuh hari.{" "}
            <a
              className="underline"
              href="https://developers.google.com/identity/protocols/oauth2/web-server"
              target="_blank"
              rel="noreferrer"
            >
              Panduan OAuth Google
            </a>
            .
          </p>
        </>
      )}
      <div className="grid gap-3 sm:grid-cols-2">
        <label htmlFor="google-client-id" className="space-y-1">
          Client ID aplikasi Google
          <Input
            id="google-client-id"
            required={!configured}
            autoComplete="off"
            value={clientId}
            onChange={(e) => onClientId(e.target.value)}
            placeholder={
              configured ? "Kosongkan untuk mempertahankan" : "…apps.googleusercontent.com"
            }
          />
        </label>
        <label htmlFor="google-client-secret" className="space-y-1">
          Client Secret aplikasi Google
          <Input
            id="google-client-secret"
            required={!configured}
            type="password"
            autoComplete="off"
            value={clientSecret}
            onChange={(e) => onClientSecret(e.target.value)}
            placeholder={configured ? "Kosongkan untuk mempertahankan" : "Dari Google Cloud"}
          />
        </label>
      </div>
    </div>
  );
}
