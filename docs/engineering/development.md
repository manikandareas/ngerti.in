# Development dan operasi

## Keputusan #02

- Baseline tetap LangChain `create_agent`, LangGraph, dan Procrastinate. Workflow diagnostik tidak memanggil model; percakapan dan generation Course mengikuti tiket berikutnya.
- Docker hanya menjalankan PostgreSQL 16/pgvector serta MinIO. API, worker, dan web dijalankan langsung di mesin.
- Sesuai arahan pengguna, penerimaan storage #02 menggunakan MinIO. Konfigurasi R2 disiapkan, tetapi verifikasi R2 ditunda.
- Pengujian perilaku dilakukan manual melalui browser. CI menjalankan pemeriksaan statis dan build; tidak ada suite unit/integration/E2E otomatis.

## Startup

Standar konten #003 dapat diperiksa tanpa provider atau database melalui `make content-inspect`.
Lihat [kontrak konten](course-content-standard.md), [handoff engine](course-generation-design.md),
dan [bukti penerimaan #003](content-03-manual-acceptance.md). Root `.env` menyimpan credentials
provider server-only; inspector fixture tidak membacanya dan CI tidak memanggil provider.

1. Salin `.env.example` ke `.env` hanya jika file belum ada.
2. Isi `VITE_CLERK_PUBLISHABLE_KEY` dan `CLERK_SECRET_KEY` dari instance Clerk development khusus Ngertiin. Semua credentials server tetap di `.env`, yang diabaikan Git.
3. `make install` memasang dependency JS dan Python dari lockfile.
4. `make infra-up` menjalankan container dan menunggu healthcheck.
5. `make setup` menerapkan migrasi serta menyiapkan bucket lokal.
6. `make dev` menjalankan API, worker, dan web. Buka `http://127.0.0.1:3000/dev/system`.

Untuk chat #04, isi `OPENAI_API_KEY` dan `OPENAI_MODEL` sebelum menjalankan API/worker, lalu buka halaman utama setelah login. `make migrate` menerapkan tabel chat serta posisi pesan pada revision `0003_chat_order`. Worker harus aktif untuk menghasilkan jawaban; subscription browser hanya membaca event yang sudah tersimpan. [Kontrak dan penerimaan chat](chat-04-implementation.md) menjelaskan approval, replay, stop, dan recovery.

Gunakan origin yang sama sepanjang sesi (`127.0.0.1` atau `localhost`). Kedua origin development diterima backend. Jika browser memblokir `localhost`, alamat IPv4 `127.0.0.1` adalah alamat listen aplikasi. Jangan menonaktifkan perlindungan browser untuk membuka aplikasi.

## Environment

| Konfigurasi | Pemakai | Tujuan |
| --- | --- | --- |
| `DATABASE_URL` | API, worker, migrasi | PostgreSQL yang sama |
| `VITE_CLERK_PUBLISHABLE_KEY` | Web | Identitas instance Clerk publik |
| `CLERK_SECRET_KEY` | Server web dan API | Validasi sesi, tidak dikirim ke client |
| `WEB_ORIGIN` | API | CORS dan validasi authorized party token |
| `VITE_API_URL` | Web | Alamat API yang dapat diakses browser |
| `S3_*` | API, worker, setup | Endpoint, bucket, region, credentials, addressing style |
| `MINIO_ROOT_*` | Container MinIO | Credentials lokal |
| `OPENAI_API_KEY`, `OPENAI_MODEL`, `OPENAI_BASE_URL` | Worker; API memeriksa key tersedia | Adapter OpenAI Responses untuk chat |
| `CHAT_MAX_OUTPUT_TOKENS`, `CHAT_MAX_MODEL_CALLS`, `CHAT_RUN_TIMEOUT_SECONDS` | Worker | Batas per panggilan, iterasi, dan waktu satu turn |
| `APP_ENV`, `ENABLE_DEV_DIAGNOSTICS` | API dan build web | Membatasi fitur diagnostik ke development |

`VITE_*` menjadi bagian bundle publik. Jangan menggunakan prefix tersebut untuk secret. Setelah mengubah environment, restart proses terkait. Untuk production, gunakan `APP_ENV=production`, matikan diagnostik, dan injeksikan credentials melalui environment deployment. Validasi konfigurasi menolak diagnostik production dan endpoint production tanpa HTTPS.

## Migrasi

`make setup` menjalankan Alembic, membuat extension vector, memasang schema Procrastinate saat pertama kali, menjalankan migrasi checkpointer LangGraph, lalu memastikan bucket lokal tersedia. Proses ini dapat dijalankan ulang.

Migrasi tidak dijalankan secara otomatis oleh tiap replica API/worker. Saat menambah migrasi aplikasi, perbarui pemeriksaan revision pada `health.py`. Saat mengubah versi Procrastinate, terapkan SQL migration yang disediakan library dan perbarui record `runtime_schema_versions` setelah verifikasi; setup sengaja menolak pergantian versi queue secara diam-diam. Versi dependency dan lockfile direview bersama.

## Identitas dan batas akses

Request aplikasi menggunakan bearer session token Clerk. API memverifikasi token serta authorized party, lalu memetakan subject ke account UUID dengan constraint unik. Account baru dibuat pada request terautentikasi pertama. Identitas email bukan sumber otorisasi.

Request pembuatan pekerjaan tidak menerima owner ID. Satu transaksi menyimpan pekerjaan milik akun dan enqueue Procrastinate. Request key menjaga retry request yang sama tetap menghasilkan satu pekerjaan. Worker menerima run ID, lalu membaca pemilik dari database. Pencarian run, file, signed URL, dan penghapusan selalu dibatasi pada akun yang terautentikasi. Akses akun lain menghasilkan 404.

Halaman diagnostik hanya tersedia ketika environment development dan flag aktif. Status infrastrukturnya dapat dibaca sebelum login; menjalankan pekerjaan serta mengakses file selalu membutuhkan login.

## Worker dan recovery

Worker memperbarui heartbeat. Halaman sistem menandai worker belum siap ketika heartbeat melewati 30 detik. Pekerjaan diagnostik memakai execution/checkpoint ID yang ditentukan backend, terpisah dari sesi browser.

Retry kegagalan dibatasi tiga percobaan. Recovery memeriksa stalled jobs saat worker mulai dan setiap menit. Setelah worker mati paksa, tunggu heartbeat lama kedaluwarsa serta satu siklus recovery. Batas recovery tidak didasarkan hanya pada durasi job sehingga pekerjaan yang masih aktif tidak dianggap gagal karena lambat.

LangGraph menyimpan checkpoint secara sinkron pada batas task. Artifact menggunakan ID dan object key deterministik; mengulang langkah I/O dapat menulis ulang key yang sama, tetapi tidak membuat artifact atau hasil database ganda. Worker tidak menyimpan bearer token pengguna.

Untuk mencoba recovery, pilih jeda 30 detik pada diagnostik, jalankan job, lalu hentikan worker yang sedang memproses. Gunakan terminal terpisah (`make api`, `make worker`, `make web`) untuk mengisolasi penghentian worker. Restart worker dan periksa run ID yang sama sampai selesai. Pekerjaan baru setelah `failed` dibuat dengan tombol Jalankan pekerjaan.

## Storage

Bucket lokal bersifat private. API mengotorisasi metadata terlebih dahulu, lalu memberikan signed download URL berumur lima menit. URL tersebut merupakan akses sementara; jangan membagikannya. Database menyimpan object key, bukan URL sementara. Upload diagnostik dibatasi 5 MB; batas ingestion produk ditentukan pada tiket ingestion.

MinIO memakai release resmi `RELEASE.2025-09-07T16-13-09Z` yang diunduh dari GitHub Releases dan diverifikasi checksum-nya. Community repository telah diarsipkan; image ini dipakai untuk development lokal dan hanya bind pada loopback. Build image mendukung arm64 dan amd64.

Untuk mencoba R2 kelak, ganti `S3_ENDPOINT_URL` menjadi endpoint account R2, isi credentials/bucket terkait, dan gunakan `S3_REGION=auto`. Modul storage menggunakan operasi S3 dasar dan konfigurasi checksum yang sesuai subset R2. Ulangi pemeriksaan upload/download/delete serta signed URL terhadap R2 sebelum menyatakan integrasi production terverifikasi.

## Health dan diagnosis

- `/health/live`: proses HTTP hidup.
- `/health/ready`: koneksi DB, revision aplikasi, pgvector, schema queue, dan checkpoint siap. Worker/storage dilaporkan terpisah melalui diagnostik sehingga matinya worker tidak disamakan dengan matinya API.
- `/dev/status`: rincian tiap dependensi ketika diagnostik development aktif. Status Clerk hanya menyatakan konfigurasi tersedia; login nyata menjadi bukti autentikasi.
- Request ID dikirim melalui response header dan log. Worker mencatat run/job ID untuk menghubungkan gejala di browser dengan pekerjaan terkait. Token, secret, dan isi file tidak dicatat.

`make check` dan `make build` adalah pemeriksaan statis/build. CI memiliki konfigurasi yang sama dan membangun package Python. Eksekusi CI remote baru terjadi setelah repository terhubung ke penyedia Git; tidak ada push otomatis dari task ini.

## Data lokal

Namespace Compose `ngertiin-v1` memakai volume sendiri. `make infra-down` tidak menghapus data. Jangan menjalankan `down -v` pada data yang perlu dipertahankan. PostgreSQL memakai port 5433; MinIO memakai 9000/9001, sehingga instance lain yang memakai port yang sama perlu dihentikan atau port development disesuaikan.

## Struktur frontend

- `src/routes/` memuat kontrak route, search params, dan guard; detail fitur berada di `src/features/`.
- `features/chat/` memisahkan query daftar thread (`use-chat-threads`), panel/Drawer (`use-chat-history`), snapshot dan SSE (`use-thread`), draft/pengiriman/idempotency (`use-thread-composer`), serta approval/stop/retry (`use-thread-actions`). Reducer replay ada di `thread-state.ts`, terpisah dari DTO di `types.ts`.
- `Thread` menyusun transcript dan composer; `ThreadTranscript` mengelola tampilan history, pesan, approval, serta kontrol scroll. Pemilihan thread memberi key akun + thread agar state lokal dan subscription terisolasi.
- `features/diagnostics/` memiliki halaman sistem, status publik, identitas akun, panel file/job, hooks query/mutation, dan DTO diagnostik sendiri. `use-object-download` dipakai bersama oleh file dan artifact job.
- `components/ui/` menyimpan primitive shadcn; `ui/` menyimpan UI aplikasi bersama; `lib/api.ts` hanya menangani transport HTTP dan konfigurasi API. Gunakan import langsung dan Props bernama ketika komponen membutuhkan kontrak sendiri.
- Pisahkan berdasarkan tanggung jawab dan siklus state. Hindari membuat hook serbaguna yang mencampur query, penyimpanan browser, event listener, dan markup; logika turunan sederhana tetap dihitung saat render.

Jalankan `make check` dan `make build` setelah refactor. Verifikasi perilaku melalui browser; [bukti cleanup React](react-cleanup-2026-10-16.md) mencatat pemulihan draft/request key dan interaksi desktop/mobile.
