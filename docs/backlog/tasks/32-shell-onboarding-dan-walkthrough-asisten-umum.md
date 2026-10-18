# NG-032 · Shell onboarding dan walkthrough asisten umum

Sumber: [Notion](https://app.notion.com/p/3fdabdd61873810b8159f4798fc39046) · Readback: 2026-10-18T08:14:37.582446+00:00

| Property | Value |
| --- | --- |
| Ticket | 32 |
| Urutan | 7 |
| Lingkup | Aktif V1 |
| Status | Done |
| Prioritas | P0 |
| Area | Fondasi |
| Depends on | [NG-031 · Validasi Daytona dengan trial terbatas](31-validasi-daytona-dengan-trial-terbatas.md) |

<!-- notion-content:start -->
Tujuan: Shell onboarding dan walkthrough asisten umum.
Lingkup: **Aktif V1**. Identitas NG-032; Urutan delivery 7.

## Acceptance criteria

- [x] Alur pengguna baru dimulai dari chat dan keberhasilan umum yang kecil; tidak ada gerbang pembelajaran.
- [x] Rancang navigasi chat, task, hasil, jadwal, goals, memory, usage dan panel komputer dengan empty/loading/error/recovery.
- [x] Walkthrough desktop/mobile mencakup keyboard, focus, reduced motion, reconnect serta capability yang belum tersedia ditandai jujur.

## Spesifikasi dan bukti

[02 · UX & User Flow](../../product/02-user-flow.md) · [REA-1 · Chat & Session](../../research/muse-ai-v1/evidence/chat.md)

## Dependencies

[NG-031 · Validasi Daytona dengan trial terbatas](31-validasi-daytona-dengan-trial-terbatas.md)

## Bukti penerimaan

**Selesai dan diterima pada 18 Oktober 2026 untuk scope NG-032.** Shell desktop/mobile, onboarding langsung lewat chat, Usage nyata, pengaturan akun/tema dan status kemampuan mendatang telah diimplementasikan. Laporan repo: `docs/engineering/shell-onboarding-32-acceptance.md`; screenshot, observasi browser dan telemetry: `docs/engineering/evidence/shell-32/`.
## Hasil penerimaan
- Login akun sintetis baru; pilihan contoh mengisi draft tanpa mengirim atau menimpa tulisan. Satu jawaban model nyata tersimpan dan terbuka kembali sesudah reload. Membuka Pengaturan ketika run masih running tidak membatalkan atau menggandakan jawaban.
- Navigasi Percakapan, Kemampuan Gwen, Penggunaan dan Pengaturan mempertahankan thread/draft. Enam kemampuan mendatang bertanda Belum tersedia; state dan pemulihan domainnya dipetakan di laporan, mengikuti tiket integrasi masing-masing.
- Walkthrough Chromium 148 pada desktop 1280 px, mobile 390/320 px dan viewport pendek 390×400 lulus; Enter mobile membuat newline, Escape mengembalikan fokus, navigasi mobile memfokuskan heading, reduced motion berlaku dan tidak ada horizontal overflow.
- Kegagalan submit mempertahankan draft/request identity; pengiriman ulang menghasilkan satu pesan. Stop nyata menghasilkan cancelled. Kegagalan SSE pertama menampilkan reconnect; pulih tanpa menambah pesan dan draft tetap ada. Riwayat/Usage gagal mempunyai retry; kuota nol memakai fixture respons browser yang dihapus setelah uji.
- Model gpt-6-luna: jawaban pertama 214 input + 44 output = 258 token. Snapshot akhir main thread memiliki dua user messages, satu jawaban complete dan satu assistant cancelled tanpa teks; used 1, reserved 0, remaining 99. Usage cancelled kosong bukan bukti biaya provider nol; invoice tidak dihitung.
- make check, make build dan git diff --check lulus. Tidak menambah dependency, migrasi atau kontrak backend. Bukti mobile adalah emulasi viewport browser, bukan perangkat fisik. Run-level retry sesudah model failure, crash worker dan cross-owner backend tidak diulang pada tiket UI ini; baseline sebelumnya tetap menjadi rujukan.
## Batas integrasi berikutnya
Task/approval umum tetap pada [NG-033 · Task background dan approval umum](33-task-background-dan-approval-umum.md), file/hasil pada [NG-034 · File produk dan hasil tersimpan](34-file-produk-dan-hasil-tersimpan.md), dan code/browser/desktop pada NG-035/036. Rancangan entry/status di NG-032 tidak menyatakan runtime tersebut sudah tersedia.
<!-- notion-content:end -->

## Status kerja terbaru

Readback status 2026-10-18T08:14:37.582446+00:00: **Done** untuk scope NG-032. [Laporan penerimaan](../../engineering/shell-onboarding-32-acceptance.md) mencatat walkthrough, telemetry, kontrak state fitur berikutnya dan batas bukti. NG-033 belum dimulai.
