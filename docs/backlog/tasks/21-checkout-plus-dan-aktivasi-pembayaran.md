# Checkout Plus dan aktivasi pembayaran

Sumber: [Notion](https://app.notion.com/p/3f8abdd6187381c18df8efee586427c7)

Status: **Backlog** · Prioritas: **P0** · Area: **Billing** · Urutan: **21**

Depends on:

- [Fondasi production: workspace, auth dan data](02-fondasi-production-workspace-auth-dan-data.md)
- [Kuota Course, chat dan materi per periode](05-kuota-course-chat-dan-materi-per-periode.md)

<!-- notion-content:start -->
## Hasil

Pengguna membayar paket Plus dan menerima entitlement hanya setelah pembayaran sah.

## Acceptance criteria

- [ ] Tentukan/aktifkan provider dan kelengkapan merchant yang sesuai transaksi rupiah; QRIS menjadi kandidat awal.
- [ ] Checkout menampilkan Rp49.000, akses 30 hari, kuota dan cara perpanjangan yang benar-benar tersedia.
- [ ] Pending/gagal tidak mengaktifkan Plus; callback sah idempotent dan dapat direkonsiliasi.
- [ ] Kebijakan upgrade, refund serta periode aktivasi dicatat dan diuji sebelum pembayaran production.

## Spesifikasi

[01 · Produk & Paket](../../product/01-produk-dan-paket.md)
<!-- notion-content:end -->
