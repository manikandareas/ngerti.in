# Course player dan panel chat kontekstual

Sumber: [Notion](https://app.notion.com/p/3f8abdd6187381a58ce9c8487ffe187e) · Readback: 2026-10-18T06:04:56.780944+00:00

| Property | Value |
| --- | --- |
| Ticket | 11 |
| Urutan | 1011 |
| Lingkup | Di luar V1 |
| Status | Backlog |
| Prioritas | P0 |
| Area | Belajar |
| Depends on | [Walkthrough UX: signup sampai Course pertama](01-walkthrough-ux-signup-sampai-course-pertama.md) · [Chat personal: thread dan streaming resumable](04-chat-personal-thread-dan-streaming-resumable.md) · [Generation: node pertama lalu background](09-generation-node-pertama-lalu-background.md) |

<!-- notion-content:start -->
**Lingkup: Di luar V1 · NG-011 · reset 18 Oktober 2026.** Tiket pembelajaran ini dikeluarkan dari backlog aktif V1. Status lama dipertahankan sebagai riwayat; bukan dependency fitur asisten umum.
Spesifikasi aktif: [01 · Produk & Scope V1](../../product/01-produk-dan-paket.md). Urutan/dependensi aktif: [07 · Backlog Implementasi V1](../README.md).

## Hasil

Pengguna belajar Lesson dan berbicara dengan agent tanpa kehilangan sesi.

## Acceptance criteria

- [ ] Panel chat mengetahui Course/Lesson aktif; di HP memakai drawer dan composer dengan attachment.
- [ ] Buka/tutup atau pergantian Lesson mempertahankan posisi, draft dan jawaban.
- [ ] Main chat, thread Course dan side chat tetap memakai agent yang sama dengan konteks jelas.
- [ ] Lesson yang sudah lolos pemeriksaan dapat dibaca ketika Lesson lain/Practice masih disiapkan; status membedakan readiness Lesson, Practice dan kelengkapan node dari progress/unlock. Konten terbit serta progress tetap dapat diakses, dan revisi koreksi tidak diam-diam mengganti isi yang telah dibaca.

## Spesifikasi

[02 · UX & User Flow](../../product/02-user-flow.md)

[03 · Perilaku Agent](../../product/03-agent.md)
<!-- notion-content:end -->
