# Kuota Course, chat dan materi per periode

Sumber: [Notion](https://app.notion.com/p/3f8abdd61873813a8393edbb6c77cb6b) · Readback: 2026-10-18T06:04:56.780944+00:00

| Property | Value |
| --- | --- |
| Ticket | 5 |
| Urutan | 1005 |
| Lingkup | Histori |
| Status | Done |
| Prioritas | P0 |
| Area | Billing |
| Depends on | [Fondasi production: workspace, auth dan data](02-fondasi-production-workspace-auth-dan-data.md) |

<!-- notion-content:start -->
**Lingkup: Histori · NG-005 · reset 18 Oktober 2026.** Penerimaan lama tetap Done sebagai catatan historis. Scope pembelajaran dan paket lama tidak menjadi acceptance V1 baru.
Spesifikasi aktif: [01 · Produk & Scope V1](../../product/01-produk-dan-paket.md). Urutan/dependensi aktif: [07 · Backlog Implementasi V1](../README.md).

## Hasil

Paket Free/Plus diterapkan dengan ledger yang konsisten.

## Acceptance criteria

- [x] Free 1 Course/100 chat/100 halaman dan Plus 5 Course/300 chat/200 halaman mengikuti periode 30 hari; normalisasi halaman lintas format ditetapkan.
- [x] Tentukan anchor periode, reservasi/commit slot, pergantian periode dan pembatalan sebelum implementasi ledger.
- [x] Request bersamaan dan retry tidak melewati kuota atau menghitung satu Course dua kali.
- [x] Seluruh outline dan pengayaan tujuan yang sama memakai satu slot; kuota pembuatan habis tetap mengizinkan belajar konten tersedia.

## Implementasi dan penerimaan #05

Diselesaikan pada <mention-date start="2026-10-16"/> berdasarkan cakupan brainstorming yang disetujui.
- Tiga meter independen: Course, pesan pengguna dan halaman materi. Free 1/100/100; Plus 5/300/200 per 30 hari. Model, fitur dan standar kualitas sama.
- Free berjangkar pada aktivasi akun aplikasi, tanpa rollover; periode UTC dibuat sesuai kelipatan 30 hari, dengan snapshot limit dan versi aturan. Aktivasi Plus internal memulai 30 hari; renewal lebih awal dijadwalkan setelah periode Plus terakhir. Expiry kembali ke Free dengan anchor akhir Plus.
- Ledger menerapkan reserve, commit, release dan reverse dengan transaksi PostgreSQL, lock akun, identitas input serta token reservasi. Request bersamaan/replay tidak melampaui kuota. Retry setelah pengembalian memeriksa kapasitas dan mendapat token baru; worker lama tidak dapat commit.
- Reservasi lama diselesaikan pada periode asal meskipun melewati reset. Pengembalian terlambat memperbaiki periode asal tanpa menambah allowance periode baru. Tidak ada pelepasan otomatis berdasarkan umur saja; workflow harus memastikan fencing/status terminal.
- Satu pesan pengguna mereservasi satu unit ketika run dibuat; teks publik atau kartu HITL tersimpan melakukan commit. Reasoning/progress tool belum dihitung. Stop/error tanpa hasil melepaskan reserve; partial output tetap dihitung. Multi-call, replay, reconnect, approval dan recovery tidak menambah unit. Chat historis tidak ditagih retroaktif.
- Tujuan `/course`, pencarian sumber dan review outline belum memakai slot Course. Kontrak #08 mereservasi satu slot pada approval revisi outline exact; #09 commit saat Lesson pertama lolos gate dan tersedia. Node lanjutan, repair dan pengayaan tujuan sama memakai slot tersebut. Pembatalan sebelum publikasi melepas reserve; kegagalan sistem final yang tidak dapat memenuhi outline memulihkan pemakaian setelah recovery dihentikan.
- Normalisasi `page-equivalent-v1`: PDF per halaman, gambar per lembar, dokumen dominan gambar per halaman render; teks/web tanpa pagination tetap dibulatkan ke atas setiap 500 kata konten bersih, minimum satu untuk konten nonkosong. Empty/inconsistent measurement ditolak. #06 memeriksa owner/revisi dan reuse ready sebelum reserve; retry/reindex tidak menagih ulang. Parser/OCR dan ingestion nyata mengikuti #06.
- `GET /quotas` menampilkan paket, periode serta limit/used/reserved/remaining. UI composer menampilkan sisa pesan, rincian tiga meter dan tanggal reset lokal; input/draft dipertahankan saat kuota habis. Keputusan pending, stop dan pekerjaan diterima tetap dapat diproses pada kuota nol. Belajar konten tersedia tetap diizinkan; pertanyaan baru lewat chat mengikuti meter chat.
- Fungsi aktivasi Plus hanya tersedia bagi backend tepercaya; browser dan agent tidak dapat memberikan paket sendiri. Pemilihan/integrasi payment gateway mengikuti #21; pengelolaan paket lengkap mengikuti #22.

### Bukti

- 55 skenario database terisolasi lulus, termasuk 12 request berebut satu slot (1 diterima), idempotensi, fencing, rollback, pergantian periode, Plus activation/renewal/expiry, durasi UTC melewati DST, HTTP ownership/forged fields serta recovery.
- Browser memakai akun Clerk development, API, worker dan model asli: jawaban langsung memakai satu unit, proposal tujuan memakai unit kedua dan tidak mengambil slot Course. Fixture reserve 98 unit menghabiskan sisa; send ditolak 429 dan draft bertahan setelah reload. Approval yang sudah diberikan tetap selesai pada kuota nol, usage tetap dua. Fixture sudah dilepas.
- Mobile 390 px tanpa overflow; ringkasan reset WITA dan disabled send diperiksa. `make check`, `make build`, wheel serta sdist lulus.
- Dokumen repo: `docs/engineering/quota-05-policy.md`, `docs/engineering/quota-05-implementation.md`, dan `docs/engineering/evidence/quota-05/manual-acceptance.json`. Probe dapat dijalankan dengan `make quota-inspect`.

### Batas penerimaan

Chat, ledger, periode, endpoint usage dan UI telah diterapkan. Course/materi diterima sebagai kontrak transaksi pada #05; penerimaan ingestion/generation nyata mengikuti #06/#08/#09. Deploy production, gateway pembayaran dan refund entitlement berbayar mengikuti pekerjaan berikutnya.

## Spesifikasi

[01 · Produk & Scope V1](../../product/01-produk-dan-paket.md)
<!-- notion-content:end -->
