# Penggantian runtime Daytona dengan E2B

Implementasi dan uji development lokal **20 Oktober 2026 WITA**, atas instruksi pengguna setelah `E2B_API_KEY` ditambahkan. Provider default untuk browser/VNC dan eksekusi Python sekarang **E2B**, SDK inti **2.56.0**. Tidak ada top-up, perubahan paket, atau pemindahan login pribadi ke provider baru.

## Implementasi

- Adapter browser: [computer/e2b.py](../../apps/backend/src/ngertiin/computer/e2b.py). Template `ngertiin-desktop-v1` diturunkan dari template resmi `desktop`, dengan **2 vCPU/4 GiB**. Template resmi tanpa penyesuaian teramati 8 vCPU/8 GiB pada akun ini, sehingga tidak dipakai langsung.
- Adapter Python: [sandbox/e2b.py](../../apps/backend/src/ngertiin/sandbox/e2b.py). Template `ngertiin-code-v1` diturunkan dari `base` pada **2 vCPU/4 GiB**. Template base default teramati 512 MiB, sehingga dibuatkan alokasi eksplisit.
- [Operasi SDK bersama](../../apps/backend/src/ngertiin/e2b.py) memakai request timeout, identitas deterministik melalui metadata, lookup running/paused, dan receipt nonzero yang dibedakan dari hasil transport ambigu. Create yang ambigu tidak diulang otomatis di adapter. Alokasi dan private ingress diperiksa sebelum capability digunakan.
- SDK `e2b-desktop==2.7.0` tidak dipasang karena membutuhkan Pillow <13, sedangkan aplikasi membutuhkan Pillow >=13. Template desktop resmi tetap dipakai, dengan [bootstrap dan GUI operation tepercaya](../../apps/backend/src/ngertiin/computer/desktop_io.py). Koneksi ulang tidak bergantung pada private stream helper SDK Desktop yang hanya diinisialisasi saat `create()`.
- [Launcher browser](../../apps/backend/src/ngertiin/computer/desktop.py) memilih Chromium/Google Chrome dan home aktual. CDP loopback, proxy public-only, batas profil/download dan deadline supervisor dipertahankan. Desktop memakai 1280×720.
- [ViewerEndpoint](../../apps/backend/src/ngertiin/computer/contracts.py) membawa URL upstream dan header hanya di server. [Gateway](../../apps/backend/src/ngertiin/computer/viewer.py) meneruskan `e2b-traffic-access-token` ke WebSocket E2B; token/upstream tidak dikirim ke UI. RFB tetap disaring menurut owner, grant, control version dan human/agent state. `viewOnly` client bukan otorisasi.
- Browser memakai private ingress, VNC loopback dan `on_timeout=pause` dengan mode filesystem serta `auto_resume=false`. Stop menutup browser untuk flush profil, kemudian mengonfirmasi provider paused. Heartbeat viewer memeriksa resource dan tidak memperpanjang deadline. Health check menunggu proxy/CDP/viewer dan HTTPS publik sebelum workspace dinyatakan siap.
- Python memakai private ingress dan outbound disabled, lifecycle kill, UID 65534, seccomp inherited, environment allowlist serta hard limits. Profil browser tidak dipasang pada runtime Python. Backing filesystem E2B teramati sekitar 22 GiB; batas file/output aplikasi tetap terpisah dan tidak mengklaim kuota disk Daytona 8 GiB berlaku pada E2B.
- [Migrasi 0018](../../apps/backend/migrations/versions/0018_browser_provider_profiles.py) memperbolehkan satu profil tersimpan per owner/provider. Workspace Daytona lama tidak ditimpa atau dinyatakan sudah terhapus. Task baru memakai E2B; sesi/profil lama tetap memakai adapter serta policy lamanya untuk rekonsiliasi/retensi. Kendali aktif atau outcome ambigu pada provider lama tetap memblokir pemakaian baru. Login lama tidak diekspor; pengguna login kembali melalui takeover E2B.

## Konfigurasi dan operasi

```dotenv
E2B_API_KEY=<server-only>
E2B_SANDBOX_TEMPLATE=ngertiin-code-v1
E2B_COMPUTER_TEMPLATE=ngertiin-desktop-v1
SANDBOX_PROVIDER=e2b
COMPUTER_PROVIDER=e2b
SANDBOX_PRICE_VERSION=e2b-linux-2026-10-20
SANDBOX_RESOURCE_MICROUSD_PER_HOUR=165600
COMPUTER_STORAGE_MICROUSD_PER_HOUR=0
```

```sh
make install
make e2b-templates
make migrate
make e2b-browser-probe
uv run --project apps/backend python scripts/probe_e2b_browser.py --live --deadline \
  --output .dev/e2b-migration/deadline-live.json
```

Build template merupakan operasi setup eksplisit, bukan bagian setiap Task. [Build script](../../scripts/build_e2b_templates.py) menetapkan 2 vCPU/4096 MiB sebelum template dipakai. Restart API dan worker setelah perubahan konfigurasi/dependency; autoreload API tidak mereload worker.

