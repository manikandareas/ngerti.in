# NG-022 · Paket pengguna usage expiry dan downgrade

Sumber: [Notion](https://app.notion.com/p/3f8abdd618738129b1d8faf62a637a7b) · Readback: 2026-10-19T13:28:12.210Z

| Property | Value |
| --- | --- |
| Ticket | 22 |
| Urutan | 22 |
| Lingkup | Aktif V1 |
| Status | Done |
| Prioritas | P0 |
| Area | Billing |
| Depends on | [NG-021 · Checkout dan aktivasi pembayaran V1](21-checkout-plus-dan-aktivasi-pembayaran.md) · [NG-040 · Usage komputasi dan kontrak paket V1](40-usage-komputasi-dan-kontrak-paket-v1.md) |

<!-- notion-content:start -->
Tujuan: Paket pengguna usage expiry dan downgrade.

Lingkup: **Aktif V1**. Identitas NG-022; Urutan delivery 22.

## Acceptance criteria

- [x] Entitlement terikat pembayaran terverifikasi; renewal/expiry/downgrade/refund memakai policy snapshot yang dapat diaudit.
- [x] UI menampilkan pemakaian, reservasi, reset, expiry dan dampak downgrade pada task/schedule yang sudah diterima.
- [x] Kontrol stop, approvals, hasil tersimpan, memory dan pause schedule tetap dapat diakses saat allowance habis.

## Spesifikasi dan bukti

[05 · Usage, Paket & Pembayaran](../../product/05-usage-paket-pembayaran.md) · [REA-5 · Permissions](../../research/muse-ai-v1/evidence/permissions.md)

## Dependencies

[NG-021 · Checkout dan aktivasi pembayaran V1](21-checkout-plus-dan-aktivasi-pembayaran.md) · [NG-040 · Usage komputasi dan kontrak paket V1](40-usage-komputasi-dan-kontrak-paket-v1.md)

## Bukti penerimaan

[NG-030 · Bukti penerimaan baseline V1](../../engineering/baseline-v1-acceptance.md). Bukti repo: docs/engineering/evidence/baseline-v1/. Status mengikuti hasil pemeriksaan baru; tidak mengandalkan penerimaan #01–05.

## Implementasi dan penerimaan NG-022

Diterima development pada 19 Oktober 2026. Migration additive `0015_subscription_lifecycle` menyimpan policy `subscription-lifecycle-v1` per order, refund receipt, kebutuhan review terpisah dari status subscription, dan pencabutan grant melalui `revoked_at`. Renewal terverifikasi memberi satu grant cycle asal. Tanpa pembayaran terverifikasi tidak ada allowance Plus baru; setelah paid-through akun kembali ke Free 100 pesan/1.000 kredit per 30 × 24 jam.

Refund penuh mencabut sisa hak receipt terkait tanpa menghapus receipt, pemakaian, budget pekerjaan lama atau biaya provider. Refund sebagian masuk review dengan mempertahankan hak yang sudah diterbitkan; invoice yang sudah refunded sebelum initial activation tidak mendapat grant. Replay/stale paid tidak memulihkan grant. Refund historis tidak mencabut renewal lain. Konfirmasi cancellation tetap dapat dilakukan selama partial review.

Task yang sudah diterima memakai snapshot/budget asal. Setiap eksekusi Jadwal memeriksa allowance terbaru; kuota habis menjadi blocked_budget dengan alasan dan tanpa Task parsial. UI Usage menampilkan paket efektif, pemakaian/reservasi, reset/expiry, dampak downgrade dan refund history. Stop, approval, download/hasil, memory dan pause Jadwal tetap tersedia saat nol. Pembaruan metode pembayaran memakai signed URL provider yang diambil saat diminta, owner-scoped dan host HTTPS tervalidasi; URL tidak disimpan.

Bukti: 49 kontrak lifecycle, regresi billing69/quota46/usage48/Task55/scheduler82, make check/build lulus. Lemon Squeezy test nyata memverifikasi signed payment URL dan full refund invoice dummy NG-021; chat/compute kembali Free dan replay mempertahankan satu grant historis. Browser desktop1440/mobile390/320 tanpa overflow; Plus/past_due/refund/stale memakai fixture respons UI tanpa mutasi provider. Rincian repo: `docs/engineering/billing-22-acceptance.md`, `docs/engineering/billing-runtime.md`, `docs/engineering/evidence/billing-22/`.

Batas: tidak memakai uang/kartu nyata; renewal/expiry/partial refund/crash diuji terkontrol, tidak menunggu 30 hari provider. Refund nyata dibuktikan lewat API/reconciliation, bukan klaim webhook refund nyata. Partial refund belum diprorata otomatis dan memerlukan tindak lanjut operasional. Tidak mengklaim penerimaan production/benchmark NG-041. NG-023 menjadi pekerjaan berikutnya; status tiket lain dipertahankan.
<!-- notion-content:end -->
