# NG-022 · Paket pengguna usage expiry dan downgrade

Sumber: [Notion](https://app.notion.com/p/3f8abdd618738129b1d8faf62a637a7b) · Readback: 2026-10-18T06:04:56.780944+00:00

| Property | Value |
| --- | --- |
| Ticket | 22 |
| Urutan | 22 |
| Lingkup | Aktif V1 |
| Status | Backlog |
| Prioritas | P0 |
| Area | Billing |
| Depends on | [NG-021 · Checkout dan aktivasi pembayaran V1](21-checkout-plus-dan-aktivasi-pembayaran.md) · [NG-040 · Usage komputasi dan kontrak paket V1](40-usage-komputasi-dan-kontrak-paket-v1.md) |

<!-- notion-content:start -->
Tujuan: Paket pengguna usage expiry dan downgrade.
Lingkup: **Aktif V1**. Identitas NG-022; Urutan delivery 22.

## Acceptance criteria

- [ ] Entitlement terikat pembayaran terverifikasi; renewal/expiry/downgrade/refund memakai policy snapshot yang dapat diaudit.
- [ ] UI menampilkan pemakaian, reservasi, reset, expiry dan dampak downgrade pada task/schedule yang sudah diterima.
- [ ] Kontrol stop, approvals, hasil tersimpan, memory dan pause schedule tetap dapat diakses saat allowance habis.

## Spesifikasi dan bukti

[05 · Usage, Paket & Pembayaran](../../product/05-usage-paket-pembayaran.md) · [REA-5 · Permissions](../../research/muse-ai-v1/evidence/permissions.md)

## Dependencies

[NG-021 · Checkout dan aktivasi pembayaran V1](21-checkout-plus-dan-aktivasi-pembayaran.md) · [NG-040 · Usage komputasi dan kontrak paket V1](40-usage-komputasi-dan-kontrak-paket-v1.md)

## Bukti penerimaan

[NG-030 · Bukti penerimaan baseline V1](../../engineering/baseline-v1-acceptance.md). Bukti repo: docs/engineering/evidence/baseline-v1/. Status mengikuti hasil pemeriksaan baru; tidak mengandalkan penerimaan #01–05.
<!-- notion-content:end -->
