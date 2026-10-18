# Ingestion materi reusable dari file dan web

Sumber: [Notion](https://app.notion.com/p/3f8abdd6187381eaa5fccda9bf6f8fb0) · Readback: 2026-10-18T06:04:56.780944+00:00

| Property | Value |
| --- | --- |
| Ticket | 6 |
| Urutan | 1006 |
| Lingkup | Di luar V1 |
| Status | Backlog |
| Prioritas | P0 |
| Area | Course |
| Depends on | [Fondasi production: workspace, auth dan data](02-fondasi-production-workspace-auth-dan-data.md) · [Kuota Course, chat dan materi per periode](05-kuota-course-chat-dan-materi-per-periode.md) |

<!-- notion-content:start -->
**Lingkup: Di luar V1 · NG-006 · reset 18 Oktober 2026.** Tiket pembelajaran ini dikeluarkan dari backlog aktif V1. Status lama dipertahankan sebagai riwayat; bukan dependency fitur asisten umum.
Spesifikasi aktif: [01 · Produk & Scope V1](../../product/01-produk-dan-paket.md). Urutan/dependensi aktif: [07 · Backlog Implementasi V1](../README.md).

## Hasil

Materi pengguna diproses durable dan dapat dipakai lintas Course.

## Acceptance criteria

- [ ] File di composer serta sumber web mempunyai status processing, ready atau gagal yang dapat dilihat.
- [ ] Batas format/ukuran/storage, OCR dan halaman ekuivalen ditetapkan; kegagalan mempertahankan input pengguna.
- [ ] Isi dan embeddings tersimpan sesuai pemilik/revisi; materi identik direuse.
- [ ] Evidence yang gagal atau belum siap tidak diam-diam dianggap konteks valid.

## Spesifikasi

[02 · UX & User Flow](../../product/02-user-flow.md)

[04 · Arsitektur, Runtime & Kontrak](../../product/04-arsitektur-dan-delivery.md)
<!-- notion-content:end -->
