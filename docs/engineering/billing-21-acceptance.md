# NG-021 · Bukti implementasi subscription

Diterima development tanggal 19 Oktober 2026 dengan scope akhir **Lemon Squeezy sebagai satu-satunya checkout aktif**. Pengguna menunda Duitku sambil menunggu jawaban provider; penerimaan Duitku tidak lagi menjadi syarat penyelesaian NG-021 saat ini. Kontrak dan cara menjalankan: [billing-runtime.md](billing-runtime.md). Lifecycle lanjutan NG-022 dan konfigurasi live tetap diperlukan sebelum release production.

## Implementasi

- Adapter Lemon Squeezy aktif; adapter Duitku dan kredensialnya dipertahankan dalam keadaan checkout nonaktif. Katalog server, order dan snapshot allowance/harga, checkout idempotent, webhook inbox durable, receipt/grant atomik, account isolation, lease fencing dan worker recovery telah diimplementasikan.
- Subscription aktif setiap 30 hari: Lemon Squeezy store IDR Rp270.750 sebelum pajak, snapshot ekuivalen USD15, dengan 300 pesan dan 5.000 kredit komputasi. Kontrak Duitku Rp149.000 disimpan untuk pengaktifan berikutnya.
- UI Usage memuat satu kartu Lemon Squeezy, kontak billing, persetujuan auto-renew, status, riwayat dan konfirmasi pembatalan. Duitku tidak muncul dalam penawaran dan POST checkout langsung ditolak sebelum efek provider. Perubahan katalog/harga mereset formulir/persetujuan; pembatalan timeout tetap pending dan akses mengikuti periode yang dibayar.
- File `.env` diabaikan Git dan diberi mode 0600. API key/webhook secret tidak dimasukkan ke dokumen, bukti, screenshot, atau chat.

## Kontrak lokal

`make billing-inspect`: **69 skenario** lulus pada PostgreSQL disposable; respons gateway terkontrol. Mencakup dua adapter, harga/interval, request replay, cross-gateway race, forged webhook, wrong mode, ownership, inbox dedup, activation chat/compute, snapshot pekerjaan lama, crash rollback, renewal, cancellation timeout/recovery, FX rounding, stale lease dan reconciliation ketika checkout dinonaktifkan. Recovery membuktikan inspection read-only, callback initial hilang → signed resend → binding/grant sekali, exhausted inbox retry, wrong binding/environment tetap ditolak, diagnostic aman dan konflik subscription lintas owner tidak menggandakan grant atau menghentikan worker. Penonaktifan Duitku diuji: tidak muncul di katalog, POST checkout ditolak tanpa network call, dan order/receipt lama tetap terbaca. Ringkasan allowance `/usage` tidak mengiklankan harga checkout lama Rp149.000.

Regresi kuota chat **46** dan usage **48** lulus. `make check` dan `make build` lulus. Inspector tidak menyatakan sandbox provider nyata lulus. [Hasil kontrak](evidence/billing-21/controlled-contracts.json).

## Lemon Squeezy test mode nyata

Computer use membuat produk test `1452609`, variant `2267301`, price `3812068`, store `492836` yang tetap IDR. Harga API 27.075.000 cents IDR; interval day/30. Produk di luar storefront. Webhook test `144255` mendengarkan 12 event subscription melalui Cloudflare Tunnel.

Checkout berasal dari backend menggunakan owner sintetis `196d458b-a899-4301-b583-64b1a18b0591` dan order `22a1fabb-c562-4e6f-945f-2aef0205103b`. Computer use menyelesaikan checkout dengan kartu dummy resmi di test mode; tanpa kartu atau uang nyata. Provider menampilkan pembayaran berhasil dan subscription `2619903` aktif.

Webhook bertanda tangan diterima HTTP200 dan disimpan. Pembacaan invoice nyata menemukan rounding melalui USD: harga item Rp270.750, invoice Rp270.694,32 / USD15,01 dengan rate `0.00005545`. Adapter memverifikasi price/quantity dan pembulatan terukur. Receipt `8764883` memberi tepat satu grant, chat 300 dan compute 5.000, periode 19 Oktober–18 November 2026 UTC. [Ledger](evidence/billing-21/lemon-live-readback.json).

Pembatalan test melalui layanan backend dikonfirmasi provider `cancelled`, sementara paid-through tetap 18 November. [Readback pembatalan](evidence/billing-21/lemon-cancellation.json). Tidak menunggu 30 hari untuk renewal provider; renewal diuji melalui kontrak lokal. First webhook yang hilang total sebelum binding dipulihkan melalui signed resend dan operator recovery; tidak memakai pencocokan email atau menebak subscription ID. Langkah operasional ada pada runbook.

