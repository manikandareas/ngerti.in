# E2B sebagai satu-satunya runtime

Pada 22 Oktober 2026 pemilik proyek meminta penghapusan Daytona, termasuk data lama. E2B melayani Python, browser, desktop/VNC dan takeover. Identitas provider yang tidak didukung ditolak; resource lama tidak pernah dilabel ulang sebagai E2B.

## Pembersihan terverifikasi

- Dua sandbox cloud Ngertiin dihapus; readback daftar sandbox kosong. Snapshot custom dan volume tidak ditemukan. Snapshot umum vendor bukan resource proyek.
- Database aktif: 15 task beserta 15 result root, 12 result revision, 15 file hasil, 5 sandbox session, 3 browser workspace, 11 computer session, step/viewer/output terkait, 321 chat event dan checkpoint task dihapus.
- Sebanyak 27 object key output/staging dihapus dari bucket yang tidak mengaktifkan versioning. File input yang dipakai bersama tetap tersedia.
- Catatan biaya pekerjaan lama dibersihkan. Ditemukan label provider hardcoded pada resource receipts; kode diperbaiki dan 9 receipt E2B direkonsiliasi dari sesi native yang dipertahankan. Saldo dihitung oleh view dari ledger yang tersisa.
- Readback database tidak menemukan teks Daytona pada tabel aplikasi. Satu workspace E2B, delapan computer session E2B dan satu sandbox session E2B tetap tersedia.
- Trial/CLI/API/UI khusus provider lama, dua adapter, SDK beserta dependensi eksklusifnya, konfigurasi dan nilai kredensial lokal dihapus. Probe persistence file dialihkan ke E2B.
- Sebanyak 93 artefak lokal khusus provider lama dihapus, termasuk SQLite trial dan hasil probe/log. Cache Python dan paket build lama dibersihkan.
- Bukti runtime dan riset khusus provider lama dihapus. Berkas penunjuk historis serta identitas tiket tetap ada agar tautan dan mirror Notion tidak rusak; kontennya bukan klaim penerimaan E2B.

## Batas cakupan

Pembersihan mencakup akun provider yang dapat diakses dengan konfigurasi proyek dan database/bucket aktif. Tidak ditemukan file `database.dump` pada `.dev`. Backup di luar workspace, environment lain, log vendor dan riwayat Git tidak ditulis ulang. API key dihapus dari `.env`; pencabutan key pada akun vendor belum diverifikasi.

## Validasi

`make check`, `make build`, `make docs-check` dan `git diff --check` lulus. Inspector sandbox **45**, computer **51**, Library **73**, usage **49** dan recovery **41** kontrak lulus; database/bucket sementara dibersihkan.

Uji browser E2B nyata lulus untuk public HTTPS, private VNC/RFB, download, pause/resume pada sandbox yang sama, profil setelah worker restart, layar sesudah resume, dan penghapusan terkonfirmasi. Probe persistence E2B lulus untuk tiga file yang tetap sama sesudah sandbox dihapus, memakai database/bucket disposable.

Percobaan browser pertama gagal pada kesiapan desktop saat resume; reproduksi terpisah dan pengulangan lengkap kemudian lulus. Tidak ada perubahan runtime spekulatif. Kesiapan desktop intermiten masih merupakan observasi yang perlu dipantau, bukan kegagalan yang sudah dinyatakan terselesaikan.

Ringkasan terstruktur: [validation.json](evidence/e2b-only-cleanup/validation.json). Probe live tetap eksplisit melalui `make e2b-browser-probe` atau `scripts/probe_file_persistence.py --live --owner UUID`.
