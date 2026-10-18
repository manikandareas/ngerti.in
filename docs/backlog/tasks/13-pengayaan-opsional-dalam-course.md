# Pengayaan opsional dalam Course

Sumber: [Notion](https://app.notion.com/p/3f8abdd61873818d968deb21560778ae) · Readback: 2026-10-18T06:04:56.780944+00:00

| Property | Value |
| --- | --- |
| Ticket | 13 |
| Urutan | 1013 |
| Lingkup | Di luar V1 |
| Status | Backlog |
| Prioritas | P0 |
| Area | Belajar |
| Depends on | [Generation: node pertama lalu background](09-generation-node-pertama-lalu-background.md) · [Practice: review jawaban salah dan unlock](12-practice-review-jawaban-salah-dan-unlock.md) |

<!-- notion-content:start -->
**Lingkup: Di luar V1 · NG-013 · reset 18 Oktober 2026.** Tiket pembelajaran ini dikeluarkan dari backlog aktif V1. Status lama dipertahankan sebagai riwayat; bukan dependency fitur asisten umum.
Spesifikasi aktif: [01 · Produk & Scope V1](../../product/01-produk-dan-paket.md). Urutan/dependensi aktif: [07 · Backlog Implementasi V1](../README.md).

## Hasil

Pengayaan ditawarkan melalui screen tersendiri setelah Practice selesai, dengan CTA utama yang menonjol dan opsi lewati.

## Acceptance criteria

- [ ] Hasil akhir Practice dapat menghasilkan tawaran pengayaan dengan alasan dan konsep yang perlu diperkuat.
- [ ] Jika direkomendasikan, screen pengayaan menjadi step dalam rangkaian completion setelah seluruh soal dan putaran ulang jawaban salah selesai; pola presentasi mengikuti screen streak/flashcard.
- [ ] Tombol utama **Buat pengayaan** ter-highlight; klik menjadi approval dan memulai pembuatan node opsional tanpa slot Course baru.
- [ ] Action sekunder **Lewati** terlihat jelas dan melanjutkan Course tanpa membuat pengayaan; node inti berikutnya tetap terbuka.
- [ ] Pengayaan tidak mengubah denominator progress inti; Course tetap dapat mencapai selesai tanpa pengayaan.
- [ ] Aktivitas mengikuti standar konten dan biaya pengayaan dicatat pada Course terkait.

## Spesifikasi

[02 · UX & User Flow](../../product/02-user-flow.md)

[01 · Produk & Scope V1](../../product/01-produk-dan-paket.md)
<!-- notion-content:end -->
