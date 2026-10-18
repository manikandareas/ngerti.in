> Catatan historis sebelum reset V1 asisten umum pada 18 Oktober 2026. Kontrak/command pembelajaran, migration head dan hasil acceptance lama di bawah tidak menjadi persyaratan aktif. Lihat [spesifikasi V1](../product/01-produk-dan-paket.md) dan [baseline baru](baseline-v1-acceptance.md).

# Penerimaan manual fondasi #02

Sumber: [tiket Notion](https://app.notion.com/p/3f8abdd61873817d9529f43e39a5979f). Pengujian perilaku melalui browser, sesuai keputusan pengguna. Storage acceptance menggunakan MinIO; R2 ditunda atas arahan pengguna.

Penerimaan selesai pada **15 Oktober 2026**. Web, API, dan worker berjalan di mesin; PostgreSQL/pgvector serta MinIO berjalan pada Compose `ngertiin-v1`.

## Checklist

| Pemeriksaan | Status dan bukti |
| --- | --- |
| Startup web/API/worker lokal | Lulus. Web `127.0.0.1:3000`, API `127.0.0.1:8000`, dan worker host berjalan. |
| Database kosong → migrasi, pgvector, queue, checkpoint | `make setup` berhasil pada database baru; pengulangan setup juga berhasil. |
| Bucket development | Setup bucket berhasil; browser menampilkan storage siap. |
| Health membedakan komponen | Browser menampilkan delapan komponen infrastruktur siap dan Clerk terkonfigurasi. |
| Storage dihentikan | MinIO dihentikan manual; browser menampilkan 7/8 siap dengan Storage S3 belum siap, sementara API/DB/worker tetap siap. |
| Akun baru dan login Clerk | Lulus untuk dua test account. Login email-code melalui UI menghasilkan dua account UUID internal yang berbeda. |
| Refresh dan logout | Lulus. Sesi bertahan setelah refresh; logout menghilangkan data akun; login ulang A mempertahankan account UUID yang sama. |
| Queue → workflow → artifact storage | Lulus. Job #13 selesai melalui Procrastinate dan LangGraph, menghasilkan JSON 200 B yang dapat diunduh melalui signed URL. |
| Browser ditutup/dibuka kembali | Lulus. Tab pembuat job #13 ditutup ketika berjalan; tab berikutnya menampilkan run yang sama selesai. |
| Worker mati dan recovery | Lulus. Worker job #26 dimatikan paksa setelah tahap persiapan tersimpan, lalu dinyalakan kembali. Run yang sama selesai pada percobaan kedua dengan satu artifact. |
| Upload/download/delete | Lulus. Browser mengunggah File contoh 71 B melalui multipart ke MinIO; signed download artifact berhasil; file contoh dihapus melalui UI setelah persetujuan pengguna. |
| Isolasi dua akun | Lulus. B tidak melihat run/file A. Lookup ID run A dari sesi B menghasilkan 404 “Pekerjaan tidak ditemukan”. |
| Database dan API dihentikan | Lulus. DB mati: hanya API/storage siap, komponen terkait DB belum siap, operasi akun gagal. API mati: UI menyatakan API tidak dapat dihubungi. Keduanya pulih setelah restart. |
| Persistence setelah restart container | Lulus. Run/checkpoint bertahan setelah restart PostgreSQL; ketiga object sebelum penghapusan contoh tetap dapat dibaca setelah restart MinIO. |
| Desktop/mobile dan light/dark | Lulus peninjauan visual desktop dan viewport mobile 390 × 844, termasuk dark mode. Viewport dan tema dikembalikan setelah pemeriksaan. |
| Lint/typecheck/build | Lulus. Biome, TypeScript, Ruff lint/format, mypy, build web, dan build package Python. Workflow CI tersedia; eksekusi remote belum dilakukan. |

## Bukti recovery

- Run A: `f199f04c-3e8c-4917-a6a6-d86bfd5301b4`, job #13.
- Run B: `6af6604d-abfc-47b2-b97b-ba80f3bf1ccc`, job #26.
- Checkpoint persiapan job #26 menyimpan `prepared_at=2026-10-15T13:12:56.881378+00:00` sebelum worker dimatikan. Artifact akhir memuat nilai yang sama, membuktikan hasil tahap persiapan dipakai kembali.
- Artifact job #26 berukuran 253 B, dengan satu record `3ae42d19-2db1-5237-b3ce-ec03d77781fc`. Log worker mencatat `job.recovered` lalu `diagnostic.completed`.
- Pemeriksaan checkpoint, jumlah record, dan isi object dilakukan sebagai observasi operasional tambahan. Tidak ada suite pengujian otomatis.

## Bukti visual

[Desktop siap](evidence/foundation-02-desktop.jpg) · [Mobile dark mode](evidence/foundation-02-mobile-dark.jpg).

## Akun uji

Pengguna mengizinkan penggunaan test account Clerk. Dua akun development disiapkan melalui Backend API dengan alamat `foundation-a+clerk_test@example.com` dan `foundation-b+clerk_test@example.com`. Password tidak ditambahkan; login manual menggunakan email verification code test Clerk. Akun hanya untuk pemeriksaan fondasi, tanpa data pengguna sebenarnya.

Form signup dengan password baru tidak diselesaikan oleh agent. Jalur akun baru diuji melalui test account Clerk dan pembentukan account internal pada request terautentikasi pertama. Pemilihan file disk oleh ekstensi browser terhalang izin file URL; upload nyata diuji memakai tombol **Gunakan file contoh**, yang membuat `File` di browser dan mengirimkannya ke endpoint upload yang sama. Tidak ada izin browser yang diubah.

## Cakupan

Fitur #02 adalah autentikasi, shell awal, infrastruktur, dan diagnostik development. Percakapan agent, ingestion produk, generation Course, dan alur belajar mengikuti tiket berikutnya. Akun uji dapat dipakai lagi untuk walkthrough manual berikutnya.

R2 dan deployment production belum diuji; MinIO adalah scope penerimaan yang disetujui pengguna. CI hanya memeriksa statis/build, sedangkan penerimaan perilaku dijalankan manual melalui browser. Repository belum di-commit atau di-push.
