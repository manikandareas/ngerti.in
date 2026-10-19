# Subscription billing NG-021

Plus memakai subscription dengan auto-renew setiap 30 hari. **Checkout aktif saat ini hanya Lemon Squeezy**, dengan harga Rp270.750 sebelum pajak, ekuivalen USD15 pada snapshot BI JISDOR Rp18.050/USD tanggal 19 Oktober 2026. Store tetap IDR atas keputusan pengguna. Harga tersimpan per order dan tidak dihitung ulang dengan kurs baru pada setiap renewal. Allowance adalah 300 pesan dan 5.000 kredit komputasi per periode yang dibayar. Adapter/kontrak Duitku Indonesia Rp149.000 dipertahankan tetapi checkout-nya dinonaktifkan sambil menunggu aktivasi provider.

Lemon Squeezy memproses pembayaran dalam USD meskipun checkout memakai IDR. API price menyimpan 27.075.000 cents IDR untuk harga Rp270.750, sedangkan Duitku memakai 149.000 rupiah integer. `unit_divisor` pada kontrak/API mencegah salah tampilan 100 kali lipat. Contoh sandbox: invoice mencatat Rp270.694,32 dan USD15,01 setelah konversi provider; harga item tetap Rp270.750. Pemeriksaan pembulatan hanya menerima selisih yang dijelaskan oleh kurs invoice dan pembulatan maksimum setengah US cent, dengan harga/variant/quantity tetap diverifikasi. Bukan toleransi diskon persentase.

## Modul dan state

`apps/backend/src/ngertiin/billing/` memisahkan API, kontrak, penyimpanan, orkestrasi, inbox webhook, worker, serta adapter Duitku/Lemon Squeezy. Migration `0014_subscription_billing` bersifat additive; tidak mereset data lama.

- `billing_orders`: owner, request key, snapshot produk/harga/allowance, identitas checkout/subscription, persetujuan auto-renew, tanggal bayar sampai, permintaan pembatalan, serta lease.
- `billing_events`: inbox durable setelah signature benar. Hanya metadata pengaitan minimal disimpan; tidak menyimpan nomor kartu, CVC, password, atau raw payload berisi PII.
- `billing_payments`: receipt per invoice/cycle, nominal aktual, currency, periode, bukti pembulatan, dan hubungan grant. Unique identity provider/mode/receipt mencegah double grant.
- `billing_audit`: permintaan checkout/cancel, observasi provider, grant, outcome belum diketahui, dan kebutuhan rekonsiliasi.

Status order: `creating`, `pending`, `unknown`, `active`, `past_due`, `cancel_pending`, `cancelled`, `expired`, `failed`, `review`. Status aktif provider tidak otomatis berarti allowance sudah diberikan: receipt pembayaran sukses harus diperiksa terlebih dahulu. Tidak ada setter plan/grant yang diekspos ke agent.

## Alur dan concurrency

Checkout memverifikasi login, input, availability gateway dan persetujuan; lock account kemudian membuat order serta snapshot. Satu pembelian/subscription yang masih terbuka memblokir pembuatan jalur gateway kedua. Replay request key mengembalikan order yang sama. Kontak billing hanya dipakai untuk checkout; owner selalu berasal dari sesi server.

Semua network call di luar transaksi database. Lease 180 detik memagari observasi, lalu account lock dan lease token diperiksa kembali sebelum mutasi. Pencatatan receipt, grant, snapshot chat/compute, pemotongan akhir periode Free dan audit berada dalam transaksi yang sama. Crash membatalkan semuanya atau mempertahankan semuanya; replay tidak menambah periode. Pekerjaan lama tetap memakai periode dan budget asal.

Order creation yang timeout tidak didispatch ulang otomatis karena provider mungkin telah membuat checkout. Order tetap `unknown` sampai ada bukti atau pemeriksaan operasional. Pembayaran/subscription kedua pada checkout yang sama ditandai untuk pemeriksaan, bukan diberi grant tambahan.

