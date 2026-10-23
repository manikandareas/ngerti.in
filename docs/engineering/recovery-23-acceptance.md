# NG-023 · Penerimaan recovery end-to-end

Diterima development pada 19 Oktober 2026. Tiket: [NG-023](../backlog/tasks/23-recovery-end-to-end-dan-konsistensi-state.md). Kontrak operasional dan perintah backup/restore: [Recovery runtime](recovery-runtime.md).

## Hasil dan bukti

- [41 kontrak recovery](evidence/recovery-23/contracts.json) lulus pada PostgreSQL/MinIO nyata dengan database/bucket sementara yang dihapus. Dua proses Python benar-benar dihentikan dengan SIGKILL: sebelum checkpoint review dan sesudah bytes hasil tersimpan sebelum delivery. Recovery menghasilkan satu manifest, satu delivery dan satu settlement tanpa memanggil model ulang.
- P06/P08: draft/checkpoint bertahan; action executing menjadi unknown, retry ditolak sampai rekonsiliasi. Fault sesudah manifest/message insert membuktikan rollback visibility dan delivery bersama. Late usage hanya mengoreksi receipt yang sama. Regresi Task55/File47/Computer47/Sandbox45 memeriksa fencing, stale checkpoint, unknown tool effects, cleanup dan owner boundaries.
- P29: workflow v1 dan data lama dipertahankan melalui migrasi 0016/0017. Approval versi tidak didukung ditolak dan Task ditampilkan sebagai upgrade_required; jadwal versi tidak didukung dijeda. Hasil Markdown NG-039 yang sudah ada tetap dapat dipreview pada browser setelah migrasi. Ini bukti migrasi/reload development, bukan rolling deployment production.
- P30: custom pg_dump/pg_restore dan salinan object benar-benar dijalankan. SHA-256 hasil sama setelah restore; startup ditahan, bucket asal ditolak, vendor yang masih ada mempertahankan karantina, vendor yang hilang menghasilkan outcome terlihat. Tidak ada replay Task/queue atau jadwal otomatis dari snapshot. Backup korup ditolak.
- [bukti provider lama telah dihapus](e2b-only-cleanup.md) mengonfirmasi state absent untuk sandbox dan browser melalui nama resource acak yang tidak ada. Operasi read-only, tidak membuat resource. Lifecycle provider dalam restore drill memakai adapter terkontrol.
- [bukti provider lama telah dihapus](e2b-only-cleanup.md) mencatat versi dependency, suite regresi dan observasi CUA pada Brave yang sudah terautentikasi. Dua state terminal sintetis ditampilkan; detail bisa dibuka, reload mempertahankan state, retry/edit/approval tidak tersedia. Desktop dan mobile emulasi 390×844 diperiksa; tidak ada overflow horizontal dan viewport dikembalikan.

## Pemeriksaan

`make check`, `make build` dan `git diff --check` lulus. Regresi: Task55, File47, Computer47, Sandbox45, Schedule82, Usage48, Goal74, Proactivity105, Billing69 dan Entitlement49. Computer/Sandbox/Schedule/Proactivity memakai allowance fixture yang diperbesar melalui environment proses uji; allowance aplikasi tidak diubah. Pemeriksaan usage memakai allowance default.

Source development dimigrasikan secara incremental tanpa reset data. Worker dimuat ulang setelah dipastikan tidak ada Task/chat running. Fixture browser dibuat sebagai Task sintetis dengan job terminal; fault SIGKILL dan restore memakai resource terisolasi, bukan akun/data development aktif.

## Batas bukti

Tidak mengklaim backup/restore R2, deployment production, invoice vendor, seluruh situs browser atau crash nyata pada setiap provider. Provider/model/tool faults yang terkontrol dibedakan dari SIGKILL, checkpoint, transaksi PostgreSQL, object copying dan lookup Daytona yang nyata. NG-041 tetap mengukur kualitas, latency dan biaya lifecycle; NG-025 tetap menjadi gerbang release production.

> Bukti yang bergantung pada provider lama telah dihapus saat [pembersihan E2B saja](e2b-only-cleanup.md). Ini tidak mengubah hasil pemeriksaan terkontrol yang masih tersedia.
