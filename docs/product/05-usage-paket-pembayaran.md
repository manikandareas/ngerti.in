# 05 · Usage, Paket & Pembayaran

> Pembaruan 22 Oktober 2026: runtime aktif hanya E2B. Kode, resource dan data Daytona telah dihapus. Keterangan provider lama di bawah adalah konteks historis, bukan instruksi operasi saat ini. Lihat [pembersihan provider](../engineering/e2b-only-cleanup.md).


Sumber: [Notion](https://app.notion.com/p/3fdabdd61873819ca2b5cc4e521b3587) · Readback: 2026-10-19T13:28:12.210Z

<!-- notion-content:start -->
Kontrak allowance V1 NG-040 menetapkan **Free 100 pesan/1.000 kredit komputasi** dan **Plus 300 pesan/5.000 kredit komputasi** per **30 × 24 jam**. Harga Rp149.000 adalah acuan benchmark awal NG-040. Keputusan checkout aktif NG-021 saat ini memakai **Lemon Squeezy saja, Rp270.750 sebelum pajak per 30 hari**, ekuivalen USD15 pada snapshot kurs, dengan store tetap IDR. Duitku dinonaktifkan sementara atas keputusan pengguna. NG-021 dan lifecycle NG-022 diterima development; konfigurasi live dan acceptance release tetap menjadi syarat sebelum production. Periode lama mempertahankan snapshot; kontrak chat `chat-v1-2026-10-19` dan compute `compute-allowance-v1`.

Satu kredit adalah allowance biaya konfigurasi 1.000 microUSD, bukan saldo tunai atau invoice. `GET /quotas` tetap hanya `meters.chat`; `GET /usage` menyajikan komputasi, cadangan, reset dan kapasitas file. Meter Course/halaman materi tetap dihapus. Catatan NG-033–036 di bawah adalah riwayat budget awal; implementasi aktif NG-040 dijelaskan pada bagian terakhir.

## Ledger dan enforcement chat

Satu input pengguna mendapat admission atomik dan audit yang dapat dipulihkan.

**Alur:** Validate → account lock → reserve + domain/enqueue → public text/approval commit → no-output failure release → explicit reverse bila dibenarkan.

**State:** reserved/committed/released/reversed; revision/token fencing.

**Input → output:** Owner, stable resource key/fingerprint, unit integer → operation/period/token dan append-only audit.

**Kegagalan & pemulihan:** Sisa habis memberi 429 quota_exceeded + Retry-After/reset_at; draft tetap. Replay/resume/recovery/approval bukan input baru.

**Izin:** Mutasi ledger/grants hanya server internal; owner/plan/amount dari browser tidak dipercaya.

**Biaya:** Satu unit per user message; reasoning saja tidak commit; partial text commit; stop tanpa output release.

**Acceptance:** Probe concurrency, idempotency, rollover, grants, refund, owner, old worker fencing, 429 serta approval saat saldo nol.

Bukti modul: [REA-5 · Permissions](../research/muse-ai-v1/evidence/permissions.md). Tiket: [NG-028 · Sederhanakan kuota menjadi fondasi umum](../backlog/tasks/28-sederhanakan-kuota-menjadi-fondasi-umum.md) · [NG-030 · Terima baseline V1 yang bersih](../backlog/tasks/30-terima-baseline-v1-yang-bersih.md).

## Compute dan allowance V1

Budget komputasi melindungi pekerjaan file/code/browser/schedule dari biaya tak terbatas.

**Alur:** Estimate/max cap → admission → cost event per model/tool/resource → settle actual/remainder → outcome dan penjelasan charge.

**State:** reserved/settling/settled/released/refunded; cost estimated/confirmed/unknown.

**Input → output:** Provider/resource identity, timestamp, price/policy version, parent budget → dedup cost events dan ringkasan user.

**Kegagalan & pemulihan:** Crash dapat menimbulkan actual vendor cost meski product charge dibebaskan; unknown cost ditandai dan direkonsiliasi.

**Izin:** Model tidak dapat menaikkan cap/plan; child tasks berbagi parent/account cap; kontrol stop/result/memory/schedule tetap terbuka.

**Biaya:** Token model, tool/search/browser, runtime/idle disk, storage/egress, parser, retry dan evaluasi background dicatat terpisah.

**Acceptance:** P24–P26; hard caps ada sejak Task/sandbox/schedule awal; benchmark memilih allowance/price komersial sebelum checkout aktif.

Bukti modul: [REA-5 · Permissions](../research/muse-ai-v1/evidence/permissions.md). Tiket: [NG-033 · Task background dan approval umum](../backlog/tasks/33-task-background-dan-approval-umum.md) · [NG-035 · Eksekusi kode dalam sandbox](../backlog/tasks/35-eksekusi-kode-dalam-sandbox.md) · [NG-036 · Browser VNC live desktop dan takeover](../backlog/tasks/36-browser-vnc-live-desktop-dan-takeover.md) · [NG-037 · Scheduler pengguna saat offline](../backlog/tasks/37-scheduler-pengguna-saat-offline.md) · [NG-040 · Usage komputasi dan kontrak paket V1](../backlog/tasks/40-usage-komputasi-dan-kontrak-paket-v1.md) · [NG-041 · Benchmark kualitas latency dan biaya asisten umum](../backlog/tasks/41-benchmark-kualitas-latency-dan-biaya-asisten-umum.md).

## Pembayaran dan lifecycle paket

Entitlement komersial hanya aktif dari pembayaran yang terbukti.

**Alur:** Checkout → server verify amount/currency/product/owner → idempotent callback/reconciliation → grant → renewal/expiry/downgrade/refund.

**State:** pending/paid/failed/expired/refunded; entitlement active/expired/downgraded.

**Input → output:** Order/provider event → verified payment dan versioned entitlement; client redirect bukan bukti pembayaran.

**Kegagalan & pemulihan:** Callback hilang/duplikat/urutan terbalik atau refund direkonsiliasi; task accepted memakai policy snapshot, bukan aturan baru diam-diam.

**Izin:** Secret gateway server-only; plan/grant bukan tool agent; ownership tetap berlaku saat expired.

**Biaya:** Harga/gateway dipilih saat implementasi setelah benchmark; tidak mewarisi Rp49.000 atau unit pembelajaran lama.

**Acceptance:** Forged/duplicate callback, renewal, expiry, downgrade, refund serta saldo 0 sambil stop/approval/download lulus.

Bukti modul: [REA-5 · Permissions](../research/muse-ai-v1/evidence/permissions.md). Tiket: [NG-021 · Checkout dan aktivasi pembayaran V1](../backlog/tasks/21-checkout-plus-dan-aktivasi-pembayaran.md) · [NG-022 · Paket pengguna usage expiry dan downgrade](../backlog/tasks/22-paket-pengguna-usage-expiry-dan-downgrade.md) · [NG-040 · Usage komputasi dan kontrak paket V1](../backlog/tasks/40-usage-komputasi-dan-kontrak-paket-v1.md) · [NG-041 · Benchmark kualitas latency dan biaya asisten umum](../backlog/tasks/41-benchmark-kualitas-latency-dan-biaya-asisten-umum.md).

## Implementasi budget awal NG-033

Policy text-task-work-v1 memakai conservative token work: 60.000 unit/task, 240.000/account/tanggal UTC, 2.400.000/global/tanggal UTC; dua task queued/running per account, maksimum tiga model calls, input 20.000 byte dan output 3.000 token/call. Policy/model disnapshot; input byte bound + framing allowance + output cap dicadangkan sebelum network call. Usage lengkap settle ke token aktual; usage terputus tetap unknown dengan cap panggilan dihitung. Retry mempertahankan bucket asal dan cap; waiting_user tidak memegang execution slot; terminal/expiry melepas sisa reservasi.

Satu input chat/form task memakai satu chat unit. Langkah background, approval, replay, stop dan retry task tidak menambah pesan. Harga provider dalam uang/invoice dan allowance komersial belum dihitung; NG-040 tetap menentukan kontrak komersial. Bukti: `docs/engineering/task-33-acceptance.md`.

## Batas file dan OCR NG-034

Satu permintaan Task file memakai satu chat unit; upload, cache reuse, review, download dan retry Task tidak membuat pesan baru. Pengaman OCR terpisah dari paket komersial: 100 halaman/akun dan 1.000 global per tanggal UTC, PDF maksimal 20 halaman/file dan 40 halaman/Task. Reservasi atomik mendahului dispatch; outcome ambigu tetap menghitung halaman yang mungkin terpakai. Percobaan OCR baru memerlukan request identity dan pengakuan potensi biaya; retry Task tidak mendispatch ulang OCR.

Policy `product-files-v1` menyimpan model snapshot `mistral-ocr-4-1`, versi tarif dan estimasi konfigurasi USD4/1.000 halaman. Cache mengikat revision/model/policy. Ledger charged pages tetap ada setelah bytes dihapus. Batas: 10 MiB/file, 5 lampiran/25 MiB, 10 hasil/25 MiB, storage akun 250 MiB; batas model Task tetap berlaku lebih dahulu bila perlu. Ini cap operasional internal, bukan harga pelanggan atau invoice. Detail telemetry dan batas bukti: `docs/engineering/files-34-acceptance.md`.

## Budget runtime kode NG-035

Policy code-sandbox-v1 memisahkan chat, token model dan biaya resource. Snapshot menyimpan provider, price version, rate, alokasi, deadline dan caps. Reservasi resource mendahului model/provisioning; race akun/global ditangani atomik. Satu sesi mereservasi36.000microUSD; Task108.000, akun1.000.000/tanggal UTC dan global5.000.000/tanggal UTC. Satu resource aktif/akun, dua global, maksimal tiga sesi/Task. Token tetap memakai budget Task yang sudah ada.

Rate awal166.464microUSD/jam adalah estimasi konfigurasi untuk2vCPU/4GiB/8GiB, versi daytona-linux-2026-10-18. TTL maksimal10menit plus margin120detik tercakup dalam reservasi. Unknown tetap terhitung penuh sampai konfirmasi cleanup; create timeout tidak diulang dengan resource baru. Penolakan pasti sebelum alokasi memiliki biaya resource nol. Konfirmasi delete menyelesaikan estimasi konservatif dari wall time teramati; invoice_confirmed=false. Sesi lama tidak dihitung ulang dengan konfigurasi baru.

Walkthrough tiga Task model mencatat4.862token confirmed dan estimasi resource USD0.004279; probe runtime terkontrol USD0.001433. Ini bukan invoice atau harga pelanggan; biaya token model dalam uang belum ditetapkan. Percobaan terkontrol membuktikan retry/receipt/publication tidak menggandakan hasil dan cost events. Penerimaan `docs/engineering/sandbox-35-acceptance.md`; kontrak paket komersial dan benchmark tetap NG-040/NG-041.

## Budget browser dan retained profile NG-036

Policy private-browser-v1 memisahkan masa hidup compute dari retensi profil. Default Task20menit/24langkah, idle stop2menit, margin180detik; profil7hari tidak aktif dan20workspace global. Fixed2vCPU/4GiB/8GiB. Ambang profil1GiB/download25MiB dipantau setiap5detik; collector membatasi10MiB/file/25MiB total dan proxy membatasi200MiB transfer. Satu compute/account, dua global dan tiga sesi/Task; cap uang serta admission lock berbagi dengan Python.

Compute166.464microUSD/jam dan disk864microUSD/jam memakai snapshot harga. Sesi default mereservasi208.964microUSD: compute+margin63.812 dan storage tujuh hari145.152. Setiap use mencadangkan seluruh retention window kembali secara konservatif, bukan tagihan disk eksak. Unknown tetap dihitung penuh; stop terkonfirmasi menyelesaikan estimasi compute dari wall time teramati. Reset profil tidak menghapus hasil atau ledger. Cap akun1.000.000/global5.000.000 mengikuti bucket UTC asal Task; policy lama tidak dihitung ulang dengan rate baru.

Walkthrough empat Task/lima sesi mencatat14model calls,31.758token confirmed dan estimasi resource/storage USD0,760149. Nol resource NG-036 setelah reset. Biaya model dalam uang, invoice dan paket pelanggan belum diklaim. Panel komputer menampilkan pemakaian/cadangan; detail `docs/engineering/computer-36-acceptance.md`. Benchmark/paket komersial tetap NG-040/NG-041.

## Implementasi NG-040 dan keputusan kontrak V1

Diterima development pada 19 Oktober 2026; [NG-040 · Usage komputasi dan kontrak paket V1](../backlog/tasks/40-usage-komputasi-dan-kontrak-paket-v1.md). Ledger `compute_periods/work/events/audit` mengikat owner, native attempt, parent Task, period serta snapshot price/policy. Admission account/global atomik mendahului network/provider call; replay dan settlement tidak menggandakan biaya. Sisa cadangan dilepas; unknown tidak dianggap biaya nol. Quantity terkonfirmasi berbeda dari estimasi uang dan invoice.

No-output failure/stop pada chat/Task mengembalikan allowance pengguna tanpa menghapus biaya provider. Retry tetap dalam cap/period asal dan tidak membatalkan refund sebelumnya. Evaluasi memory/proaktif dapat memakai compute meski tidak menghasilkan pesan; approval/replay/stop/kontrol memory tidak menjadi pesan baru. Storage/control I/O disubsidi agar hasil tetap terbaca saat saldo nol.

Batas operasional: account USD2/global USD10 per tanggal UTC; provider periode 120% allowance publik untuk membatasi biaya failure/refund. Batas native token/page/runtime dan parent Goal tetap berlaku. Model/browser tidak dapat menaikkan plan/cap. Public estimate Task/Jadwal dan UI Usage menjelaskan saldo, cadangan, blocking, refund serta reset.

Dasar keputusan harga: telemetry development yang sudah tersedia ditambah chat, Task/Python, memory dan OCR sintetis nyata. Standard price snapshot `provider-list-2026-10-19`: GPT-6 Luna USD0,10/0,01 cached/0,50 per juta token, GPT-5 Mini USD0,25/0,025/2, embedding USD0,02, Jev USD0,042 input dengan output gratis; OCR USD4/1.000 halaman. Resource mengikuti snapshot NG-035/036. [OpenAI pricing](https://developers.openai.com/api/docs/pricing), [TypeSafe](https://docs.typesafe.ai/models), [Mistral](https://docs.mistral.ai/inference/pricing), [R2](https://developers.cloudflare.com/r2/pricing/).

Satu contoh Python: hold 138 menjadi 1,338 kredit; chat dan Task teks lain 0,399/0,076 kredit. Browser/retensi mendominasi sampel awal. Plus USD5 allowance dan USD6 cap provider menyisakan Rp29.000 dari harga Rp149.000 pada asumsi stres Rp20.000/USD, sebelum biaya tetap/pajak/gateway; itu skenario, bukan kurs pasar atau jaminan margin. Harga/allowance berikutnya memakai versi kebijakan baru.

Probe 48 kontrak dan walkthrough desktop/mobile diterima; real memory/OCR terpisah dari model Task fixture. Bukti repo `docs/engineering/usage-40-acceptance.md`, `docs/engineering/usage-runtime.md` dan `docs/engineering/evidence/usage-40/`. Semua angka uang development estimated, invoice belum dikonfirmasi. Local MinIO memakai estimasi ekuivalen R2; storage lebih dari 30 hari, signed-download bytes dan invoice provider memerlukan reconciliation. Benchmark representatif/kualitas/latency/biaya lifecycle tetap NG-041 sebelum release.

## Implementasi subscription NG-021

Keputusan pengguna terbaru: subscription auto-renew setiap 30 × 24 jam, Lemon Squeezy sebagai satu-satunya checkout aktif untuk saat ini, allowance Plus 300 pesan/5.000 kredit per periode yang dibayar. Harga store IDR Rp270.750 sebelum pajak, snapshot ekuivalen USD15. Duitku Rp149.000 ditunda sambil menunggu jawaban provider; adapter/kredensial tetap tersimpan dan tidak ditampilkan pada checkout. Harga serta allowance disimpan per order; renewal tidak menghitung ulang kurs harian.

Lemon Squeezy menyimpan 27.075.000 minor units IDR. Provider memproses ekuivalen USD; invoice sandbox Rp270.694,32/USD15,01 diverifikasi dengan kurs invoice dan batas pembulatan setengah US cent, dengan price/variant/quantity tetap diperiksa. Tidak menerima toleransi diskon persentase.

Modul billing mencakup katalog server, checkout idempotent, durable webhook inbox, verifikasi receipt melalui API provider, grant chat/compute atomik, snapshot pekerjaan lama, owner isolation, lease fencing, reconciliation dan cancellation yang menunggu konfirmasi provider. Tidak ada setter plan/grant untuk agent. Pembatalan menghentikan penagihan berikutnya dan mempertahankan periode yang sudah dibayar.

Kontrak lokal: 69 skenario; regresi kuota 46/usage 48. Sandbox Lemon Squeezy berhasil membayar dengan kartu dummy, memproses webhook, memberi satu receipt/satu grant, dan membatalkan subscription tanpa menghapus paid-through. Renewal provider 30 hari belum ditunggu; renewal dibuktikan pada kontrak terkontrol. Recovery operator untuk exhausted inbox dan signed resend initial, serta konflik subscription lintas owner, ikut diuji. Resend initial provider nyata mendapat HTTP200; readback tetap satu receipt/satu grant. Katalog hanya mengiklankan gateway aktif, POST checkout Duitku ditolak sebelum efek provider, dan history tetap tersedia. Harga komersial berasal dari `/billing`; `/usage.plan_contract` menyajikan allowance/periode.

Duitku saat ini ditunda dan tidak menjadi syarat penerimaan NG-021. DUITKU_ENABLED=false dan LEMONSQUEEZY_ENABLED=true; pengaktifan Duitku kembali memerlukan aktivasi serta pengujian provider terpisah. Proyek sandbox DS36799 sebelumnya mengenali kredensial dan VC tetapi menolak inquiry subscription HTTP404 `Subscription is not available`; permintaan aktivasi sudah dikirim melalui live chat dengan izin pengguna. Cloudflare Tunnel hanya mengekspos halaman sandbox dan dua webhook, bukan API akun/chat.

Batas penerimaan: webhook initial yang hilang sebelum subscription terikat dipulihkan melalui resend bertanda tangan dari dashboard dan CLI operator; subscription yang sudah terikat direkonsiliasi lewat API. Runbook inspection/retry ada pada `billing-runtime.md` dan tidak menerima owner/amount/grant/subscription ID pengganti. Permintaan aktivasi Duitku telah dikirim dengan persetujuan pengguna dan sedang diperiksa spesialis integrasi. Grace period, refund/reversal dan downgrade lengkap tetap [NG-022 · Paket pengguna usage expiry dan downgrade](../backlog/tasks/22-paket-pengguna-usage-expiry-dan-downgrade.md). Bukti repo: `docs/engineering/billing-21-acceptance.md`, `docs/engineering/billing-runtime.md` dan `docs/engineering/evidence/billing-21/`. Tiket [NG-021 · Checkout dan aktivasi pembayaran V1](../backlog/tasks/21-checkout-plus-dan-aktivasi-pembayaran.md) Done development dengan scope checkout Lemon Squeezy saja.

## Implementasi lifecycle NG-022

Diterima development pada 19 Oktober 2026. Migration additive `0015_subscription_lifecycle` menyimpan policy `subscription-lifecycle-v1` per order, refund receipt, kebutuhan review terpisah dari status subscription, dan pencabutan grant melalui `revoked_at`. Renewal terverifikasi memberi satu grant cycle asal. Tanpa pembayaran terverifikasi tidak ada allowance Plus baru; setelah paid-through akun kembali ke Free 100 pesan/1.000 kredit per 30 × 24 jam.

Refund penuh mencabut sisa hak receipt terkait tanpa menghapus receipt, pemakaian, budget pekerjaan lama atau biaya provider. Refund sebagian masuk review dengan mempertahankan hak yang sudah diterbitkan; invoice yang sudah refunded sebelum initial activation tidak mendapat grant. Replay/stale paid tidak memulihkan grant. Refund historis tidak mencabut renewal lain. Konfirmasi cancellation tetap dapat dilakukan selama partial review.

Task yang sudah diterima memakai snapshot/budget asal. Setiap eksekusi Jadwal memeriksa allowance terbaru; kuota habis menjadi blocked_budget dengan alasan dan tanpa Task parsial. UI Usage menampilkan paket efektif, pemakaian/reservasi, reset/expiry, dampak downgrade dan refund history. Stop, approval, download/hasil, memory dan pause Jadwal tetap tersedia saat nol. Pembaruan metode pembayaran memakai signed URL provider yang diambil saat diminta, owner-scoped dan host HTTPS tervalidasi; URL tidak disimpan.

Bukti: 49 kontrak lifecycle, regresi billing69/quota46/usage48/Task55/scheduler82, make check/build lulus. Lemon Squeezy test nyata memverifikasi signed payment URL dan full refund invoice dummy NG-021; chat/compute kembali Free dan replay mempertahankan satu grant historis. Browser desktop1440/mobile390/320 tanpa overflow; Plus/past_due/refund/stale memakai fixture respons UI tanpa mutasi provider. Rincian repo: `docs/engineering/billing-22-acceptance.md`, `docs/engineering/billing-runtime.md`, `docs/engineering/evidence/billing-22/`.

Batas: tidak memakai uang/kartu nyata; renewal/expiry/partial refund/crash diuji terkontrol, tidak menunggu 30 hari provider. Refund nyata dibuktikan lewat API/reconciliation, bukan klaim webhook refund nyata. Partial refund belum diprorata otomatis dan memerlukan tindak lanjut operasional. Tidak mengklaim penerimaan production/benchmark NG-041. NG-023 menjadi pekerjaan berikutnya; status tiket lain dipertahankan.
<!-- notion-content:end -->