## Webhook dan recovery

Endpoint publik hanya `POST /billing/webhooks/duitku` dan `POST /billing/webhooks/lemonsqueezy`; body maksimal 64 KiB. Signature diperiksa sebelum inbox disimpan dan HTTP200 dikembalikan. Worker `billing.reconcile` berjalan setiap menit; polling pengguna tidak melewati backoff provider.

Lemon Squeezy memakai HMAC-SHA256 raw body. Pengaitan awal memakai order UUID dan token checkout pada custom data dari webhook bertanda tangan; email bukan bukti ownership. Backend membaca subscription, price, dan invoice melalui API. Store/variant/quantity/interval 30 hari/mode/currency/nominal/tax diperiksa. Grant hanya berasal dari invoice paid, tidak refunded, tanpa discount atau proration. Periode renewal ditambatkan ke invoice initial agar replay/timing tidak menciptakan overlap.

Duitku Subscription v1 mendokumentasikan MD5 untuk inquiry/callback, SHA256 header untuk detail/update/status-notification, sedangkan API umum transaction status mendokumentasikan HMAC-SHA256. `DUITKU_SIGNATURE_ALGORITHM` memilih kontrak inquiry/callback secara eksplisit; default `md5` mengikuti dokumentasi Subscription v1 dan harus dibuktikan di sandbox merchant sebelum production. Detail subscription harus cocok dengan marker order/token, amount dan interval. Grant berasal dari `lastRunStatus=0` dengan receipt cycle; bukan `resultCode` callback atau notifikasi aktif saja.

Jika subscription ID sudah dikenal, worker merekonsiliasi status/receipt lewat API. Jika webhook initial hilang sebelum pengaitan tersimpan, kirim ulang webhook asli bertanda tangan melalui dashboard gateway. Jangan memberi Plus berdasarkan email, screenshot pembayaran atau redirect URL. Inbox gagal dicoba maksimal 100 kali lalu memerlukan pemeriksaan/requeue operasional. Recovery tidak melakukan charge baru.

### Pemulihan oleh operator

Jalankan dari host backend yang memiliki `.env` dan akses database. `inspect` hanya membaca status, receipt/grant counts dan event tertunda tanpa network call. Output tidak memuat kontak, binding token, URL checkout atau secret. Gunakan mode test/live yang sama dengan order.

```sh
uv run --project apps/backend python -m ngertiin.billing.recovery inspect --order-id ORDER_UUID
uv run --project apps/backend python -m ngertiin.billing.recovery retry --order-id ORDER_UUID
```

`retry` mencatat audit, membuka kembali maksimal 100 event inbox terverifikasi yang belum selesai (termasuk yang habis percobaan), memprosesnya melalui validasi binding yang sama, kemudian membaca ulang subscription dari provider. Tidak menerima subscription ID pengganti, owner, harga atau grant dari operator. Konflik subscription yang sudah dimiliki order lain menjadi `review`; receipt/grant lain tetap utuh dan worker dapat melanjutkan.

Jika `requires_signed_replay=true`, belum ada bukti untuk mengikat subscription. Di Lemon Squeezy buka **Settings → Webhooks → Recent deliveries**, pilih event **subscription_created** untuk checkout tersebut, lalu **Resend**. Pastikan response **200 SUCCESS**, kemudian jalankan `retry` dan periksa satu receipt/satu grant untuk pembayaran awal. Pada Duitku gunakan resend callback dari provider/tim integrasi; jangan mengisi subscription ID berdasarkan email pelanggan. Bila callback tidak memiliki subscription ID, event tetap tertunda sampai bukti pengaitan yang lengkap diterima.

Exit code 2 menandakan masih ada event tertunda, status belum terverifikasi, atau environment salah. Perbaiki akar masalah sebelum mengulang. `retry` tidak mendispatch checkout baru atau menagih kartu; permintaan cancel yang sudah disimpan tetap dilanjutkan melalui service yang sama.

