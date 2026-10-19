# NG-039 · Library pencarian dan penemuan kemampuan

Sumber: [Notion](https://app.notion.com/p/3fdabdd618738192b8f8f919dedbb367) · Readback: 2026-10-19T10:22:42.085Z

| Property | Value |
| --- | --- |
| Ticket | 39 |
| Urutan | 19 |
| Lingkup | Aktif V1 |
| Status | Done |
| Prioritas | P0 |
| Area | Agent |
| Depends on | [NG-020 · Delivery proaktif per thread dan batas global](20-delivery-proaktif-per-thread-dan-batas-global.md) · [NG-034 · File produk dan hasil tersimpan](34-file-produk-dan-hasil-tersimpan.md) |

<!-- notion-content:start -->
Tujuan: Library pencarian dan penemuan kemampuan.
Lingkup: **Aktif V1**. Identitas NG-039; Urutan delivery 19.
## Acceptance criteria
- [x] Pengguna menemukan thread, task, file, hasil, goals dan schedules sesuai ownership.
- [x] Pencarian menjelaskan loading/empty/error dan membuka resource/revision yang benar; deletion dan revoke segera dihormati.
- [x] Capability discovery hanya menawarkan tools/grants yang benar-benar aktif; tidak mengklaim connector atau fitur belum dibangun.
## Spesifikasi dan bukti
[02 · UX & User Flow](../../product/02-user-flow.md) · [REA-3 · File & Artifact](../../research/muse-ai-v1/evidence/file.md)
## Dependencies
[NG-020 · Delivery proaktif per thread dan batas global](20-delivery-proaktif-per-thread-dan-batas-global.md) · [NG-034 · File produk dan hasil tersimpan](34-file-produk-dan-hasil-tersimpan.md)
## Bukti penerimaan
**Diterima development pada 19 Oktober 2026.** Final plan disetujui pengguna: chat menjadi pintu utama, artifact sebagai hasil persisten, Library pendamping, dan **konektor tidak masuk V1**.
`search_resources` dan `read_resource` menggunakan layanan owner-scoped yang sama dengan UI. Pilihan exact bertahan setelah reload; chat run menangkap snapshot; revisi hasil lintas thread memakai result ID/revision dan menolak stale update. Library menggantikan File & hasil; Cari meliputi enam jenis. Discovery memakai inventory backend; contoh menambah draft tanpa auto-send.
`make library-inspect` lulus **65 kontrak**; regresi file **47**, Task **55**, kuota **46**. `make check`, `make build`, `make docs-check` dan diff-check lulus. Walkthrough model nyata: laporan Januari 100/Februari 120 dari Chat A ditemukan di Chat B, dibaca lalu direvisi dengan Maret 150; hasil menjadi v2, v1 tetap tersedia. Desktop 1672×822 dan mobile viewport 390×844, reload, pilihan revision, empty state, error/retry dan draft diverifikasi.
Bukti repo: `docs/engineering/library-39-acceptance.md`, `docs/engineering/evidence/library-39/`. Result `c532d027-2bc7-5c04-a88b-8e9dc09ad0f0`; Chat A `22996ffb-7a7a-58d7-9dbb-c66b539fa4fe`, Chat B `f53629fc-6b06-5140-b6e2-6d61973f6d99`. Environment Python 3.13.12, PostgreSQL 16.15, LangChain 1.4.6, LangGraph 1.2.15, model gpt-6-luna.
Empat chat run audit mencatat 38.274 token; dua Task memakai 2.391 usage units terpisah. Backfill 21 file tanpa model/OCR tambahan. Pencarian teks, konten terindeks maksimal 120.000 karakter/file, pembacaan agent 12.000 byte; invoice, semantic search, korpus besar, produksi, perangkat fisik, konektor, editor kompleks dan sharing publik tidak diklaim.
<!-- notion-content:end -->
