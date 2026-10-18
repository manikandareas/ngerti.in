# NG-028 · Sederhanakan kuota menjadi fondasi umum

Sumber: [Notion](https://app.notion.com/p/3fdabdd618738129aaddc538dc6ea258) · Readback: 2026-10-18T06:04:56.780944+00:00

| Property | Value |
| --- | --- |
| Ticket | 28 |
| Urutan | 3 |
| Lingkup | Aktif V1 |
| Status | Done |
| Prioritas | P0 |
| Area | Billing |
| Depends on | [NG-027 · Bersihkan UI dan persona awal](27-bersihkan-ui-dan-persona-awal.md) |

<!-- notion-content:start -->
Tujuan: Sederhanakan kuota menjadi fondasi umum.
Lingkup: **Aktif V1**. Identitas NG-028; Urutan delivery 3.

## Acceptance criteria

- [x] Meter dan kontrak reservasi Course/halaman materi dihapus; GET /quotas serta tipe UI hanya mengembalikan chat.
- [x] Ledger reserve/commit/release/reverse, fencing, ownership, periode dan enforcement chat tetap berfungsi.
- [x] Probe ledger memakai skenario umum/chat dan database sementara; batas chat development 100/300 per 30 hari dipertahankan tanpa harga komersial.

## Spesifikasi dan bukti

[05 · Usage, Paket & Pembayaran](../../product/05-usage-paket-pembayaran.md) · [REA-5 · Permissions](../../research/muse-ai-v1/evidence/permissions.md)

## Dependencies

[NG-027 · Bersihkan UI dan persona awal](27-bersihkan-ui-dan-persona-awal.md)

## Bukti penerimaan

[NG-030 · Bukti penerimaan baseline V1](../../engineering/baseline-v1-acceptance.md). Bukti repo: docs/engineering/evidence/baseline-v1/. Status mengikuti hasil pemeriksaan baru; tidak mengandalkan penerimaan #01–05.
<!-- notion-content:end -->
