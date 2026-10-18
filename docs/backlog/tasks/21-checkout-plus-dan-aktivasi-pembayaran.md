# NG-021 · Checkout dan aktivasi pembayaran V1

Sumber: [Notion](https://app.notion.com/p/3f8abdd6187381c18df8efee586427c7) · Readback: 2026-10-18T06:04:56.780944+00:00

| Property | Value |
| --- | --- |
| Ticket | 21 |
| Urutan | 21 |
| Lingkup | Aktif V1 |
| Status | Backlog |
| Prioritas | P0 |
| Area | Billing |
| Depends on | [NG-040 · Usage komputasi dan kontrak paket V1](40-usage-komputasi-dan-kontrak-paket-v1.md) |

<!-- notion-content:start -->
Tujuan: Checkout dan aktivasi pembayaran V1.
Lingkup: **Aktif V1**. Identitas NG-021; Urutan delivery 21.

## Acceptance criteria

- [ ] Gateway dan harga dipilih serta diverifikasi pada implementasi; tidak otomatis membeli/berlangganan saat cleanup.
- [ ] Checkout callback diverifikasi server, event idempotent, reconciliation dapat memulihkan callback hilang.
- [ ] Amount/currency/product/owner cocok; replay/forged callback ditolak; agent tidak mempunyai tool setter plan/grant.

## Spesifikasi dan bukti

[05 · Usage, Paket & Pembayaran](../../product/05-usage-paket-pembayaran.md) · [REA-5 · Permissions](../../research/muse-ai-v1/evidence/permissions.md)

## Dependencies

[NG-040 · Usage komputasi dan kontrak paket V1](40-usage-komputasi-dan-kontrak-paket-v1.md)

## Bukti penerimaan

[NG-030 · Bukti penerimaan baseline V1](../../engineering/baseline-v1-acceptance.md). Bukti repo: docs/engineering/evidence/baseline-v1/. Status mengikuti hasil pemeriksaan baru; tidak mengandalkan penerimaan #01–05.
<!-- notion-content:end -->
