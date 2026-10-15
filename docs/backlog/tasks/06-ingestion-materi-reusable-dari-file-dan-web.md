# Ingestion materi reusable dari file dan web

Sumber: [Notion](https://app.notion.com/p/3f8abdd6187381eaa5fccda9bf6f8fb0)

Status: **Backlog** · Prioritas: **P0** · Area: **Course** · Urutan: **6**

Depends on:

- [Fondasi production: workspace, auth dan data](02-fondasi-production-workspace-auth-dan-data.md)
- [Kuota Course, chat dan materi per periode](05-kuota-course-chat-dan-materi-per-periode.md)

<!-- notion-content:start -->
## Hasil

Materi pengguna diproses durable dan dapat dipakai lintas Course.

## Acceptance criteria

- [ ] File di composer serta sumber web mempunyai status processing, ready atau gagal yang dapat dilihat.
- [ ] Batas format/ukuran/storage, OCR dan halaman ekuivalen ditetapkan; kegagalan mempertahankan input pengguna.
- [ ] Isi dan embeddings tersimpan sesuai pemilik/revisi; materi identik direuse.
- [ ] Evidence yang gagal atau belum siap tidak diam-diam dianggap konteks valid.

## Spesifikasi

[02 · User Flow](../../product/02-user-flow.md)

[04 · Arsitektur & Delivery](../../product/04-arsitektur-dan-delivery.md)
<!-- notion-content:end -->