Estimasi compute adalah **165.600 micro USD/jam**, berdasarkan tarif publik 2 vCPU/4 GiB. Retensi filesystem-paused mempunyai rate runtime nol menurut dokumentasi provider saat migrasi; policy dan rate disnapshot per sesi. Ini bukan invoice provider, harga pelanggan, atau janji biaya provider tidak akan berubah. Unknown provisioning/stop tetap mempertahankan reservasi. [Pricing E2B](https://e2b.dev/pricing), [persistence](https://docs.e2b.dev/sandbox/persistence).

## Bukti live

| Pemeriksaan | Hasil dan bukti |
| --- | --- |
| Internet dalam browser | Google dan example.com termuat tanpa halaman network error melalui proxy aplikasi; judul `Google` dan `Example Domain`. [Readback](evidence/e2b-2026-10-20/browser-live.json), [Google](evidence/e2b-2026-10-20/google.png), [example.com](evidence/e2b-2026-10-20/example.png). |
| Private VNC | HTTP viewer tanpa token ditolak 401/403, WebSocket dengan header server memperoleh RFB 3.8. [Readback](evidence/e2b-2026-10-20/browser-live.json). |
| Profil, restart dan unduhan | Marker profil bertahan setelah filesystem pause dan adapter/client baru; sandbox ID sama, screenshot tersedia, bytes unduhan cocok, resource probe akhirnya dihapus. [Readback](evidence/e2b-2026-10-20/browser-live.json). |
| Worker tidak tersedia | Probe memakai batas 60 detik, tanpa heartbeat/connect/cleanup worker selama menunggu; resource paused teramati sekitar 1,54 detik setelah deadline, lalu resource probe dihapus. [Deadline](evidence/e2b-2026-10-20/deadline-live.json). |
| Python offline dan hard limits | Socket/child network, sudo, pembacaan environment root dan io_uring ditolak; UID 65534, environment bersih dan hard limit tidak dapat dinaikkan. Output log 16.000 byte, symlink ditolak, memori/file oversized dihentikan, infinite loop keluar 124 dalam sekitar 2,25 detik. [Probe](evidence/e2b-2026-10-20/python-live.json). |
| File/Result sesudah penghapusan compute | Producer Python memakai ledger Task nyata; resource terhapus terkonfirmasi, hasil tetap dapat dibaca dengan bytes yang sama. [Probe](evidence/e2b-2026-10-20/python-live.json). |
| Takeover privat dalam UI | Login akun demo publik The Internet dilakukan lewat viewer/RFB pada emulasi 390×844, lalu kendali dikembalikan. Backend mencatat nol observasi agent selama human control. [Readback](evidence/e2b-2026-10-20/human-privacy.json). |
| Login lintas Task dari chat UI | Task A login melalui takeover; Task D memakai workspace/sandbox yang sama setelah pause dan restart worker. Secure Area tetap terbuka tanpa login ulang/logout. Kedua `hasil.md` dapat dibaca setelah compute paused, checksum cocok. [Readback aplikasi](evidence/e2b-2026-10-20/app-readback.json). |

Task A dibuat dari chat UI pada side chat khusus pengujian, ID `df2c8f48-c7ec-4ad6-923a-9b80cd541548`. Percobaan awal gagal pada parsing keputusan model sebelum dispatch navigasi; retry terkontrol menerima keputusan model valid, lalu login manual melalui takeover berhasil. Sesudah return, agent mengamati **Secure Area**, menyimpan `hasil.md` dan menyelesaikan Task.

Uji berikutnya menemukan bug terpisah dari jaringan/provider: respons model memuat teks `commentary` dan JSON `final_answer`, sedangkan parser structured output LangChain menyatukan keduanya dan menolak JSON. [Parser browser](../../apps/backend/src/ngertiin/computer/model.py) sekarang membaca tepat satu blok final eksplisit dan memvalidasi seluruh JSON dengan skema `Action`. Commentary tidak dapat menjadi aksi. Respons tanpa final, argumen tidak valid, refusal, atau hasil incomplete tetap ditolak; tidak ada ekstraksi JSON parsial atau replay otomatis. Pembukuan penggunaan tetap diselesaikan pada setiap call. Makna phase sesuai [dokumentasi Responses API](https://developers.openai.com/api/docs/guides/reasoning#phase-parameter).

Regresi commentary+final direproduksi gagal sebelum perbaikan, lalu lulus sesudahnya bersama tiga kasus penolakan. Task B yang gagal sebelum perbaikan tetap tercatat failed; Task C diagnostik dibatalkan sebelum proposal navigasinya disetujui. Sesudah perbaikan dan restart worker, Task D baru `bcf9df86-f6de-4c4e-8381-c4cd469bb170` berhasil dalam dua call model: navigasi dan finish. UI menampilkan hasil pemeriksaan login tetap aktif. Workspace E2B akhirnya stopped, provider paused, seluruh sesi pengujian stopped, dan tidak ada job audit tertunda. Riwayat percobaan serta hasil 187/180 byte dengan SHA-256 tersedia dalam [readback](evidence/e2b-2026-10-20/app-readback.json).

## Verifikasi terkontrol dan batas penerimaan

Kontrak browser **56**, sandbox **45**, Task **55**, dan File **47** lulus pada snapshot commit terisolasi yang hanya memuat migrasi ini. Kontrak browser mencakup provider switch (antre ketika profil lama aktif, wake setelah stop, profil lama tidak tertimpa, Task provider baru berhasil) serta empat kasus parsing phase/refusal. [Browser](evidence/e2b-2026-10-20/computer-contracts.json), [sandbox](evidence/e2b-2026-10-20/sandbox-contracts.json), [Task](evidence/e2b-2026-10-20/task-contracts.json), [File](evidence/e2b-2026-10-20/files-contracts.json).

`make check` dan `make build` lulus di workspace development; `make docs-check` juga lulus pada snapshot commit terisolasi. Verifikasi ini development lokal, bukan production rollout, audit seluruh situs web, atau invoice provider. Tidak ada ekspor cookie/profil pribadi atau credential provider pada evidence. Masa retensi tujuh hari tetap ditegakkan maintenance aplikasi; tidak menunggu tujuh hari nyata dalam pengujian ini.
