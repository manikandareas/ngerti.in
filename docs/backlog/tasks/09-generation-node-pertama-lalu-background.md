# Generation: node pertama lalu background

Sumber: [Notion](https://app.notion.com/p/3f8abdd61873816caeb2d24a482c6511) · Readback: 2026-10-18T06:04:56.780944+00:00

| Property | Value |
| --- | --- |
| Ticket | 9 |
| Urutan | 1009 |
| Lingkup | Di luar V1 |
| Status | Backlog |
| Prioritas | P0 |
| Area | Course |
| Depends on | [Fondasi production: workspace, auth dan data](02-fondasi-production-workspace-auth-dan-data.md) · [Port standar Lesson dan soal dari prototipe](03-port-standar-lesson-dan-soal-dari-prototipe.md) · [Outline Course: perencanaan, revisi dan approval](08-outline-course-perencanaan-revisi-dan-approval.md) |

<!-- notion-content:start -->
**Lingkup: Di luar V1 · NG-009 · reset 18 Oktober 2026.** Tiket pembelajaran ini dikeluarkan dari backlog aktif V1. Status lama dipertahankan sebagai riwayat; bukan dependency fitur asisten umum.
Spesifikasi aktif: [01 · Produk & Scope V1](../../product/01-produk-dan-paket.md). Urutan/dependensi aktif: [07 · Backlog Implementasi V1](../README.md).

## Hasil

Pengguna mulai membaca Lesson pertama yang lolos pemeriksaan sambil Lesson lain dan Practice dibuat oleh pool worker paralel.

## Acceptance criteria

- [ ] Pool worker dinamis memprioritaskan writer, review dan publish Lesson pertama; kelompok Lesson independen berjalan paralel tanpa barrier seluruh Course, dengan admission global lintas worker.
- [ ] Lesson lolos checks/review pengajaran sebelum dibaca. Satu paket Practice dibuat dari versi Lesson terbit lalu lolos checks key dan review cakupan/keterjawaban sebelum dibuka. Repair terarah maksimal dua putaran mempertahankan bagian valid; koreksi Lesson terbit membuat revisi baru dan memeriksa dependency.
- [ ] Browser ditutup atau worker restart tidak kehilangan state; resume tidak menagih Course atau menggandakan node.
- [ ] Status membedakan lesson_ready, practice_ready, node_content_ready dan penyelesaian belajar/unlock; bagian gagal dapat dipulihkan tanpa menghapus konten siap. Ukuran batch/concurrency diukur dari waktu Lesson pertama yang lolos, kesiapan Practice, kualitas, repair dan biaya.

## Spesifikasi

[04 · Arsitektur, Runtime & Kontrak](../../product/04-arsitektur-dan-delivery.md)

[02 · UX & User Flow](../../product/02-user-flow.md)
<!-- notion-content:end -->