Bukti UI provider: [produk test](evidence/billing-21/lemon-test-product.png), [webhook test](evidence/billing-21/lemon-test-webhook.png), [pembayaran berhasil](evidence/billing-21/lemon-test-payment-success.png), [pembatalan dikonfirmasi](evidence/billing-21/lemon-test-cancelled.png). Worker dengan adapter terbaru memproses seluruh enam event; satu receipt dan satu grant tetap tercatat setelah replay. [Readback akhir](evidence/billing-21/provider-final-readback.json).

Computer use juga menekan **Resend** untuk event `subscription_created` asli setelah subscription dibatalkan. Provider menampilkan HTTP200 SUCCESS; operator CLI merekonsiliasi ulang status terkini, bukan status active pada payload lama. Hasil tetap cancelled dengan satu receipt/satu grant dan paid-through yang sama. [Bukti replay initial](evidence/billing-21/lemon-initial-webhook-replay.png), [readback recovery](evidence/billing-21/lemon-recovery-replay.json). Kasus kehilangan awal dan exhausted retry diuji pada kontrak terkontrol; percobaan provider ini membuktikan signed replay dan idempotence.

Walkthrough final dengan konfigurasi nyata memverifikasi hanya Lemon Squeezy muncul, tidak ada radio pilihan gateway, harga Rp270.750/30 hari, dan tombol checkout tetap terkunci sebelum persetujuan. Form berisi kontak dummy dan tidak disubmit dari akun pengguna. Viewport mobile 390px tidak mengalami horizontal overflow (document/body width 390px); viewport dipulihkan sesudah pemeriksaan. [Form desktop final](evidence/billing-21/desktop-lemon-only.png), [mobile](evidence/billing-21/mobile-lemon-only.png). Screenshot `desktop-configured-checkout.png`/`mobile-configured-checkout.png` menyimpan walkthrough awal dua gateway; `desktop-checkout.png` memakai fixture UI. Ketiganya merupakan bukti historis sebelum scope akhir.

## Duitku dan tunnel

Computer use membuat proyek sandbox **DS36799**, berstatus Active, dengan URL/callback tunnel. [Bukti proyek](evidence/billing-21/duitku-sandbox-project.png). Setelah pengguna menyelesaikan autentikasi, merchant key diambil melalui UI dan disimpan langsung ke `.env` mode 0600. API daftar payment method mengonfirmasi kredensial valid (HTTP200, responseCode00) dan channel kartu `VC` tersedia.

Permintaan checkout subscription nyata melalui adapter menghasilkan **HTTP404, `Subscription is not available`**. Akun merchant masih menampilkan status review; akses subscription belum tersedia pada proyek tersebut. Order sintetis `2b54cabb-3027-4c02-b031-1e27ece282f9` tetap `unknown`, tidak didispatch ulang dan tidak diberi grant. Sesuai keputusan pengguna, `DUITKU_ENABLED=false` dan `LEMONSQUEEZY_ENABLED=true`; penawaran Duitku disembunyikan. Key/code/channel tetap tersimpan. Pengaktifan Duitku berikutnya memerlukan aktivasi provider serta pengujian inquiry, kartu sandbox, callback, detail cycle, grant dan cancel. Penerimaan end-to-end Duitku belum diklaim dan tidak menghalangi scope akhir NG-021 yang hanya memakai Lemon Squeezy.

Pemeriksaan lanjutan pada halaman Sistem Pembayaran tidak menemukan pengaturan Subscription; hanya channel kartu VC dan kanal pembayaran lain. [Bukti pengaturan](evidence/billing-21/duitku-subscription-settings.png). [Dokumentasi uji coba Subscription](https://docs.duitku.com/subscription/id/#uji-coba) meminta merchant menghubungi support terlebih dahulu.

Atas persetujuan pengguna, permintaan aktivasi dikirim melalui live chat dashboard Duitku. Identitas email akun dan perusahaan dikirim hanya ke support setelah persetujuan terpisah; tidak disimpan dalam bukti repo. Percakapan diteruskan ke spesialis integrasi Tio. Body request lengkap dengan signature/binding disamarkan telah dikirim, dan support mengonfirmasi sedang memeriksa. [Bukti permintaan](evidence/billing-21/duitku-support-request.png). Aktivasi dan penerimaan gateway tidak diasumsikan berhasil sebelum konfirmasi provider serta percobaan baru.

Cloudflare Tunnel diteruskan hanya ke proxy webhook. Pemeriksaan publik: root200, `/billing`404, forged webhook403. [Bukti route](evidence/billing-21/tunnel-routes.json). Tunnel sementara perlu tetap hidup selama pengujian dan callback diperbarui jika hostname berubah.
