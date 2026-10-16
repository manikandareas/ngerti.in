# 05 · Backlog

Sumber: [Notion](https://app.notion.com/p/f1b4f3a60ca341dfac73288b51726162) · Snapshot: 2026-10-13 11:37:14 UTC

Pada **15 Oktober 2026**, tiket #01 dan #02 sudah **Done**. Fondasi #02 diterima menggunakan MinIO lokal dan pengujian manual melalui browser sesuai keputusan pengguna; [bukti penerimaan](../engineering/foundation-02-manual-acceptance.md) tersedia. Status dibaca kembali dari Notion dan diselaraskan pada tiket serta view lokal.

## Views

- [Semua](views/semua.md) — 25 tiket.
- [Kanban](views/kanban.md) — 25 tiket.
- [Siap dikerjakan](views/siap-dikerjakan.md) — 0 tiket.
- [Board tanpa nama](views/board-tanpa-nama.md) — 25 tiket.

## Properties

| Nama | Tipe | Pilihan / target |
| --- | --- | --- |
| Area | select | Fondasi, Course, Belajar, Agent, Billing, Release |
| Depends on | relation | Tiket pada backlog yang sama |
| Prioritas | select | P0, P1 |
| Status | select | Backlog, Ready, In Progress, Review, Done, Blocked |
| Tugas | title | — |
| Urutan | number | — |

Setiap tiket memiliki salinan isi lengkap pada `tasks/`, termasuk acceptance criteria dan references ke spesifikasi. Konfigurasi native view serta identitas relation tersimpan di [manifest](../notion-manifest.json).

Tiket #003 sudah **Done** pada 15 Oktober 2026. [Bukti penerimaan standar konten](../engineering/content-03-manual-acceptance.md) mencatat fixture, schema dan probe provider. View Siap dikerjakan saat ini kosong; status #005 tetap Backlog.

Tiket #004 sudah **Done** pada **16 Oktober 2026**. Penerimaan chat dan cleanup React tercatat pada [implementasi #04](../engineering/chat-04-implementation.md) serta [bukti cleanup](../engineering/react-cleanup-2026-10-16.md). Status dan isi Notion sudah dibaca kembali; kartu dipindahkan ke Done pada snapshot kanban lokal.
