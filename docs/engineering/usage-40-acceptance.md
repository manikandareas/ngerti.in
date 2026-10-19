# NG-040 · Penerimaan usage dan kontrak paket

Diterima development pada 19 Oktober 2026. Scope: allowance komputasi, ledger/telemetry lintas kemampuan, reserve-cap/settle-actual, charge/refund, estimasi dan Usage. Kontrak dan sumber tarif: [usage-runtime.md](usage-runtime.md). Checkout dan lifecycle pembayaran tetap NG-021/022; benchmark keseluruhan sebelum release tetap NG-041.

## Perilaku yang diterima

- Saldo pesan dan komputasi terpisah. Free 100 pesan/1.000 kredit; Plus 300 pesan/5.000 kredit per 30 × 24 jam. Harga kontrak Plus Rp149.000; belum mengaktifkan checkout atau memberi Plus kepada akun development.
- Admission menyimpan cap/period/policy/price sebelum dispatch. Task menggabungkan token, OCR yang diperlukan, sesi runtime dan retensi profil. Budget native tetap berlaku. Child attempts tidak memperoleh saldo baru di luar parent. Source/background job ikut account/global allowance; concurrency diserialisasi pada lock account dan global.
- Event per attempt mengikat identity native. Replay/settlement tidak menggandakan cost. Quantity terkonfirmasi dibedakan dari estimasi uang/invoice. Unknown mempertahankan ceiling; late settlement dapat menyelesaikannya tanpa dispatch ulang.
- Stop/gagal tanpa hasil mengembalikan allowance, tetapi biaya provider tidak dihapus. Retry tidak membatalkan refund lama. Cap operasional provider periode 120% membatasi subsidi; cap harian account/global terpisah. Model tidak dapat menaikkan budget atau plan.
- Approval/replay/stop/kontrol memory tidak menambah pesan. Hasil/unduhan dan pause/forget tetap tersedia saat allowance habis.
- Halaman Usage menjelaskan used/reserved/remaining/reset, kapasitas file, history dan refund. Estimasi Task/jadwal berasal dari server, bersifat non-binding, dan diperiksa ulang saat admission. Error mempertahankan angka terakhir serta menyediakan retry.
- S3 I/O disponsori, mempunyai dedup identity, ukuran/attempt/price snapshot dan audit tersendiri. Tidak membanjiri history utama atau memblokir pembacaan hasil saat saldo nol.

## Walkthrough nyata

Akun development yang sudah dipakai penerimaan terdahulu; thread audit baru `e6de8c92-0801-5b92-adc5-fc03fddbe5f3`. Tidak ada kredensial/cookie pada bukti.

| Input | Expected dan actual |
| --- | --- |
| Chat: 17 dikali 3, tanpa Task | Jawaban 51; satu pesan; hold 300 kredit diselesaikan menjadi 0,399 kredit. |
| Task teks tiga langkah presentasi, review required | Task `a42392ef-f53d-430a-9117-e0462acde758` menghasilkan draft, lalu finalisasi melalui UI; satu model attempt. Approval tidak mengubah used chat 20. Hold 30 menjadi 0,076 kredit. |
| Python: jumlah 1–100, simpan hasil.md | Task `bc6a797f-946c-413a-851a-854877945c3b` succeeded. Hold 138 menjadi 1,338 kredit: 0,198 model + 1,140 runtime. Resource deleted. |
| Cadangan saldo nol sementara | Remaining menjadi 0. Task baru menerima 429 tanpa menambah pesan: used 21 sebelum/sesudah. Caption dan kontrol tetap terlihat. Hold audit kemudian dilepas. |
| Unduhan ketika saldo nol | HTTP200, 135 byte, memuat 5050; SHA-256 cocok dengan manifest. |
| Putus update Usage terkontrol | Data terakhir tetap tampil, pesan stale dan tombol Perbarui tersedia; fetch browser dikembalikan dan halaman dimuat ulang. |
| Mobile 390×844 dan 320×640 | Scroll internal bekerja; document scrollWidth sama dengan viewport; penjelasan saldo nol dan angka tidak overflow. |

