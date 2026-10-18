# Pencarian sumber dan pemilihan melalui HITL

Sumber: [Notion](https://app.notion.com/p/3f8abdd618738189a4f2d771500ea426) · Readback: 2026-10-18T06:04:56.780944+00:00

| Property | Value |
| --- | --- |
| Ticket | 7 |
| Urutan | 1007 |
| Lingkup | Di luar V1 |
| Status | Backlog |
| Prioritas | P0 |
| Area | Course |
| Depends on | [Chat personal: thread dan streaming resumable](04-chat-personal-thread-dan-streaming-resumable.md) · [Ingestion materi reusable dari file dan web](06-ingestion-materi-reusable-dari-file-dan-web.md) |

<!-- notion-content:start -->
**Lingkup: Di luar V1 · NG-007 · reset 18 Oktober 2026.** Tiket pembelajaran ini dikeluarkan dari backlog aktif V1. Status lama dipertahankan sebagai riwayat; bukan dependency fitur asisten umum.
Spesifikasi aktif: [01 · Produk & Scope V1](../../product/01-produk-dan-paket.md). Urutan/dependensi aktif: [07 · Backlog Implementasi V1](../README.md).

## Hasil

Agent otomatis mencari konteks dan pengguna memilih sumber yang digunakan.

## Acceptance criteria

- [ ] Topik/prompt/file dapat memicu pencarian materi pengguna dan sumber internet yang relevan.
- [ ] Hasil menampilkan kandidat dengan identitas/sumber yang dapat diperiksa; pengguna memilih satu atau beberapa.
- [ ] Approval sumber tersimpan dan aman terhadap retry; hanya pilihan valid menjadi konteks Course.
- [ ] Sumber tidak memadai meminta tambahan konteks sambil mempertahankan percakapan dan attachment.

## Spesifikasi

[02 · UX & User Flow](../../product/02-user-flow.md)
<!-- notion-content:end -->