Pembatalan disimpan sebelum network call. Timeout menjadi `cancel_pending` dan worker melanjutkan. Status `cancelled` hanya setelah provider dikonfirmasi; grant yang sudah dibayar tidak dihapus. Renewal gagal tidak membuat grant baru. Lifecycle grace period, refund/reversal, downgrade dan payment-method update dilengkapi NG-022 pada bagian di bawah; konfigurasi live dan acceptance release tetap diperlukan sebelum production.

## Konfigurasi lokal dan tunnel

Secret hanya ada di `.env` yang diabaikan Git, dengan permission 0600. Isi `BILLING_MODE=test`, `BILLING_PUBLIC_API_URL`, flags gateway, merchant code/key Duitku, dan API key/store/variant/webhook secret Lemon Squeezy. `LEMONSQUEEZY_CURRENCY=IDR` dan `LEMONSQUEEZY_PRICE_MINOR=27075000`. Gateway tidak tersedia sebelum konfigurasi lengkap. Menonaktifkan checkout tidak menghentikan reconciliation/cancellation subscription yang sudah dikenal. Mode test tidak dapat diaktifkan sebagai billing production.

Konfigurasi aktif: `DUITKU_ENABLED=false` dan `LEMONSQUEEZY_ENABLED=true`. Katalog `/billing` hanya mengiklankan gateway yang checkout-nya diaktifkan; perintah checkout ke gateway nonaktif ditolak server sebelum order/provider effect. Order, receipt, webhook dan recovery lama tetap tersedia agar riwayat pembayaran serta hak yang sudah dibayar dapat direkonsiliasi. UI satu gateway tidak menampilkan pilihan wilayah atau radio yang tidak diperlukan; bila seluruh checkout dimatikan, tampil pesan pembayaran belum tersedia.

Harga komersial berasal dari katalog/snapshot order `/billing`. `plan_contract` pada `/usage` menyajikan allowance dan periode; harga acuan lama Rp149.000 dari benchmark NG-040 tidak diiklankan sebagai harga checkout aktif.

Sandbox DS36799 telah mengenali merchant key dan menyediakan channel kartu `VC`, tetapi inquiry subscription mengembalikan `Subscription is not available`. `.env` mempertahankan `DUITKU_ENABLED=false` sampai akses Subscription diaktifkan oleh Duitku. Setelah aktivasi, verifikasi signature inquiry/callback yang dipilih dan jalankan acceptance provider sebelum mengaktifkan checkout. Kredensial yang valid serta channel kartu biasa belum membuktikan kemampuan recurring.

Untuk pengujian webhook lokal:

```sh
uv run --project apps/backend uvicorn scripts.billing_webhook_proxy:app --host 127.0.0.1 --port 8787
cloudflared tunnel --url http://127.0.0.1:8787 --no-autoupdate
```

Origin proxy hanya membuka halaman sandbox statis dan dua route webhook; route account, billing history, chat, docs dan API lain memberikan 404. Set URL tunnel yang tercetak sebagai `BILLING_PUBLIC_API_URL` serta URL callback kedua gateway. Jalankan API dan worker setelah perubahan `.env`; keduanya membaca konfigurasi saat startup. Tunnel Quick URL berubah setelah proses dibuat ulang dan berhenti ketika proses tunnel berhenti. Perbarui callback provider saat URL berubah. Ini alat development, bukan deployment production.

## Sumber resmi

