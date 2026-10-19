# Ngertiin

Sumber: [Notion](https://app.notion.com/p/3f8abdd6187381e39753f0d54ee2556b) · Readback: 2026-10-18T06:04:56.780944+00:00

<!-- notion-content:start -->
Ngertiin V1 adalah asisten personal umum untuk chat, task background, file/hasil persisten, kode/browser di Daytona, VNC/live desktop/takeover pada sesi yang sama, jadwal offline, persona, memory, goals dan proaktivitas terkontrol.
Target V1 dibedakan dari current implementation. NG-026–030 menerima baseline sebelum trial Daytona; fitur baru tetap gap bertiket. Course/Lesson/Practice hanya arah berikutnya dan bukan dependency aktif.

## Mulai membaca

1. [01 · Produk & Scope V1](product/01-produk-dan-paket.md)
2. [02 · UX & User Flow](product/02-user-flow.md)
3. [03 · Perilaku Agent](product/03-agent.md)
4. [04 · Arsitektur, Runtime & Kontrak](product/04-arsitektur-dan-delivery.md)
5. [05 · Usage, Paket & Pembayaran](product/05-usage-paket-pembayaran.md)
6. [06 · Development, Operasi & Acceptance](engineering/development.md)
7. [07 · Backlog Implementasi V1](backlog/README.md)
8. [08 · Bukti Riset & REA](research/muse-ai-v1/README.md)
Rantai: spesifikasi → bukti REA/riset → tiket → bukti penerimaan. Tiket Done lama tetap riwayat. Notion menjadi sumber keputusan/status; mirror repo dan manifest mengikuti readback.

## Halaman sumber

[01 · Produk & Scope V1](product/01-produk-dan-paket.md)

[02 · UX & User Flow](product/02-user-flow.md)

[03 · Perilaku Agent](product/03-agent.md)

[04 · Arsitektur, Runtime & Kontrak](product/04-arsitektur-dan-delivery.md)

[05 · Usage, Paket & Pembayaran](product/05-usage-paket-pembayaran.md)

[06 · Development, Operasi & Acceptance](engineering/development.md)

[07 · Backlog Implementasi V1](backlog/README.md)

[08 · Bukti Riset & REA](research/muse-ai-v1/README.md)

## Database tugas

[07 · Backlog Implementasi V1](backlog/README.md)
<!-- notion-content:end -->

## Status kerja terbaru

Readback status 2026-10-19T08:21:59Z: [NG-019 · Kandidat proaktif dinamis dan reranking](backlog/tasks/19-kandidat-proaktif-dinamis-dan-reranking.md) berstatus **Done**. LLM membentuk kandidat, Jev menilai dan code memilih; 68 kontrak, provider/worker nyata serta desktop/mobile diterima. Rincian dan batas bukti pada [penerimaan NG-019](engineering/proactivity-19-acceptance.md); delivery otomatis tetap NG-020.

Readback status 2026-10-19T07:47:26.467Z: [NG-019 · Kandidat proaktif dinamis dan reranking](backlog/tasks/19-kandidat-proaktif-dinamis-dan-reranking.md) berstatus **In Progress**. Implementasi mengikuti scope yang disetujui: LLM membentuk kandidat, Jev menilai, code memilih; delivery otomatis mengikuti NG-020.

Readback status 2026-10-19T06:29:38.106391+00:00: [NG-038 · Goals umum dengan evidence progress](backlog/tasks/38-goals-umum-dengan-evidence-progress.md) berstatus **Done**. [Penerimaan Goal](engineering/goals-38-acceptance.md) mencatat 74 kontrak, integrasi Task/Jadwal, bukti per kriteria, model nyata serta desktop/mobile. NG-019 adalah urutan berikutnya; status tiket lain dipertahankan.

Readback status 2026-10-19T05:53:03.400Z: [NG-038 · Goals umum dengan evidence progress](backlog/tasks/38-goals-umum-dengan-evidence-progress.md) berstatus **In Progress**. Implementasi dimulai sesuai scope yang disetujui; acceptance belum dinyatakan selesai.

Readback status 2026-10-19T05:41:03.122Z: [NG-017](backlog/tasks/17-memory-aktif-capture-evidence-dan-recall.md) dan [NG-018](backlog/tasks/18-pengaturan-untuk-inspeksi-dan-koreksi-memory.md) berstatus **Done**. [Penerimaan memory](engineering/memory-17-acceptance.md) dan [cara kerja memory](engineering/memory-runtime.md) mencatat Mem0 OSS, evidence, recall dan kontrol pengguna. NG-038 adalah urutan berikutnya; status tiket lain dipertahankan.

Readback status 2026-10-19T03:42:13.950127+00:00: [NG-016 · Perubahan soul atas permintaan dan HITL](backlog/tasks/16-perubahan-soul-atas-permintaan-dan-hitl.md) berstatus **Done**. [Penerimaan persona](engineering/persona-16-acceptance.md) mencatat editor, review, history/restore, snapshot dan desktop/mobile. NG-017 adalah urutan berikutnya.

Readback status 2026-10-19T03:21:43.382056+00:00: [NG-016 · Perubahan soul atas permintaan dan HITL](backlog/tasks/16-perubahan-soul-atas-permintaan-dan-hitl.md) berstatus **In Progress**. Panel asisten, Identity/Soul, editor dan review persona mulai diimplementasikan sesuai final plan yang disetujui.

Readback status 2026-10-19T02:21:49.327704+00:00: [NG-037 · Scheduler pengguna saat offline](backlog/tasks/37-scheduler-pengguna-saat-offline.md) berstatus **Done**. [Laporan penerimaan](engineering/schedule-37-acceptance.md) memuat eksekusi saat halaman tertutup, chat create/edit/pause, 82 kontrak scheduler, interval setiap N jam, timezone/DST, budget dan desktop/mobile. NG-016 menjadi urutan implementasi berikutnya; status tiket lain dipertahankan.

Readback status 2026-10-19T01:56:38.366Z: [NG-037 · Scheduler pengguna saat offline](backlog/tasks/37-scheduler-pengguna-saat-offline.md) berstatus **In Progress**. Implementasi scheduler offline dimulai sesuai scope yang disetujui; acceptance belum dinyatakan selesai.

Readback status 2026-10-18T17:56:53.897Z: [NG-036 · Browser VNC live desktop dan takeover](backlog/tasks/36-browser-vnc-live-desktop-dan-takeover.md) berstatus **Done**. [Laporan penerimaan](engineering/computer-36-acceptance.md) memuat login nyata lintas Task sesudah provider stop/start, VNC privat desktop/mobile, exact action approval, 47 kontrak, SIGKILL/idle stop, reset profil dan hasil persisten. NG-037 menjadi urutan berikutnya; status tiket lain dipertahankan.

Readback status 2026-10-18T15:44:00.527Z: [NG-035 · Eksekusi kode dalam sandbox](backlog/tasks/35-eksekusi-kode-dalam-sandbox.md) berstatus **Done**. [Laporan penerimaan](engineering/sandbox-35-acceptance.md) memuat interface Python yang dapat diganti, adapter Daytona, isolasi kernel, 45 kontrak runtime, CSV/model nyata, review/revisi/download desktop/mobile serta stop/cleanup. NG-036 menjadi urutan implementasi berikutnya; status tiket lain dipertahankan.

Readback status 2026-10-18T14:17:35.163Z: [NG-034 · File produk dan hasil tersimpan](backlog/tasks/34-file-produk-dan-hasil-tersimpan.md) berstatus **Done**. [Laporan penerimaan](engineering/files-34-acceptance.md) memuat Mistral OCR, immutable revisions, result manifest, preview/download/delete, 47 kontrak file dan walkthrough desktop/mobile. Eksekusi kode umum dan full Library search mengikuti NG-035/NG-039.

Readback status 2026-10-18T10:08:03.263Z: [NG-033 · Task background dan approval umum](backlog/tasks/33-task-background-dan-approval-umum.md) berstatus **Done**. [Laporan penerimaan](engineering/task-33-acceptance.md) memuat Task teks, chat bersamaan, exact approval/revision, stop/retry, 55 kontrak backend dan walkthrough model nyata. NG-034 belum dimulai.

Readback status 2026-10-18T08:14:37.582446+00:00: [NG-032 · Shell onboarding dan walkthrough asisten umum](backlog/tasks/32-shell-onboarding-dan-walkthrough-asisten-umum.md) berstatus **Done**. [Laporan penerimaan](engineering/shell-onboarding-32-acceptance.md) memuat bantuan pertama dengan model nyata, navigasi/usage/pengaturan, walkthrough desktop/mobile dan batas fitur berikutnya. NG-033 belum dimulai.

Readback status 2026-10-18T07:40:29.161083+00:00: [NG-032 · Shell onboarding dan walkthrough asisten umum](backlog/tasks/32-shell-onboarding-dan-walkthrough-asisten-umum.md) berstatus **In Progress** untuk brainstorming dan persiapan implementasi berikutnya, sesuai Urutan 7. NG-031 telah Done; acceptance NG-032 belum dijalankan.

Readback status 2026-10-18T07:13:08.912354+00:00: [NG-031 · Validasi Daytona dengan trial terbatas](backlog/tasks/31-validasi-daytona-dengan-trial-terbatas.md) berstatus **Done**. Empat acceptance criteria memiliki bukti live; [laporan penerimaan](engineering/daytona-31-acceptance.md) mencatat hasil dan batasnya. Dua sandbox trial sudah dihapus; readback provider mengonfirmasi tidak ada resource tersisa.
