# NG-021 · Checkout dan aktivasi pembayaran V1

Sumber: [Notion](https://app.notion.com/p/3f8abdd6187381c18df8efee586427c7) · Readback: 2026-10-19T13:01:04.050Z

| Property | Value |
| --- | --- |
| Ticket | 21 |
| Urutan | 21 |
| Lingkup | Aktif V1 |
| Status | Done |
| Prioritas | P0 |
| Area | Billing |
| Depends on | [NG-040 · Usage komputasi dan kontrak paket V1](40-usage-komputasi-dan-kontrak-paket-v1.md) |

<!-- notion-content:start -->
Tujuan: Checkout dan aktivasi pembayaran V1.

Lingkup: **Aktif V1**. Identitas NG-021; Urutan delivery 21.

## Acceptance criteria

- [x] Gateway dan harga dipilih serta diverifikasi pada implementasi; tidak otomatis membeli/berlangganan saat cleanup.
- [x] Checkout callback diverifikasi server, event idempotent, reconciliation dapat memulihkan callback hilang.
- [x] Amount/currency/product/owner cocok; replay/forged callback ditolak; agent tidak mempunyai tool setter plan/grant.

## Spesifikasi dan bukti

[05 · Usage, Paket & Pembayaran](../../product/05-usage-paket-pembayaran.md) · [REA-5 · Permissions](../../research/muse-ai-v1/evidence/permissions.md)

## Dependencies

[NG-040 · Usage komputasi dan kontrak paket V1](40-usage-komputasi-dan-kontrak-paket-v1.md)

## Bukti penerimaan

[NG-030 · Bukti penerimaan baseline V1](../../engineering/baseline-v1-acceptance.md). Bukti repo: docs/engineering/evidence/baseline-v1/. Status mengikuti hasil pemeriksaan baru; tidak mengandalkan penerimaan #01–05.

## Implementasi dan hasil verifikasi

Scope akhir disetujui pengguna: subscription auto-renew 30 hari dengan Lemon Squeezy sebagai satu-satunya checkout aktif, store IDR Rp270.750 sebelum pajak (ekuivalen USD15), allowance 300 pesan/5.000 kredit. Berlaku untuk checkout saat ini tanpa pilihan gateway/wilayah. Duitku ditunda sambil menunggu provider; adapter dan kredensial tetap tersimpan. Harga/allowance disnapshot; pembatalan mempertahankan periode yang telah dibayar.

Kode development mencakup dua adapter, katalog server, checkout idempotent, durable webhook inbox, API verification amount/currency/product/owner/mode, receipt/grant atomik, snapshot chat/compute, account lock, lease fencing, worker recovery, status/riwayat pembayaran dan konfirmasi cancellation di Usage. Migration additive; tidak mereset data lama dan tidak menyediakan tool setter plan/grant untuk agent.

Bukti lokal: 69 kontrak billing lulus, 46 regresi kuota chat dan 48 usage lulus; static/type/build checks lulus. UI browser memverifikasi harga final, consent auto-renew dan reset consent ketika gateway berubah. Rincian/bukti repo: `docs/engineering/billing-21-acceptance.md`, `docs/engineering/billing-runtime.md`, `docs/engineering/evidence/billing-21/`. Penonaktifan Duitku diuji pada katalog dan POST checkout, riwayat tetap terbaca, dan API usage tidak mengiklankan harga acuan lama. UI final desktop/mobile390px hanya menampilkan Lemon Squeezy; consent tetap wajib.

Lemon Squeezy test mode nyata: produk1452609/variant2267301, interval day/30, harga27.075.000 cents IDR, webhook melalui Cloudflare Tunnel. Checkout kartu dummy berhasil; subscription2619903 dan invoice8764883 memberi tepat satu grant (chat300/compute5000). Enam event diproses durable; replay tidak menggandakan grant. Pembatalan dikonfirmasi provider dan paid-through dipertahankan. Tidak menggunakan kartu atau uang nyata.

Duitku ditunda atas keputusan pengguna: DUITKU_ENABLED=false, LEMONSQUEEZY_ENABLED=true. Backend tidak mengiklankan Duitku dan menolak checkout baru sebelum efek provider; order/receipt/recovery lama tetap tersedia. Kredensial proyek sandbox DS36799 valid dan channel VC terdaftar, tetapi inquiry subscription sebelumnya ditolak HTTP404 `Subscription is not available`. Permintaan aktivasi telah dikirim melalui live chat dengan persetujuan pengguna dan ditangani spesialis integrasi. Aktivasi dan end-to-end Duitku belum diklaim; keduanya memerlukan penerimaan terpisah sebelum checkout diaktifkan lagi.

## Penerimaan scope akhir dan tindak lanjut

NG-021 diterima development dengan scope akhir Lemon Squeezy saja. Pembayaran test nyata, signed webhook, aktivasi satu grant chat/compute, cancellation dan signed replay telah terverifikasi; 69 kontrak lokal serta static/type/build checks lulus. Penundaan Duitku tidak menghalangi penyelesaian scope ini. Renewal provider nyata belum ditunggu 30 hari; kontrak renewal diuji secara terkontrol. Lifecycle lengkap NG-022 dan konfigurasi live tetap diperlukan sebelum release production. Bukti repo `docs/engineering/billing-21-acceptance.md`, `docs/engineering/evidence/billing-21/desktop-lemon-only.png` dan `mobile-lemon-only.png`.

Reconciliation memulihkan receipt/status untuk subscription yang sudah terikat. Initial callback yang hilang dipulihkan dengan resend webhook asli bertanda tangan dari dashboard dan CLI operator `python -m ngertiin.billing.recovery retry --order-id ORDER_UUID`; tidak mencocokkan email atau menebak subscription ID. CLI inspection read-only, requeue exhausted inbox, validasi binding/environment dan konflik subscription lintas owner diuji. Replay event subscription_created asli Lemon Squeezy melalui dashboard menghasilkan HTTP200 SUCCESS; readback tetap cancelled dengan satu receipt/satu grant dan paid-through yang sama. Kehilangan awal dan exhausted retry dibuktikan melalui kontrak terkontrol. Penerimaan callback provider Duitku tetap menunggu aktivasi Subscription. Grace/refund/reversal/downgrade lengkap tetap [NG-022 · Paket pengguna usage expiry dan downgrade](22-paket-pengguna-usage-expiry-dan-downgrade.md) sebelum release subscription production.
<!-- notion-content:end -->