- [Duitku Subscription](https://docs.duitku.com/subscription/id/)
- [Duitku API umum](https://docs.duitku.com/api/id/)
- [Lemon Squeezy subscription](https://docs.lemonsqueezy.com/help/products/subscriptions)
- [Lemon Squeezy currency processing](https://docs.lemonsqueezy.com/help/payments/currencies)
- [Subscription invoice](https://docs.lemonsqueezy.com/api/subscription-invoices/the-subscription-invoice-object)
- [BI JISDOR](https://www.bi.go.id/en/statistik/informasi-kurs/jisdor/Default.aspx)
- [Cloudflare Quick Tunnel](https://developers.cloudflare.com/tunnel/get-started/quick-tunnels/)

## Lifecycle paket NG-022

Migration additive `0015_subscription_lifecycle` menambah policy snapshot per order, status refund per receipt dan `quota_grants.revoked_at`. Order lama menerima policy versi `subscription-lifecycle-v1` yang eksplisit: grace allowance nol, refund penuh mencabut sisa hak, partial refund memerlukan review dan mempertahankan hak yang sudah ada, Task memakai budget asal, Jadwal memeriksa allowance setiap run. Ini melengkapi batas lifecycle yang sebelumnya ditunda dari NG-021.

Plan efektif dibaca dari grant yang berlaku dan belum dicabut, bukan label subscription provider. Cancel/past_due tidak menghapus pembayaran sah; setelah paid-through tidak ada grant baru tanpa invoice paid terverifikasi. Free berulang setiap 30 × 24 jam sejak akhir hak terakhir, atau waktu pencabutan apabila refund lebih awal. Chat dan compute memakai anchor yang sama. Periode, reservasi, snapshot dan biaya pekerjaan lama tetap dipertahankan. Kontrol dan storage I/O tetap tersedia ketika allowance nol.

Lemon Squeezy invoice `refunded`, `partial_refund`, `refunded` boolean dan `refunded_amount` dinormalisasi sesudah identity/currency/amount diverifikasi. Refund yang diamati sebelum aktivasi menyimpan receipt tanpa grant. Full refund mencabut hanya grant receipt terkait; paid-through dihitung dari grant lain yang belum dicabut. Stale paid tidak memulihkan hak dan observasi refund tidak mundur. Transaksi/lease/account lock melindungi pencabutan dan audit; tidak ada penghapusan biaya provider atau invoice. Reconciliation tetap memeriksa subscription expired untuk refund terlambat.

Refund sebagian ditandai `refund_review_required` dan receipt `partial`, terpisah dari status subscription. Operator menggunakan `billing.recovery inspect/retry` untuk memeriksa/merekonsiliasi kembali bukti provider. Jangan mengubah grant manual berdasarkan email atau screenshot. Selama bukti provider masih partial, flag review dipertahankan dan hak yang sebelumnya diterbitkan tetap berlaku; belum ada prorata atau penyelesaian review otomatis. Jika kemudian provider membuktikan full refund, pencabutan dan flag diperbarui melalui jalur yang sama. Penerbitan refund uang dilakukan melalui provider dengan wewenang operasional yang sesuai, bukan oleh agent atau endpoint pelanggan.

`GET /billing` menyertakan entitlement efektif, reset/akhir Plus, jumlah Task diterima/Jadwal aktif dan status refund history. `POST /billing/{id}/payment-method` owner-only membaca signed `urls.update_payment_method` dari subscription API, memeriksa mode/store/variant/subscription dan host HTTPS Lemon Squeezy. URL hanya dikembalikan pada permintaan tersebut, tidak dipersist. Error provider menjadi pesan aman dan dapat dicoba ulang. URL valid mengikuti masa berlaku provider; UI selalu mengambil URL baru ketika tombol ditekan.

Jalankan `make entitlement-inspect` untuk kontrak lifecycle disposable, `make billing-inspect` untuk checkout/reconciliation, serta regresi quota/usage/task/schedule bila admission berubah. Bukti dan batas penerimaan: [NG-022 acceptance](billing-22-acceptance.md). Sumber kontrak provider: [invoice lifecycle](https://docs.lemonsqueezy.com/api/subscription-invoices/the-subscription-invoice-object), [subscription dan signed payment URL](https://docs.lemonsqueezy.com/api/subscriptions/the-subscription-object), [refund API](https://docs.lemonsqueezy.com/api/subscription-invoices/issue-refund).
