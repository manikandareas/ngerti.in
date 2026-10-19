# 01 · Produk & Scope V1

Sumber: [Notion](https://app.notion.com/p/3f8abdd618738122878dde3cb0661765) · Readback: 2026-10-19T11:35:00Z

<!-- notion-content:start -->
Keputusan aktif per 18 Oktober 2026: **Ngertiin V1 adalah asisten personal umum** untuk orang yang ingin meminta bantuan berpikir, menulis, mengolah file, menjalankan kode/browser dan pekerjaan terjadwal melalui web. Satu agent personal mengikuti pengguna lintas percakapan, pekerjaan dan tujuan.

V1 wajib mencakup chat utama/side chat, task background, approval umum, file/hasil persisten, Daytona sandbox, browser, **VNC/live desktop dan takeover pada sesi yang sama**, scheduler saat offline, persona, memory, goals, proaktivitas terkontrol, Library/pencarian, usage, pembayaran dan operasi production.

Course, Lesson dan Practice adalah arah pengembangan berikutnya. Kode, fixture, meter dan tiket implementasi pembelajaran tidak menjadi dependency aktif V1. Pemulihan kode lama melalui Git; tidak disimpan di folder V2 atau feature flag.

## Status delivery dan batas klaim

Target di atas adalah syarat kelulusan V1, bukan klaim bahwa fitur sudah tersedia. Baseline mempertahankan Clerk/account ownership, chat utama/side, SSE replay, stop/retry, LangGraph, Procrastinate, S3/MinIO serta ledger chat. Approval hanya primitive umum; belum ada tool yang memerlukan persetujuan pada baseline. File masih berada pada diagnostics development, bukan attachment produk. Belum ada Task umum, Daytona runtime, schedules pengguna, memory aktif, goals atau pembayaran production.

NG-026–030 membersihkan dan menerima fondasi sebelum fitur baru. Trial Daytona dimulai sesudah NG-030 lulus. Tiket Done lama adalah bukti historis dan tidak menggantikan acceptance V1 baru.

## Alur manfaat utama

1. Pengguna masuk, membuka main atau side chat dan menyampaikan maksud tanpa formulir profil panjang.
2. Permintaan sederhana dijawab di chat; pekerjaan lama menjadi Task terpisah agar percakapan tetap tersedia.
3. Pengguna meninjau izin yang perlu, melihat progress/komputer yang sama, mengambil alih, atau menghentikan pekerjaan.
4. Hasil dipersist dan dapat dibuka dari chat/Library setelah reload atau sandbox hilang.
5. Pengguna menyimpan Goal atau Schedule secara eksplisit, menerima hasil saat kembali online, mengoreksi persona/memory dan mengatur proaktivitas.

## Kontrak kelulusan

Semua modul mengikuti tujuan, alur, state, input/output, failure, izin, biaya dan acceptance pada spesifikasi terkait. Rantai rujukan: **spesifikasi → bukti REA/riset → tiket → bukti penerimaan**. Observasi Muse, dokumentasi vendor, shipped frontend, implementasi Ngertiin dan acceptance Ngertiin adalah tingkat bukti yang berbeda.

Workspace serta hasil dibuat persisten. Keberlangsungan proses, RAM dan autentikasi website sesudah stop/resume hanya dijanjikan setelah PoC vendor membuktikannya. Kontrak NG-040 menetapkan Free 100 pesan/1.000 kredit dan Plus 300 pesan/5.000 kredit per 30 × 24 jam; harga Plus Rp149.000 mengikuti telemetry awal. Periode lama mempertahankan snapshot. Checkout/entitlement mengikuti NG-021/022; benchmark menyeluruh NG-041 tetap menjadi gate sebelum release. Rincian pada [05 · Usage, Paket & Pembayaran](05-usage-paket-pembayaran.md).

Release memerlukan walkthrough desktop/mobile, static/build, ledger/concurrency/ownership probes, fault injection, takeover, offline scheduler, privacy controls serta backup/restore. Near-parity pengalaman dinilai dari skenario berbukti; source backend, keamanan internal atau model Muse tidak diklaim sama.

Spesifikasi: [02 · UX & User Flow](02-user-flow.md) · [03 · Perilaku Agent](03-agent.md) · [04 · Arsitektur, Runtime & Kontrak](04-arsitektur-dan-delivery.md) · [05 · Usage, Paket & Pembayaran](05-usage-paket-pembayaran.md) · [06 · Development, Operasi & Acceptance](../engineering/development.md)

Bukti: [REA-1 · Chat & Session](../research/muse-ai-v1/evidence/chat.md) · [REA-2 · Task & Scheduler](../research/muse-ai-v1/evidence/task.md) · [REA-3 · File & Artifact](../research/muse-ai-v1/evidence/file.md) · [REA-4 · Memory & Goals](../research/muse-ai-v1/evidence/memory.md) · [REA-5 · Permissions](../research/muse-ai-v1/evidence/permissions.md) · [REA-6 · Browser & Computer](../research/muse-ai-v1/evidence/computer.md)

Tiket gerbang: [NG-026 · Bersihkan domain dan runtime pembelajaran](../backlog/tasks/26-bersihkan-domain-dan-runtime-pembelajaran.md) · [NG-027 · Bersihkan UI dan persona awal](../backlog/tasks/27-bersihkan-ui-dan-persona-awal.md) · [NG-028 · Sederhanakan kuota menjadi fondasi umum](../backlog/tasks/28-sederhanakan-kuota-menjadi-fondasi-umum.md) · [NG-029 · Buat baseline skema dan reset development](../backlog/tasks/29-buat-baseline-skema-dan-reset-development.md) · [NG-030 · Terima baseline V1 yang bersih](../backlog/tasks/30-terima-baseline-v1-yang-bersih.md). Release: [NG-025 · Peluncuran asisten umum V1 production](../backlog/tasks/25-peluncuran-free-dan-plus-production.md).

## Keputusan interaksi V1 — NG-039

Disetujui pengguna pada 19 Oktober 2026: chat menjadi pintu utama untuk meminta, menemukan dan melanjutkan pekerjaan. Artifact hadir sebagai laporan/dokumen/tabel/hasil persisten dengan revision dan preview; Library membantu penemuan ulang. **Konektor native, katalog konektor, OAuth dan sinkronisasi layanan eksternal tidak masuk V1.** Upload dan browser pribadi tetap mengikuti izin serta scope yang tersedia. Editor kompleks, publikasi/sharing publik dan generator media tidak ditambahkan melalui NG-039.
<!-- notion-content:end -->
