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
