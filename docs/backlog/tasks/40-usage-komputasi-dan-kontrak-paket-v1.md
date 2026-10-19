# NG-040 · Usage komputasi dan kontrak paket V1

Sumber: [Notion](https://app.notion.com/p/3fdabdd6187381639bd6f377668ee2f3) · Readback: 2026-10-19T11:35:00Z

| Property | Value |
| --- | --- |
| Ticket | 40 |
| Urutan | 20 |
| Lingkup | Aktif V1 |
| Status | Done |
| Prioritas | P0 |
| Area | Billing |
| Depends on | [NG-039 · Library pencarian dan penemuan kemampuan](39-library-pencarian-dan-penemuan-kemampuan.md) |

<!-- notion-content:start -->
Tujuan: Usage komputasi dan kontrak paket V1.

Lingkup: **Aktif V1**. Identitas NG-040; Urutan delivery 20.

## Acceptance criteria

- [x] Telemetry model/tool/sandbox/storage/retry memakai dedup identity dan snapshot price/policy version; bedakan estimated/confirmed/unknown.
- [x] Hard parent/task/account caps sudah terpasang sejak NG-033/035/036/037; tambah public allowance/estimate dan reserve-cap/settle-actual setelah benchmark awal.
- [x] Approval/replay/stop/memory controls tidak menjadi pesan berbayar baru; quota UI menjelaskan charge, budget blocking, refund dan reset.
- [x] Harga dan allowance komersial diputuskan dari biaya nyata, bukan mewarisi harga paket belajar; P24/P25/P26.

## Spesifikasi dan bukti

[05 · Usage, Paket & Pembayaran](../../product/05-usage-paket-pembayaran.md) · [REA-5 · Permissions](../../research/muse-ai-v1/evidence/permissions.md)

## Dependencies

[NG-039 · Library pencarian dan penemuan kemampuan](39-library-pencarian-dan-penemuan-kemampuan.md)

## Bukti penerimaan

**Diterima development pada 19 Oktober 2026.** Migration incremental `0013_compute_usage` menambah allowance/ledger lintas chat, Task, OCR, Python/browser, memory, proaktivitas dan storage I/O. Snapshot harga/policy, dedup attempt, reserve-cap/settle-actual, unknown outcome, refund yang tidak menghapus biaya provider serta retry tanpa membatalkan refund lama diterapkan. UI Usage/estimasi Task dan Jadwal owner-scoped.

Kontrak V1: Free 100 pesan/1.000 kredit dan Plus 300 pesan/5.000 kredit per 30 × 24 jam; harga Plus Rp149.000. Kredit adalah allowance biaya konfigurasi, bukan saldo tunai/invoice. Cap provider periode 120% membatasi subsidi failure/refund; cap harian account/global tetap berlaku. Checkout/aktivasi entitlement mengikuti NG-021/022, belum diaktifkan.

`make usage-inspect` lulus 48 kontrak termasuk P24/P25/P26 dan crash/recovery; probe live lulus 46 pemeriksaan yang mencakup 43 kontrak saat dijalankan dan tiga penerimaan provider tambahan. Regresi Task55/quota46/File47/sandbox45/browser47/scheduler82/memory62/proactivity105; check/build dan dokumentasi diverifikasi. Fixture browser/proaktivitas memakai allowance diperbesar; enforcement default diuji terpisah pada NG-040.

Walkthrough nyata: chat 51 memakai 0,399 kredit; Task teks review 0,076; Python jumlah 1–100 menghasilkan [hasil.md](http://hasil.md) berisi 5050, hold 138 menjadi 1,338 kredit. Approval tidak menambah pesan. Saldo nol memakai cadangan audit sementara: Task ditolak 429 tanpa charge chat, unduhan HTTP200/135 byte cocok SHA; cadangan audit sudah dilepas. Desktop1440 dan mobile390/320 tanpa overflow; stale Usage mempertahankan data dan retry.

Memory nyata: embedding8 token dan GPT-5 Mini22 token; OCR satu PNG/satu halaman. Harga uang tetap estimated, bukan invoice. Benchmark awal read-only memisahkan repricing historis dari ledger pelanggan; biaya browser/retensi dominan. Penerimaan dan sumber tarif repo: `docs/engineering/usage-40-acceptance.md`, `docs/engineering/usage-runtime.md`, `docs/engineering/evidence/usage-40/`. Kontrak paket dan bukti biaya diperbarui pada spesifikasi Usage.

Batas: development/input sintetis; tidak mengklaim produksi, invoice, margin populasi atau full benchmark NG-041. S3 adalah estimasi ekuivalen R2 untuk local MinIO; retensi kapasitas sesudah 30 hari/signed-download bytes memerlukan reconciliation provider. Pekerjaan lama tidak ditagih ulang. NG-021 adalah urutan berikutnya; status tiket lain dipertahankan.

Hard per-task/resource/account cap serta cost telemetry wajib ada sejak capability pertama digunakan; paket komersial menyusul benchmark.
<!-- notion-content:end -->
