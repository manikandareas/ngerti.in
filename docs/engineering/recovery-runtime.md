# Recovery dan restore V1

Recovery mempertahankan state produk sebagai sumber kebenaran. Queue mengirim pekerjaan dan checkpoint menyimpan posisi workflow; status queue `succeeded` sendiri tidak berarti Task selesai.

## Worker mati dan replay

`foundation.recover_stalled` berjalan pada startup dan setiap menit. Procrastinate memakai heartbeat worker untuk mengenali job yang kehilangan proses, termasuk job maintenance. Job Task/chat yang stalled ditandai failed terlebih dahulu, lalu domain merevoke lease dan membuat job pengganti secara atomik. Job terdaftar lain memakai retry terbatas; nama job yang tidak dikenal tidak dieksekusi.

Pemeriksaan domain berjalan terpisah untuk chat, Task, ekstraksi file, memory, proaktivitas dan usage. Satu domain yang gagal dicatat melalui `recovery.component_failed`; pass berikutnya mencoba lagi tanpa menghentikan recovery domain lain. Task/chat tanpa referensi job juga diperiksa. Hasil yang sudah terkonfirmasi tidak diulang; penggunaan provider yang belum pasti tetap dihitung sampai ada bukti koreksi.

Publikasi hasil menggunakan bytes terverifikasi lalu satu transaksi manifest, pesan delivery, action dan status Task. Crash sebelum transaksi selesai mengembalikan seluruh perubahan visibility. Bila action masih executing setelah crash, Task menjadi unknown sampai rekonsiliasi. Bukti tidak adanya receipt hanya berlaku untuk publikasi internal yang transaksional; efek browser memerlukan pemeriksaan terpisah dan tidak diklik ulang otomatis.

## Pembaruan aplikasi

Jalankan `make migrate` lalu restart worker. Migrasi 0016 menambah workflow version dengan nilai awal 1 pada Task/jadwal serta registry restore; 0017 mengikat registry dengan bucket hasil restore. Keduanya incremental dan tidak mereset data.

Versi 1 yang tersimpan mempertahankan budget, input, revision, approval dan checkpoint semula. Versi yang belum didukung ditahan dengan outcome `upgrade_required`; approval/retry/edit ditolak. Jadwal versi yang belum didukung dijeda dengan alasan terlihat. Lease dan workflow version memagari penulisan state/checkpoint. Dukungan versi workflow baru di masa depan memerlukan migrasi/resume yang eksplisit; mengganti angka versi tidak memigrasikan checkpoint.

## Backup development offline

Tool berikut ditujukan untuk PostgreSQL dan MinIO lokal. Hentikan API dan seluruh worker sebelum backup, termasuk worker maintenance. Tool menolak source yang masih memiliki koneksi lain; `--quiesced` menyatakan proses tersebut tetap dihentikan selama salinan dibuat.

```sh
uv run --project apps/backend python scripts/recovery_backup.py create .dev/backups/ng023 --quiesced
```

Directory harus baru dan dibuat dengan permission 0700. Backup mencakup custom PostgreSQL dump, seluruh object bucket dan manifest SHA-256. Object durable yang direferensikan database wajib tersedia dan cocok dengan hash-nya. Manifest hanya diterbitkan setelah seluruh langkah berhasil. Backup memuat data pribadi; simpan di lokasi privat dan jangan commit dump/object ke Git. Kredensial aplikasi dan profil login vendor tidak diekspor oleh tool ini.

## Restore ke target baru

```sh
uv run --project apps/backend python scripts/recovery_backup.py restore .dev/backups/ng023
```

Perintah mengalokasikan database `ngertiin_restore_<uuid>` dan bucket `ngertiin-restore-<uuid>` baru; tidak menimpa resource asal. Dump dan object diperiksa sebelum dipakai; bytes object diperiksa lagi setelah upload. Output menyebut nama target. Bila restore terputus sebelum mengembalikan sukses, target parsial tetap offline dan perlu diperiksa/dibersihkan sebelum mengulang.

Set `DATABASE_URL` ke database baru dan `S3_BUCKET` ke bucket baru pada environment restore. Jangan arahkan database salinan ke bucket asal. Restore registry memeriksa pasangan tersebut saat startup API/worker.

State aktif dalam snapshot tidak otomatis dijalankan: queue dipagari, viewer dicabut, Task/chat aktif diberi outcome terlihat, jadwal dijeda, kandidat proaktif dibuang dan pekerjaan memory yang belum selesai dihentikan. Hasil ready dan histori tetap tersedia. Efek vendor setelah waktu backup belum dapat disimpulkan dari snapshot lama.

```sh
uv run --project apps/backend python scripts/recovery_backup.py release
```

Release memeriksa resource sandbox/browser melalui lookup read-only. Resource yang masih ada atau lookup yang gagal mempertahankan karantina; operator harus memeriksa resource asal sebelum melanjutkan. Tidak ada cleanup atau replay provider otomatis dari salinan. Saat seluruh referensi telah dikonfirmasi tidak ada, session ditutup dengan biaya unknown yang konservatif, profil yang hilang dipensiunkan dan Task menunjukkan resource tidak tersedia. Jadwal tetap dijeda sampai pengguna meninjau dan mengaktifkannya kembali. Hasil durable tetap dapat dibuka.

API/worker menolak startup selama karantina. Sesudah release, jalankan API/worker pada environment target tersebut. Pekerjaan aktif dari snapshot tidak diulang; pengguna dapat membuat Task baru setelah memeriksa outcome. Jangan menjalankan source dan restore sebagai dua deployment aktif sekaligus.

## Verifikasi

`make recovery-inspect` menjalankan SIGKILL sebelum checkpoint/publikasi, orphan recovery, rollback manifest/delivery, compatibility, occurrence replay, kegagalan satu domain dan dump/object restore pada resource sementara. Seluruh provider/model faults memakai adapter terkontrol kecuali lookup vendor read-only yang dicatat terpisah. Lihat [penerimaan NG-023](recovery-23-acceptance.md).
