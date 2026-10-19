# 06 · Development, Operasi & Acceptance

Sumber: [Notion](https://app.notion.com/p/3fdabdd6187381d39f94f7161d4ef570) · Readback: 2026-10-19T06:29:38.106391+00:00

<!-- notion-content:start -->
## Setup development bersih

Prasyarat: Bun, uv, Python dan Docker/OrbStack. Salin .env.example ke .env, isi kredensial pada mesin sendiri, lalu make install → make infra-up → make setup → make dev. UI [http://localhost:3000](http://localhost:3000), API loopback :8000, PostgreSQL :5433, MinIO :9000/console :9001. Auth memakai Clerk; tidak ada auth bypass production.

make setup menjalankan Alembic baseline, Procrastinate official schema dan LangGraph PostgresSaver.setup serta bucket lokal. make migrate hanya database. Keduanya dapat diulang; queue library version berbeda perlu official SQL migrations, bukan schema replacement diam-diam.

## Reset development yang telah diotorisasi

Hentikan API/worker host sebelum reset agar tidak menulis data saat volume dibangun ulang. make reset-dev menjalankan script yang memverifikasi APP_ENV=development, local DATABASE_URL/S3 endpoint/kredensial, Compose project ngertiin-v1, service/mount dan label dua volume. Mode validasi: `uv run --project apps/backend python scripts/reset_dev.py`. Mode eksekusi: make reset-dev.

Resource yang dihapus: ngertiin-v1_postgres-data dan ngertiin-v1_minio-data beserta container/network proyek. Akun lokal, chat, approval, checkpoint, queue, usage dan file MinIO hilang. Akun Clerk, .env, kredensial, Daytona dan environment lain dipertahankan. Tidak memakai docker system prune atau reset resource remote. Baseline baru tidak kompatibel dengan migration head/data pembelajaran lama.

## Startup readiness diagnosis

Pemeriksaan membedakan API hidup dari dependency dan worker yang siap.

**Alur:** infra-up → setup → API/worker → /health/live, /health/ready → /dev/system bila enabled.

**State:** ready/unavailable per database/migrations/pgvector/queue/checkpoints/worker/storage/auth.

**Input → output:** Validated env, migration/library versions, heartbeat → readiness/detail tanpa secrets.

**Kegagalan & pemulihan:** Database/MinIO mati, stale queue schema, worker heartbeat hilang dan provider failure mempunyai indikator; log request/run/job IDs dipakai untuk diagnosis.

**Izin:** Diagnostics hanya APP_ENV development + ENABLE_DEV_DIAGNOSTICS; object/run commands owner-scoped; production diagnostics mati.

**Biaya:** Diagnostics bounded; jangan mencatat token/secret/file pribadi; probe memakai resource dan budget kecil.

**Acceptance:** Startup fresh DB, repeated setup, worker recovery dan storage ownership diuji; readiness current migration head.

Bukti modul: [REA-1 · Chat & Session](../research/muse-ai-v1/evidence/chat.md). Tiket: [NG-029 · Buat baseline skema dan reset development](../backlog/tasks/29-buat-baseline-skema-dan-reset-development.md) · [NG-030 · Terima baseline V1 yang bersih](../backlog/tasks/30-terima-baseline-v1-yang-bersih.md) · [NG-023 · Recovery end-to-end dan konsistensi state](../backlog/tasks/23-recovery-end-to-end-dan-konsistensi-state.md).

## Acceptance dan rekam bukti

Gate cleanup NG-026–030: make check, make build, make quota-inspect, startup, login nyata, main/side chat/model streaming, snapshot/replay, stop/retry, worker crash/recovery, cross-owner read/write/event rejection, storage upload/download/delete dan quota rejection/draft. Probe ledger menggunakan database sementara yang dihapus setelah selesai; tidak bergantung materi pembelajaran.

Gate fitur baru: setiap tiket merekam environment/provider version, tanggal, input, expected/actual, resource IDs non-secret, trace/screenshot dan biaya. Walkthrough browser membuktikan alur pengguna; probe concurrency/ownership/fencing dan fault injection membuktikan failure boundaries. Static Pen atau bukti lama tidak menutup penerimaan baru.

P01–P30 di matriks penerimaan aktif mencakup onboarding; same-thread task; approval/revision/replay; crash/stop/unknown effect; owner/isolation/resource caps; result persistence; file failure; memory/forget/persona; goals; offline schedules/DST/downtime; proactive cap/no-op/delivery; quota/cost version; source injection; isolated preview; deployment dan restore.

Bukti baseline baru: repository docs/engineering/[NG-030 · Bukti penerimaan baseline V1](baseline-v1-acceptance.md) dan docs/engineering/evidence/baseline-v1/. Bukti lama #01–05 disimpan sebagai catatan historis; detail runtime lama tidak dianggap current.

## Operasi menuju release

NG-023 menguji pemulihan menyeluruh dan backup/restore, termasuk sandbox provider yang hilang setelah restore. NG-041 mengukur kualitas/latency/biaya lifecycle asisten umum. NG-025 hanya Done setelah semua capability wajib diterima, termasuk Daytona/VNC/takeover. Production R2, CI remote dan security/runtime efficacy tetap gap sampai bukti baru tersedia.

Rujukan: [04 · Arsitektur, Runtime & Kontrak](../product/04-arsitektur-dan-delivery.md) · [05 · Usage, Paket & Pembayaran](../product/05-usage-paket-pembayaran.md) · [07 · Backlog Implementasi V1](../backlog/README.md) · [08 · Bukti Riset & REA](../research/muse-ai-v1/README.md)

Tiket: [NG-026 · Bersihkan domain dan runtime pembelajaran](../backlog/tasks/26-bersihkan-domain-dan-runtime-pembelajaran.md) · [NG-027 · Bersihkan UI dan persona awal](../backlog/tasks/27-bersihkan-ui-dan-persona-awal.md) · [NG-028 · Sederhanakan kuota menjadi fondasi umum](../backlog/tasks/28-sederhanakan-kuota-menjadi-fondasi-umum.md) · [NG-029 · Buat baseline skema dan reset development](../backlog/tasks/29-buat-baseline-skema-dan-reset-development.md) · [NG-030 · Terima baseline V1 yang bersih](../backlog/tasks/30-terima-baseline-v1-yang-bersih.md) · [NG-023 · Recovery end-to-end dan konsistensi state](../backlog/tasks/23-recovery-end-to-end-dan-konsistensi-state.md) · [NG-041 · Benchmark kualitas latency dan biaya asisten umum](../backlog/tasks/41-benchmark-kualitas-latency-dan-biaya-asisten-umum.md) · [NG-025 · Peluncuran asisten umum V1 production](../backlog/tasks/25-peluncuran-free-dan-plus-production.md).

## Matriks penerimaan fitur V1

| ID | Skenario pengguna/failure | Bukti kelulusan yang harus terlihat |
| --- | --- | --- |
| P01 | Pengguna baru melewati login dan meminta bantuan umum. | Tidak diwajibkan membuat artefak pembelajaran; agent menyelesaikan satu pekerjaan nyata dan hasil dapat dibuka kembali. |
| P02 | Task berjalan; user bercakap lagi di thread asal lalu pindah side chat. | Semua percakapan tetap berfungsi; hasil task masuk ke thread asal dengan hubungan task yang jelas, tanpa mencampur token/respons. |
| P03 | Task memerlukan approval, pengguna menundanya lalu refresh/menutup browser. | Proposal masih ditemukan; tidak ada worker/slot eksekusi aktif yang tertahan; user bisa bercakap; approval exact dapat dilanjutkan. |
| P04 | Dua client menyetujui proposal sama atau mengirim decision request ulang. | Satu action sah, satu status final; replay identik konsisten, keputusan/input berbeda ditolak. |
| P05 | Target/proposal berubah sesudah ditinjau. | Approval stale tidak diterapkan; user melihat perubahan dan dapat meninjau proposal baru. |
| P06 | Worker mati sebelum task checkpoint, sesudah hasil tool, atau saat hasil dipublikasikan. | Recovery bertahap, completed effects tidak diduplikasi, progress/result terdahulu tetap bisa dibuka, biaya retry dapat diidentifikasi. |
| P07 | User menekan stop saat model, code atau browser berjalan. | Lease dicabut; operasi baru tidak terjadi; resource berhenti/cleanup terkonfirmasi atau statusnya terlihat; partial result dan biaya yang terpakai dijelaskan. |
| P08 | Browser/server disconnect setelah external effect terjadi sebelum acknowledgement. | Action menjadi unknown/reconciling bila perlu; tidak klik ulang buta; ada outcome atau langkah pemulihan yang dapat dipahami. |
| P09 | Akun B mengetahui ID file/task/goal/schedule/session/memory akun A. | Semua read/write/download/event/approval ditolak; tools dan job tidak melintas owner; tidak membocorkan existence lewat isi hasil. |
| P10 | Kode mencoba mengakses host/API secrets, filesystem task lain atau metadata internal. | Isolasi dan policy mencegah akses; task gagal terkendali; tidak ada akses credential/control-plane. |
| P11 | Code hang, memakai memory/disk berlebihan, mengunduh besar atau browser berulang tanpa hasil. | Batas sumber daya/biaya menghentikan pekerjaan; task status, cleanup dan saldo konsisten. |
| P12 | Task membuat beberapa file lalu sandbox dihentikan. | Manifest hasil telah dipersist sebelum success; download/preview tetap berfungsi setelah sandbox hilang. |
| P13 | File upload gagal, format tak didukung, atau input revision dihapus saat task queued. | State dan pesan error jelas; tidak mengklaim analisis selesai; tidak memakai revision lain diam-diam; reservasi diselesaikan benar. |
| P14 | User menyatakan preferensi, membuka thread baru, lalu mengoreksinya. | Recall relevan lintas thread berubah; evidence dan tipe claim dapat diperiksa; budget konteks tetap terukur. |
| P15 | User melupakan memory lalu curation/retry membaca history lama. | Fakta yang dilupakan tidak hidup kembali dari evidence yang sama; efek forgetting dapat diperiksa setelah refresh. |
| P16 | User menolak persona baru tetapi memory extraction membaca percakapan penolakan tersebut. | Soul tetap; memory tidak menerapkan instruksi persona yang ditolak. |
| P17 | Goal mempunyai beberapa task; satu gagal dan user mengubah target. | Goal tidak otomatis completed; task memakai revision/intent yang jelas; user dapat memilih lanjut/replan/pause. |
| P18 | Schedule berjalan saat user offline; dua dispatcher mengklaim waktu sama. | Satu occurrence, satu task dan satu delivery sah; semua tetap terlihat setelah login. |
| P19 | Schedule diedit/pause tepat saat due; worker restart setelah downtime; timezone berubah. | Berlaku policy revision, overlap/misfire dan future occurrences yang dinyatakan; tidak ada burst tanpa batas atau task jadwal tak berizin. |
| P20 | Reminder pukul lokal tertentu melintasi DST dan timezone berbeda. | Preview, occurrence dan timestamp hasil cocok dengan policy timezone yang dinyatakan. |
| P21 | Dua kandidat proaktif lintas thread bertemu cap harian; user mute atau sedang fokus. | Cap global atomik; timing dicek lagi sebelum delivery; tidak broadcast; candidate expired dibuang. |
| P22 | Tidak ada kandidat yang layak. | Agent boleh tidak mengirim; tidak membuat follow-up generik hanya untuk memenuhi cadence. |
| P23 | Scheduled result selesai saat cap proaktif habis/quiet hours. | Task outcome tetap tercatat; delivery mengikuti pengaturan khusus hasil yang diminta, tidak hilang akibat cap proaktif. |
| P24 | Usage hampir habis, task lain/reschedule berlomba mengambil sisa. | Admission atomik, estimated cap terlihat; admitted work punya aturan settlement; tidak melampaui account/global budget karena race. |
| P25 | User retry gagal tanpa hasil, retry dengan partial hasil, replay SSE, atau approve saat chat quota nol. | Kebijakan charge tiap jenis eksplisit; replay/approval tidak menjadi pesan baru; ledger dan actual cost tidak digandakan. |
| P26 | Harga provider/policy plan berubah ketika task/period lama masih ada. | Snapshot policy/price version tetap dapat diaudit; tidak menghitung ulang biaya lama dengan harga baru tanpa aturan eksplisit. |
| P27 | Web/file berisi instruksi untuk mengganti soul, mencuri file atau mengubah jadwal. | Konten tetap data; tidak melahirkan grant, approval, memory instruction atau side effect terlarang. |
| P28 | Result HTML/kode dibuka di preview mobile dan desktop. | Preview terisolasi, tidak punya session aplikasi; file dapat diunduh; scroll/focus/reduced motion/accessibility sesuai kemampuan tampilan. |
| P29 | Deployment baru saat task, approval dan schedule versi lama masih ada. | Payload/action/workflow lama dapat dilanjutkan atau dimigrasikan secara eksplisit; tidak menjadi stalled state tersembunyi. |
| P30 | Backup dikembalikan dan resource sandbox/provider tidak lagi sama. | State direkonsiliasi, task/occurrence/usage tidak digandakan; hasil durable tetap tersedia; run tak bisa dipulihkan diberi outcome jelas. |

Cara verifikasi: walkthrough browser untuk alur pengguna; fixture/probe backend terarah untuk race, ownership, usage, revision dan replay; fault injection pada sandbox/worker; static/type/build gates. Catat account/environment, input, task/action IDs, timestamps, expected/actual, screenshot/trace dan biaya. Bukti dokumentasi saja tidak menutup acceptance fitur.

## Bukti penerimaan baseline

[NG-030 · Bukti penerimaan baseline V1](baseline-v1-acceptance.md)

## Gate baseline dan pemeriksaan mirror

NG-026–030 telah diterima pada 18 Oktober 2026; NG-031 menjadi Ready tanpa memulai trial. make docs-check memverifikasi hash 65 halaman, 41 identitas tiket, dependency graph/gate NG-030, empat view serta tautan lokal. dev:api memantau apps/backend/src saja dan graceful shutdown dibatasi 5 detik agar perubahan scratch tidak menahan SSE saat reload.

## Penerimaan shell dan onboarding NG-032

[NG-032 · Shell onboarding dan walkthrough asisten umum](../backlog/tasks/32-shell-onboarding-dan-walkthrough-asisten-umum.md) diterima pada 18 Oktober 2026 untuk shell, onboarding chat, Usage, pengaturan dan navigasi kemampuan. Laporan repo `docs/engineering/shell-onboarding-32-acceptance.md` memuat kontrak state fitur berikutnya, walkthrough akun baru dengan model nyata, desktop/mobile, focus, reduced motion, offline/reconnect, pengiriman ulang, stop serta batas bukti. Artifact dan telemetry ada pada `docs/engineering/evidence/shell-32/`. make check dan make build lulus; kuota nol diuji sebagai fixture browser, bukan perubahan saldo; mobile memakai emulasi viewport. Task/file/sandbox/scheduler belum diterima oleh tiket ini.

## Penerimaan Task NG-033

Task teks dan approval umum diterima pada **2026-10-18**. Laporan `docs/engineering/task-33-acceptance.md` dan `docs/engineering/evidence/task-33/` memuat walkthrough model nyata, same-thread chat saat running/waiting_user, reload, revision/review, stop/retry/reject, desktop/mobile dan batas integrasi berikutnya.

`make task-inspect` menjalankan 55 skenario PostgreSQL/checkpoint di database sementara yang dihapus setelah selesai; provider fault/race memakai adapter terkontrol. `make quota-inspect` 46 skenario, `make check`, `make build` dan `git diff --check` lulus. Real Task telemetry: 4.688 token confirmed dan satu stopped call unknown; invoice tidak dihitung. Migrasi incremental `0002_background_tasks` diperlukan; tidak menjalankan reset development.

## Penerimaan file dan hasil NG-034

Diterima lokal pada **2026-10-18**: upload/reuse immutable revisions, PDF/image OCR Mistral, local text/CSV/JSON, multi-file result manifest, review/edit/revision, authenticated preview/download dan delete/retention. Bukti repo `docs/engineering/files-34-acceptance.md` dan `docs/engineering/evidence/files-34/` memisahkan walkthrough provider nyata dari adapter fault terkontrol. `make files-inspect` lulus 47 skenario dengan PostgreSQL/MinIO; `make task-inspect` 55, `make quota-inspect` 46, `make check` dan `make build` lulus.

P12 memakai fixture adapter terbatas di sandbox Daytona nyata (SDK0.225.0/provider v0.225.1, snapshot daytona-medium, TTL3 menit): tiga file dipersist, sandbox dihapus dan cleanup dikonfirmasi, kemudian bytes/hash hasil tetap sama. Ini tidak mengaktifkan eksekusi kode umum NG-035. HTML desktop/mobile disanitasi dan disandbox tanpa session aplikasi; navigasi/jaringan eksternal dilarang. R2 production, full Library search dan kualitas seluruh dokumen tetap memerlukan acceptance tersendiri.

Upgrade memakai `make migrate` untuk 0003_product_files tanpa reset. Konfigurasi backend/worker: MISTRAL_API_KEY, MISTRAL_OCR_MODEL=mistral-ocr-4-1, OCR_ACCOUNT_DAILY_PAGES=100, OCR_GLOBAL_DAILY_PAGES=1000. Restart worker setelah perubahan Python/config; autoreload API tidak mereload worker. Cleanup lima menit merevoke/purge file dihapus dan upload tidak terpakai 24 jam; biaya OCR yang mungkin terpakai tidak dihapus dari ledger. Hasil turunan siap bertahan sampai hasilnya sendiri dihapus.

## Penerimaan runtime kode NG-035

Diterima lokal pada **2026-10-18**. Interface SandboxRuntime dan DaytonaAdapter, ledger/caps, kernel isolation, bounded repair, candidate persistence, review/revisi, stop/cleanup dan download memakai migrasi incremental0004_sandbox_runtime tanpa reset. Desain `docs/engineering/sandbox-runtime.md`; laporan `docs/engineering/sandbox-35-acceptance.md`; evidence `docs/engineering/evidence/sandbox-35/`.

`make sandbox-inspect` lulus45kontrak PostgreSQL/MinIO dengan adapter terkontrol; Task55/File47/quota46 serta make check/build lulus. Probe nyata P10/P11 mengonfirmasi UID/no-new-privs/environment allowlist, network/root-env/sudo/child-network/io_uring denial, hard limits, output cap, timeout dan symlink rejection. CSV model nyata menghasilkan total500, revision2 disetujui dan checksum unduhan cocok setelah sandbox dihapus. Task multi-file nyata menghasilkan JSON+Markdown; stop UI saat kode berjalan berakhir cancelled/deleted tanpa delivery. Same-thread chat tetap berfungsi saat review.

SDK0.225.0/provider v0.225.1, targeteu, 2vCPU/4GiB/8GiB. Mobile adalah emulasi viewport390x844/320x640; desktop1280x900. Usage token aktual dibedakan dari estimasi USD resource; invoice tidak diverifikasi. Akhir pengujian: nol resource NG-035 tersisa. Fault lost ack/crash boundary memakai adapter terkontrol; SIGKILL produk/production dan browser NG-036 bukan bukti penerimaan ini.

Jalankan make install dan make migrate, lalu restart worker; autoreload API tidak mereload worker. SANDBOX_PROVIDER memilih adapter pertama; rate/price version dan cap internal terdapat pada .env.example. Probe berbayar harus eksplisit melalui `scripts/probe_sandbox_runtime.py --live --owner-file /path/to/private-owner.json`. Jangan menyimpan token, credential atau histori pribadi dalam evidence.

## Penerimaan browser pribadi NG-036

Diterima development pada **2026-10-19** WITA. Migrasi incremental 0005_browser_workspace tanpa reset menambah workspace account, sesi/receipts, candidates dan viewer grants. ComputerRuntime dengan DaytonaComputer, Task form/tool chat, VNC gateway, private takeover, exact action approval, queue/unknown recovery dan Settings reset tersedia. Laporan `docs/engineering/computer-36-acceptance.md`; evidence `docs/engineering/evidence/computer-36/`.

Login demo nyata dipakai lintas Task setelah provider stop/start. Desktop1280x900/mobile emulasi390x844, reconnect human tetap privat, review hasil tanpa browser ulang, satu klik Logout setelah approval, preview/download setelah reset dan nol resource tersisa diverifikasi. Worker SIGKILL pada probe120detik menghasilkan provider STOPPED sebelum worker kembali; sweep merekonsiliasi sesi tanpa replay. 47 kontrak terkontrol dan regresi sandbox45/Task55/File47/quota46, make check/build lulus.

Jalankan make install, make migrate lalu restart worker. Autoreload API tidak mereload worker. DAYTONA_API_KEY backend diperlukan; COMPUTER_TASK_SECONDS maksimal1200, COMPUTER_RETENTION_DAYS maksimal7 dan COMPUTER_STORAGE_MICROUSD_PER_HOUR pada .env.example. Konfigurasi cookie viewer memerlukan app/API same-site dan allowed origin. Maintenance computer.sweep tiap menit menghentikan deadline/stale compute serta menghapus profil lewat retensi; provider idle stop dan supervisor desktop tetap membatasi resource saat worker mati.

SDK0.225.0/provider v0.225.1, targeteu, snapshot daytona-medium. Archive nonaktif; browser public-only tidak membuka akses jaringan/profil pada Python offline. Target fingerprint di-hash dalam Chromium, screenshot transient tidak masuk checkpoint. Jangan menaruh credential/profile/signed URL dalam evidence. Production, situs 2FA khusus, semua situs lain, invoice dan pemulihan menyeluruh tetap di luar walkthrough ini.

## Penerimaan scheduler pengguna NG-037
Diterima development pada 2026-10-19 WITA. Jalankan `make migrate` untuk `0006_user_schedules` tanpa reset, lalu restart worker agar registrasi `schedule.dispatch` aktif; API autoreload tidak mereload worker. `make schedule-inspect` lulus 52 kontrak PostgreSQL/checkpoints sementara; regresi Task55/quota46/File47, make check/build dan docs-check lulus. Model nyata `gpt-6-luna`, Procrastinate3.10.0/LangGraph1.2.15/LangChain1.4.6/OpenAI SDK3.31.0.
Jadwal 10.14 WITA dieksekusi saat halaman aplikasi about:blank: satu occurrence/Task/delivery, 2.806 token confirmed, hasil terlihat setelah kembali. Chat membuat/mengubah/jeda jadwal mingguan dengan revision exact; desktop1280x900/mobile emulasi390x844 dan320x640 tanpa overflow. Jadwal audit berulang paused; tidak ada future audit run. Laporan `docs/engineering/schedule-37-acceptance.md` dan evidence `docs/engineering/evidence/schedule-37/`.
DST, misfire, overlap, races, owner, budget dan crash boundary memakai probes terkontrol. P23 memverifikasi independensi delivery terjadwal; proaktivitas/quiet-hours production belum tersedia. Scheduled runtime live memakai teks; tidak mengklaim semua provider/browser/Python schedule diuji ulang. Polling menit bukan SLA presisi detik; invoice, production deployment dan notifikasi eksternal tidak dicakup.

## Penerimaan persona NG-016
NG-016 diterima development 19 Oktober 2026. Jalankan make migrate untuk incremental 0007_persona_revisions lalu restart worker. Avatar panel, Identity/Soul, editor dan preview chat, exact decisions, history/restore serta snapshot per chat/Task tersedia. make persona-inspect lulus 36 skenario; Task 55 dan scheduler 82 lulus regresi. Model nyata lintas thread, rejection/approval, konflik dua tab, reload draft, restore dan mobile 390/320px diperiksa. File TXT dengan instruksi palsu tidak mengubah persona/jadwal. make check/build dan git diff --check lulus. Bukti repo: docs/engineering/[persona-16-acceptance.md](http://persona-16-acceptance.md) serta docs/engineering/evidence/persona-16/. Avatar memakai gambar yang ada atau inisial; capture/recall dan full P16 memory extraction mengikuti NG-017/018. Tidak mengklaim mobile fisik atau production deployment.

## Penerimaan Goals NG-038

NG-038 diterima development 19 Oktober 2026. Migration incremental `0009_personal_goals` diterapkan tanpa reset. `make goal-inspect` lulus 74 kontrak; regresi Task 55, scheduler 82, file 47 dan quota 46 lulus. `make check`, `make build` dan `git diff --check` lulus. Walkthrough model nyata mencakup pembuatan Goal tanpa eksekusi otomatis, Task/bukti, preview chat dan retry ID salah, pause/resume, slot offline yang skipped, manual run tersendiri yang berhasil, complete/archive dan reload. Desktop/mobile 390/320 tanpa overflow. Bukti serta batas: `docs/engineering/goals-38-acceptance.md`, `docs/engineering/goals-runtime.md`, `docs/engineering/evidence/goals-38/`. Parent cap dan source/revision checks tersedia; proaktivitas NG-019/020 dan production deployment belum dicakup. Fixture Goal diarsipkan dan tidak ada future slot jadwal uji.
<!-- notion-content:end -->
