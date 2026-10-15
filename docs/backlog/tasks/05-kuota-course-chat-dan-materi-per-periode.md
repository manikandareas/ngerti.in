# Kuota Course, chat dan materi per periode

Sumber: [Notion](https://app.notion.com/p/3f8abdd61873813a8393edbb6c77cb6b)

Status: **Backlog** · Prioritas: **P0** · Area: **Billing** · Urutan: **5**

Depends on:

- [Fondasi production: workspace, auth dan data](02-fondasi-production-workspace-auth-dan-data.md)

<!-- notion-content:start -->
## Hasil

Paket Free/Plus diterapkan dengan ledger yang konsisten.

## Acceptance criteria

- [ ] Free 1 Course/100 chat/100 halaman dan Plus 5 Course/300 chat/200 halaman mengikuti periode 30 hari; normalisasi halaman lintas format ditetapkan.
- [ ] Tentukan anchor periode, reservasi/commit slot, pergantian periode dan pembatalan sebelum implementasi ledger.
- [ ] Request bersamaan dan retry tidak melewati kuota atau menghitung satu Course dua kali.
- [ ] Seluruh outline dan pengayaan tujuan yang sama memakai satu slot; kuota pembuatan habis tetap mengizinkan belajar konten tersedia.

## Spesifikasi

[01 · Produk & Paket](../../product/01-produk-dan-paket.md)
<!-- notion-content:end -->