Result Python `08ff0147-0da0-5701-9be4-9f5bce3c2d3e`; file revision `74314931-ff58-50c1-a49a-ee7a00f47373`. SHA-256 `6c652a268a5ce70710531de3e7c6e8a4a17e6e4c564a7339c0e4ec84278022f3`. Total public compute ketiga pekerjaan **1,813 kredit**; semua cadangan kerja/audit telah dilepas. S3 I/O bersponsor dicatat terpisah.

Bukti: [readback ledger/Task/resource](evidence/usage-40/live-readback.json), [saldo nol dan unduhan](evidence/usage-40/zero-balance.json), [desktop](evidence/usage-40/desktop-usage.png), [mobile saldo nol](evidence/usage-40/mobile-zero.png), [320 px](evidence/usage-40/mobile-320.png), [stale data](evidence/usage-40/usage-stale.png).

## Provider dan biaya awal

[Probe provider](evidence/usage-40/live-providers.json) memakai database/prefix storage sementara dan input sintetis, lalu membersihkannya. Embedding nyata melaporkan 8 token (estimasi 1 microUSD setelah pembulatan); GPT-5 Mini 22 token (23 microUSD). Mistral OCR membaca satu PNG, satu halaman, estimasi 4.000 microUSD. Model Task setelah OCR memakai fixture terkontrol dan tidak diklaim inference nyata. Uang tetap estimated dan `invoice_confirmed=false`.

[Benchmark awal](evidence/usage-40/initial-benchmark.json) membaca quantity historis owner yang dipakai penerimaan development dan menerapkan catalog harga eksplisit untuk analisis. Tidak mengubah charge historis. Sampel mencakup chat, Task teks/Python/browser, proaktivitas, resource dan retensi profil serta S3 I/O. Sampel memory/OCR tambahan berada pada probe provider. Browser/retensi mendominasi biaya sampel; itu dasar penggunaan allowance biaya dan cap operasional. Penetapan harga, batas subsidi dan sensitivitas dijelaskan di [kontrak runtime](usage-runtime.md).

## Pemeriksaan

- `make usage-inspect`: **48 kontrak** pada PostgreSQL disposable, mencakup P24/P25/P26, race account, batas parent, no-output refund/retry, provider-period cap, rollover/grant, price snapshot, owner isolation, forged cap, HTTP dan sponsored storage.
- Probe `--live`: **46 pemeriksaan lulus**, mencakup 43 kontrak saat probe dijalankan dan tiga penerimaan provider tambahan. Dua kontrak vendor-period dan tiga kontrak crash/recovery berikutnya termasuk pada hasil offline 48; kelompok yang beririsan tidak dijumlahkan sebagai pemeriksaan unik.
- Regresi: Task **55**, kuota chat **46**, file **47**, sandbox **45**, browser **47**, scheduler **82**, memory **62**, proaktivitas **105**.
- Fixture browser/proaktivitas menggunakan allowance compute probe yang diperbesar agar corpus lama tetap menguji kontrak domain; enforcement allowance default dibuktikan terpisah oleh inspector NG-040.
- `make check`, `make build`, `make docs-check`, dan whitespace check menjadi gates akhir. Bukti hasil tercatat pada [checks.json](evidence/usage-40/checks.json).

[Kontrak offline](evidence/usage-40/controlled-contracts.json) dan [probe live](evidence/usage-40/live-contracts.json).

## Batas bukti

Penerimaan ini untuk development dan input sintetis; bukan deployment production, invoice, margin populasi, atau pengujian perangkat fisik. Tidak menjalankan ulang seluruh login/VNC/browser/schedule pada provider nyata: jalur biaya native diuji dengan kontrak dan telemetry penerimaan sebelumnya; walkthrough baru memakai chat, Task teks, Python, OCR dan model memory. Tidak ada auto-login, perubahan akun eksternal atau checkout.

S3 memakai estimasi konfigurasi ekuivalen R2, bukan invoice local MinIO. Retensi kapasitas sesudah 30 hari dan bytes dari signed download langsung belum menjadi angka invoice. Retensi browser tetap konservatif per-use sebagaimana NG-036. Pekerjaan yang diterima sebelum NG-040 mempertahankan budget native lama dan tidak ditagih ulang. NG-041 tetap memerlukan corpus representatif, invoice/operasi/retention, kualitas dan p50/p95 sebelum release.
