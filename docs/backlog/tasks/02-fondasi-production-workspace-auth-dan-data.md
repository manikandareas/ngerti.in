# Fondasi production: workspace, auth dan data

Sumber: [Notion](https://app.notion.com/p/3f8abdd61873817d9529f43e39a5979f)

Status: **Done** · Prioritas: **P0** · Area: **Fondasi** · Urutan: **2**

Depends on: —

<!-- notion-content:start -->
## Hasil
Web, API dan worker dapat dijalankan pada fondasi production yang sama.
## Acceptance criteria
- [x] Struktur monorepo dan konfigurasi environment ditetapkan; web/API/worker dapat dijalankan lokal.
- [x] Clerk membentuk akun baru; operasi aplikasi dan job mengambil pemilik dari auth server.
- [x] PostgreSQL, pgvector, Procrastinate, storage S3 lokal melalui MinIO dan migrasi memiliki jalur startup yang dapat diverifikasi. Verifikasi R2 ditunda sesuai keputusan pengguna.
- [x] Health/readiness membedakan API, DB, worker dan storage yang siap atau gagal melalui pemeriksaan manual di browser; CI menjalankan lint, typecheck dan build sesuai keputusan pengguna.
## Implementasi dan penerimaan
Selesai pada **15 Oktober 2026**. TanStack Start/React, FastAPI/SQLModel/Alembic, Clerk, PostgreSQL 16/pgvector, LangGraph dan Procrastinate sudah terpasang dengan lockfile. PostgreSQL dan MinIO berjalan di Docker; web/API/worker berjalan di mesin. Shell awal mengikuti Soft Matcha dari walkthrough #01.
- Startup pada database kosong dan pengulangan setup berhasil, termasuk schema queue, checkpoint dan bucket lokal.
- Dua test account Clerk berhasil login melalui browser dan membentuk account internal yang berbeda. Owner operasi dan job ditentukan server. Akun B mendapat 404 ketika meminta ID pekerjaan akun A.
- Job #13 tetap selesai setelah tab pembuatnya ditutup. Artifact tersimpan di MinIO dan berhasil diunduh melalui signed URL.
- Worker job #26 dimatikan paksa setelah checkpoint persiapan, lalu direstart. Run yang sama selesai pada percobaan kedua; nilai prepared_at sebelum dan sesudah recovery sama, dan hanya satu artifact tersimpan.
- Upload file contoh 71 B ke MinIO berhasil; file tersebut sudah dihapus melalui UI atas persetujuan pengguna.
- Gangguan API, PostgreSQL dan MinIO terlihat pada diagnostik. Data dan object bertahan setelah restart container. Desktop, mobile 390 × 844, serta dark mode diperiksa.
- Biome, TypeScript, Ruff, mypy, build web dan package Python lulus secara lokal. Workflow GitHub Actions tersedia; eksekusi CI remote belum dilakukan karena belum ada push.
Dokumentasi lokal: `docs/engineering/development.md` untuk startup/operasi dan `docs/engineering/foundation-02-manual-acceptance.md` untuk bukti serta batas pemeriksaan.
## Batas penerimaan
MinIO dipakai lebih dahulu sesuai arahan pengguna; kompatibilitas R2 disiapkan melalui konfigurasi S3, tetapi belum diuji terhadap R2. Pengujian perilaku dilakukan manual melalui browser, tanpa suite unit/integration/E2E otomatis. Test account dibuat melalui Clerk Backend API lalu login melalui UI; signup dengan password baru tidak diselesaikan oleh agent. Upload memakai File contoh yang dibuat browser karena file chooser ekstensi terhalang izin file URL. Deployment production mengikuti tiket peluncuran; fitur Course dan agent mengikuti backlog berikutnya.
## Spesifikasi
[04 · Arsitektur & Delivery](../../product/04-arsitektur-dan-delivery.md)
<!-- notion-content:end -->
