> Catatan historis sebelum reset V1 asisten umum pada 18 Oktober 2026. Kontrak/command pembelajaran, migration head dan hasil acceptance lama di bawah tidak menjadi persyaratan aktif. Lihat [spesifikasi V1](../product/01-produk-dan-paket.md) dan [baseline baru](baseline-v1-acceptance.md).

# Kuota #05 — implementasi dan penerimaan

Implementasi lokal 16 Oktober 2026 untuk [backlog #05](../backlog/tasks/05-kuota-course-chat-dan-materi-per-periode.md). [Kebijakan kuota](quota-05-policy.md) menetapkan periode, normalisasi materi, pembatalan, dan pemulihan sebelum ledger dibuat.

## Hasil

- Meter independen `course`, `chat`, `material_pages`: Free 1/100/100, Plus 5/300/200 per 30 hari.
- Free mengikuti aktivasi akun; aktivasi Plus internal menghasilkan periode 30 hari, renewal lebih awal dijadwalkan, dan expiry kembali ke Free. Batas serta versi kebijakan dibekukan per periode. Tidak ada setter paket melalui HTTP/tool agent.
- Reserve/commit/release/reverse memakai transaksi caller, lock akun, identitas operasi/input, serta token reservasi. Retry setelah pengembalian mendapat token baru. Operasi lintas reset selesai pada periode asal; pengembalian terlambat tidak menambah allowance periode baru.
- Chat menahan kapasitas bersama pembuatan run, pesan, event, dan enqueue. Teks publik atau kartu HITL melakukan commit dalam transaksi publikasi yang sama. Failure/stop tanpa hasil melepaskan reservasi; partial output tetap dihitung. Multi-call, reconnect, replay, keputusan approval dan recovery tidak menambah unit.
- Run sebelum migrasi mempunyai pasangan quota ID/token null dan tidak ditagih retroaktif. Tujuan `/course` tetap belum mengambil slot Course.
- `GET /quotas` mengembalikan paket, periode, serta `limit`, `used`, `reserved`, `remaining` masing-masing meter. Kegagalan admission menghasilkan 429 dengan `quota_exceeded`, meter, jumlah yang dibutuhkan, saldo, `reset_at` dan `Retry-After`.
- Ringkasan di composer menyediakan jumlah pesan tersisa, rincian tiga meter, pekerjaan yang sedang memegang reservasi dan tanggal lokal reset. Draft tetap bisa diedit saat kirim diblokir. Query per akun diperbarui setelah send/status/stop/retry, saat kembali ke aplikasi, maksimum setiap 30 detik ketika terlihat, dan dekat batas periode.

## Batas modul

[Package kuota](../../apps/backend/src/ngertiin/quotas/) memiliki policy, periode/grant, ledger, kontrak Course/materi, serta HTTP projection/error. [Integrasi chat](../../apps/backend/src/ngertiin/chat/quota.py) menyelaraskan pemakaian dengan output durable. [Transaksi async bersama](../../apps/backend/src/ngertiin/async_db.py) dipakai chat dan kuota tanpa dependency kuota ke fitur chat.

Migration `0004_quotas` menambah `quota_grants`, `quota_periods`, `quota_operations`, `quota_events`, dan pasangan reservasi pada `chat_runs`. Saldo dihitung dari operasi pada periode terkait; tidak ditambahkan cache/counter terpisah. Audit ditulis dengan append oleh aplikasi dan mempertahankan periode/token/jumlah setiap revision operasi, termasuk ketika retry memindahkan reservasi yang telah dilepas ke periode baru.

Urutan lock untuk mutasi gabungan adalah akun → thread/domain → run/approval → operasi. Tidak ada panggilan model, OCR atau network di dalam transaksi ledger. Admission selalu membaca operasi terdahulu sebelum memeriksa allowance periode baru. Konsumen Course/materi harus mengikuti urutan lock ini.

## Kontrak integrasi berikutnya

Semua fungsi menerima koneksi pada transaksi aktif milik caller. Persist ID dan token reservasi pada pekerjaan domain; worker yang dibatalkan harus dipagari sebelum release/reverse. Commit hasil domain dan ledger dalam transaksi yang sama.

| Konsumen | Titik integrasi |
| --- | --- |
| #06 ingestion | Ukur konten bersih di backend, cek ownership/revisi dan reuse ready, lalu `reserve_material`; commit saat hasil ready, release ketika gagal/cancel sebelum ready. Identitas ingestion baru diperlukan jika hasil sengaja dihapus dan harus diproses ulang. |
| #08 outline | Validasi owner, proposal serta revision approval; `reserve_course` bersama penyimpanan approval exact. Mengubah outline yang sudah terikat pada identitas sama ditolak oleh fingerprint. |
| #09 generation | Gunakan reservasi Course tersimpan; commit bersama publikasi Lesson pertama yang lolos gate. Node lanjutan/repair/pengayaan memakai slot tersebut. Reverse kegagalan final hanya sesudah fencing/recovery diputuskan oleh workflow. |
| #21 pembayaran | Setelah verifikasi callback dan rekonsiliasi pembayaran, panggil `grant_plus` memakai UUID idempotensi yang stabil serta sumber transaksi. Tidak ada panggilan gateway pada #05. |
| #22 paket | Gunakan API usage dan primitive grant untuk UI/koordinasi lifecycle paket lengkap. |

Normalisasi `page-equivalent-v1` mempunyai contoh yang diperiksa: 500 kata = 1, 501 kata = 2, PDF 9 halaman = 9, 2 gambar = 2, 3 halaman hasil render = 3. Empty input dan measurement yang tidak konsisten ditolak. Parser/OCR, seleksi sumber, dan penyimpanan hasil ingestion berada di #06/#07.

## Verifikasi

[Bukti terstruktur](evidence/quota-05/manual-acceptance.json) memisahkan probe kontrak, fixture exhaustion, dan model asli.

| Pemeriksaan | Hasil |
| --- | --- |
| Database terisolasi | 55 skenario lulus; migrasi/queue schema nyata, database sementara dihapus setelah probe |
| Perebutan slot terakhir | 12 request bersamaan: 1 diterima, 11 ditolak |
| Idempotensi/fencing | Replay tidak menambah unit; input berbeda ditolak; token lama tidak dapat commit setelah reservasi baru |
| Periode | Reserve lintas reset, late refund, lazy reset, Plus activation/renewal/expiry, dan renewal melewati DST dengan durasi UTC tepat |
| Atomisitas | Kegagalan transaksi domain mengembalikan admission; penolakan send tidak menciptakan message |
| Chat/recovery | Output publik/kartu HITL commit; reasoning saja tidak; gagal tanpa hasil release; stop sesudah output tetap dihitung; recovery terminal melepaskan reserve tanpa output |
| Otorisasi/API | Tanpa autentikasi 401, mutasi grant publik 405, field billing palsu pada send 422, owner lain ditolak, exhaustion 429 terstruktur |
| Chat asli melalui browser | Jawaban 7 + 5 selesai; satu pesan memakai satu unit. Proposal tujuan Course memakai unit kedua, slot Course tetap 1 tersedia |
| Browser pada kuota nol | Reservasi fixture 98 unit menutup sisa kapasitas; send mendapat 429 dan draft bertahan melewati reload. Persetujuan proposal tetap selesai, usage chat tetap 2, tanpa slot Course tambahan |
| Mobile | Lebar viewport/document sama-sama 390 px; ringkasan kuota, tanggal WITA, draft, dan disabled send terlihat |
| Cleanup fixture | Reserve 98 unit dilepas; sisa 98, used 2, reserved 0. History dan audit dipertahankan |
| Static/build | `make check`, `make build`, serta wheel/sdist backend lulus |

Screenshot: [desktop](evidence/quota-05/desktop.png), [mobile kuota habis](evidence/quota-05/mobile-exhausted.png), [rincian kuota](evidence/quota-05/mobile-usage.png), dan [approval ketika kuota habis](evidence/quota-05/approval-exhausted.png).

## Menjalankan ulang

```sh
make migrate
make check
make build
make quota-inspect
```

`quota-inspect` memerlukan environment development dan hak membuat database PostgreSQL sementara. Command ini tidak menjalankan model/gateway; ia membuat database unik dengan migrasi aplikasi, memeriksa transaksi/HTTP/recovery, lalu menghapus database tersebut. Hasil default disimpan di `.dev/quota05-ledger.json`. Bukti model/browser di atas merupakan penerimaan manual terpisah.

Course/materi baru diterima sebagai kontrak transaksi pada #05. Verifikasi ingestion/generation nyata mengikuti #06/#08/#09. Penerimaan ini belum mencakup deploy production, load test multi-replica, gateway pembayaran atau pembatalan/refund entitlement berbayar.
