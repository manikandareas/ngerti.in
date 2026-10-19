# 07 · Backlog Implementasi V1

Sumber: [Notion](https://app.notion.com/p/3fdabdd61873812e9ed6c67417884b74) · Readback: 2026-10-18T06:04:56.780944+00:00

<!-- notion-content:start -->
Nomor tiket adalah identitas tetap; Urutan adalah urutan delivery yang boleh berubah. Nomor baru dimulai NG-026 setelah tiket lama terakhir NG-025. Kolom Ticket menyimpan nomor dan Lingkup membedakan Aktif V1, Histori, Di luar V1. Status Done lama tidak direset dan tidak otomatis memenuhi V1 baru.

## Gerbang implementasi pertama

NG-026 hapus domain/runtime belajar → NG-027 UI/persona umum → NG-028 chat-only quota → NG-029 baseline/reset → NG-030 penerimaan baseline. **Seluruh fitur baru bergantung pada NG-030.** Trial Daytona belum dijalankan oleh reset ini.

## Urutan setelah gerbang

NG-031 Daytona trial → NG-032 shell/onboarding → NG-033 Task/approval → NG-034 file/results → NG-035 code sandbox → NG-036 browser/VNC/live desktop/takeover → NG-037 offline scheduler → NG-016/017/018 persona/memory/controls → NG-038 goals → NG-019/020 proaktivitas → NG-039 Library/search → NG-040 compute usage → NG-021/022 payment/entitlement → NG-023 recovery → NG-041 benchmark → NG-025 release.
Hard cost/resource caps dan telemetry hadir sejak Task/sandbox/scheduler awal; pekerjaan usage akhir menetapkan allowance dan harga komersial. Daytona, VNC, live view dan takeover tetap wajib V1. Workspace/hasil persisten; RAM/proses tidak dijanjikan sebelum PoC.

## Perlakuan tiket lama

NG-001–005 mempertahankan Done sebagai Histori, termasuk fondasi yang masih direuse (#02/#04/#05). NG-006–015 dan NG-024 berstatus historis sebelumnya namun diberi Lingkup Di luar V1, dikeluarkan dari board aktif dan tidak menjadi dependency fitur V1. Tidak dipindah menjadi proyek implementasi V2.
NG-016–023 dan NG-025 mempertahankan identitas tetapi scope dan dependency diperbarui menjadi asisten umum. Kriteria lama disimpan sebagai riwayat di tiket; kriteria aktif ditulis di atasnya. View Semua memuat seluruh identitas; Kanban/Siap dikerjakan hanya Aktif V1; board riwayat memuat Histori/Di luar V1.
Ready hanya bila seluruh dependencies sudah Done. Done memerlukan bukti acceptance yang cocok dengan scope aktif. Review/In Progress tetap dipakai bila masih ada verifikasi, tanpa menyamakan dokumentasi dengan kelulusan fitur.
Database: [07 · Backlog Implementasi V1](README.md). Spesifikasi: [01 · Produk & Scope V1](../product/01-produk-dan-paket.md) · [02 · UX & User Flow](../product/02-user-flow.md) · [03 · Perilaku Agent](../product/03-agent.md) · [04 · Arsitektur, Runtime & Kontrak](../product/04-arsitektur-dan-delivery.md) · [05 · Usage, Paket & Pembayaran](../product/05-usage-paket-pembayaran.md) · [06 · Development, Operasi & Acceptance](../engineering/development.md)
Indeks bukti: [08 · Bukti Riset & REA](../research/muse-ai-v1/README.md).
<!-- notion-content:end -->

## Status kerja terbaru

Readback status 2026-10-19T03:42:13.950127+00:00: [NG-016 · Perubahan soul atas permintaan dan HITL](tasks/16-perubahan-soul-atas-permintaan-dan-hitl.md) berstatus **Done**. [Penerimaan persona](../engineering/persona-16-acceptance.md) mencatat editor, review, history/restore, snapshot dan desktop/mobile. NG-017 adalah urutan berikutnya.

Readback status 2026-10-19T03:21:43.382056+00:00: [NG-016 · Perubahan soul atas permintaan dan HITL](tasks/16-perubahan-soul-atas-permintaan-dan-hitl.md) berstatus **In Progress**. Panel asisten, Identity/Soul, editor dan review persona mulai diimplementasikan sesuai final plan yang disetujui.

Readback status 2026-10-19T02:21:49.327704+00:00: [NG-037 · Scheduler pengguna saat offline](tasks/37-scheduler-pengguna-saat-offline.md) berstatus **Done**. [Laporan penerimaan](../engineering/schedule-37-acceptance.md) memuat eksekusi saat halaman tertutup, chat create/edit/pause, 82 kontrak scheduler, interval setiap N jam, timezone/DST, budget dan desktop/mobile. NG-016 menjadi urutan implementasi berikutnya; status tiket lain dipertahankan.

Readback status 2026-10-19T01:56:38.366Z: [NG-037 · Scheduler pengguna saat offline](tasks/37-scheduler-pengguna-saat-offline.md) berstatus **In Progress**. Implementasi scheduler offline dimulai sesuai scope yang disetujui; acceptance belum dinyatakan selesai.

Readback status 2026-10-18T17:56:53.897Z: [NG-036 · Browser VNC live desktop dan takeover](tasks/36-browser-vnc-live-desktop-dan-takeover.md) berstatus **Done**. [Laporan penerimaan](../engineering/computer-36-acceptance.md) memuat login nyata lintas Task sesudah provider stop/start, VNC privat desktop/mobile, exact action approval, 47 kontrak, SIGKILL/idle stop, reset profil dan hasil persisten. NG-037 menjadi urutan berikutnya; status tiket lain dipertahankan.

Readback status 2026-10-18T15:44:00.527Z: [NG-035 · Eksekusi kode dalam sandbox](tasks/35-eksekusi-kode-dalam-sandbox.md) berstatus **Done**. [Laporan penerimaan](../engineering/sandbox-35-acceptance.md) memuat interface Python yang dapat diganti, adapter Daytona, isolasi kernel, 45 kontrak runtime, CSV/model nyata, review/revisi/download desktop/mobile serta stop/cleanup. NG-036 menjadi urutan implementasi berikutnya; status tiket lain dipertahankan.

Readback status 2026-10-18T14:17:35.163Z: [NG-034 · File produk dan hasil tersimpan](tasks/34-file-produk-dan-hasil-tersimpan.md) berstatus **Done**. [Laporan penerimaan](../engineering/files-34-acceptance.md) memuat Mistral OCR, immutable revisions, result manifest, preview/download/delete, 47 kontrak file dan walkthrough desktop/mobile. Eksekusi kode umum dan full Library search mengikuti NG-035/NG-039.

Readback status 2026-10-18T10:08:03.263Z: [NG-033 · Task background dan approval umum](tasks/33-task-background-dan-approval-umum.md) berstatus **Done**. [Laporan penerimaan](../engineering/task-33-acceptance.md) memuat Task teks, chat bersamaan, exact approval/revision, stop/retry, 55 kontrak backend dan walkthrough model nyata. NG-034 belum dimulai.

Readback status 2026-10-18T08:14:37.582446+00:00: [NG-032 · Shell onboarding dan walkthrough asisten umum](tasks/32-shell-onboarding-dan-walkthrough-asisten-umum.md) berstatus **Done**. [Laporan penerimaan](../engineering/shell-onboarding-32-acceptance.md) memuat bantuan pertama dengan model nyata, navigasi/usage/pengaturan, walkthrough desktop/mobile dan batas fitur berikutnya. NG-033 belum dimulai.

Readback status 2026-10-18T07:40:29.161083+00:00: [NG-032 · Shell onboarding dan walkthrough asisten umum](tasks/32-shell-onboarding-dan-walkthrough-asisten-umum.md) berstatus **In Progress** untuk brainstorming dan persiapan implementasi berikutnya, sesuai Urutan 7. NG-031 telah Done; acceptance NG-032 belum dijalankan.

Readback status 2026-10-18T07:13:08.912354+00:00: [NG-031 · Validasi Daytona dengan trial terbatas](tasks/31-validasi-daytona-dengan-trial-terbatas.md) berstatus **Done**. Empat acceptance criteria memiliki bukti live; [laporan penerimaan](../engineering/daytona-31-acceptance.md) mencatat hasil dan batasnya. Dua sandbox trial sudah dihapus; readback provider mengonfirmasi tidak ada resource tersisa.
