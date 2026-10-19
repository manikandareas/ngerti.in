# Usage dan kontrak paket NG-040

NG-040 menambahkan allowance komputasi di samping kuota pesan. Chat tetap memakai satu unit per input pengguna; panggilan model/tool dalam satu turn tidak menjadi pesan tambahan. Pembayaran dan aktivasi entitlement mengikuti NG-021/022. Migration `0013_compute_usage` menambah tabel tanpa menghapus data.

## Kontrak paket

| Paket | Harga per 30 × 24 jam | Pesan | Komputasi |
| --- | --- | --- | --- |
| Free | Rp0 | 100 | 1.000 kredit |
| Plus | Rp149.000 | 300 | 5.000 kredit |

Satu kredit merupakan allowance biaya konfigurasi sebesar 1.000 microUSD, bukan saldo tunai atau invoice. Nilai di API disajikan sampai tiga desimal; ledger menyimpan integer microUSD. Harga adalah keputusan kontrak V1 untuk integrasi NG-021, tidak mengaktifkan checkout atau memberi entitlement. `chat-v1-2026-10-19` mempertahankan jumlah pesan baseline setelah keputusan ekonomi awal; periode chat lama tetap memakai snapshot sebelumnya. Batas compute dapat dikonfigurasi server sebelum periode baru dibuat.

Dasar awal: telemetry development yang sudah tersedia, ditambah chat/Task/Python nyata, satu OCR gambar sintetis dan dua panggilan model memory. Browser/runtime dan penyimpanan profil merupakan komponen biaya dominan pada sampel. Allowance memberikan batas biaya, bukan janji jumlah Task atau menit browser; maksimum pekerjaan harus muat dalam saldo saat admission. Angka harga tidak mewarisi harga paket pembelajaran.

Sensitivitas internal: allowance Plus USD5 dan batas biaya provider periode sebesar 120% (USD6) menyisakan Rp29.000 dari harga Rp149.000 pada asumsi stres Rp20.000/USD, sebelum biaya tetap, pajak dan gateway. Angka kurs ini skenario, bukan kurs pasar atau jaminan margin. Subsidized storage/control I/O dicatat terpisah. Benchmark representatif, settlement invoice, biaya tetap dan validasi margin final tetap menjadi gate NG-041 sebelum release. Perubahan berikutnya membutuhkan versi kebijakan baru.

## Ledger dan admission

Modul `apps/backend/src/ngertiin/usage/` memisahkan kebijakan/harga, admission, adapter native event, API, storage dan recovery. Tidak ada model yang diberi setter saldo, harga atau plan.

- `compute_periods`: siklus Free/Plus berasal dari account anchor dan grant terverifikasi; snapshot allowance, policy, catalog tarif dan kontrak paket.
- `compute_work`: reservasi maksimum per chat/Task atau satu attempt background, terkait owner/period dan Task/thread. Periode asal tetap dipakai setelah rollover/retry.
- `compute_events`: satu identity per provider attempt; harga disnapshot sebelum dispatch, quantity, estimated/confirmed/unknown dan flag invoice disimpan terpisah. Tidak menyimpan prompt, screenshot, cookie atau credential.
- `compute_audit`: append-only dalam jalur aplikasi untuk reserve, dispatch, retry, settlement dan refund.
- `compute_balances`: projection saldo pengguna terpisah dari biaya provider. Amount yang sudah di-refund tidak muncul kembali sebagai charge ketika Task dicoba ulang.

Urutan lock: account → domain → global admission. Reserve/domain/enqueue berada dalam transaksi yang sama. Network/model/resource call di luar transaksi. Semua source memakai identity native; settlement dan replay idempotent. Budget native token/page/runtime/parent Goal tetap berlaku sebelum cap gabungan. Pembatasan account/global dan period menggabungkan seluruh source baru, termasuk biaya provider dari pekerjaan yang dibebaskan untuk pengguna.

Task mencadangkan batas token, maksimal sesi Python/browser, retensi profil, dan OCR file yang belum mempunyai cache. Event anak memakai cadangan Task tersebut. Dua Task/admission background yang berlomba tidak mengambil saldo yang sama. Task yang belum selesai, termasuk waiting_user, menahan sisa maksimum sampai selesai/stop. Runtime yang belum pasti tetap dihitung konservatif oleh ledger native.

Kuota publik yang habis, cap provider per periode, cap account harian dan cap layanan harian memiliki pesan berbeda. Cap harian default account USD2/global USD10 (UTC); cap provider periode adalah 120% allowance publik, termasuk failure/refund, untuk membatasi biaya subsidi. Itu batas operasional, bukan tambahan kredit pengguna.

## Settlement dan kontrol

| Kejadian | Perlakuan |
| --- | --- |
| Hasil lengkap/parsial tersedia | Quantity yang diketahui diselesaikan ke estimasi harga snapshot; sisa cadangan dilepas. |
| Gagal/stop tanpa hasil | Allowance pengguna dikembalikan. Biaya provider tetap tercatat dan tetap mengikuti cap operasional. |
| Provider usage/outcome belum pasti | Menahan ceiling konservatif, state unknown; tidak dianggap biaya nol atau invoice terkonfirmasi. |
| Approval, replay SSE, stop, kontrol memory | Tidak menjadi input chat berbayar baru. |
| Retry yang melakukan inference baru | Event attempt baru, tetap dalam cap Task/period asal; refund lama tidak dibatalkan. |
| Perubahan harga/policy | Pekerjaan/periode lama mempertahankan snapshot; tidak direprice di ledger. |
| Evaluasi memory/proaktif | Attempt dapat memakai compute meski hasilnya no-op; bukan pesan chat baru. |
| Saldo nol | Read/approval/stop/download/forget/pause tetap tersedia; inference baru ditolak. |

Recovery maintenance merekonsiliasi native Task/OCR/resource/memory/proactivity, menutup hold terminal dan menandai attempt chat/storage yang terputus sebagai unknown. Tidak ada replay aksi provider dari reconciliation. Owner polling dan batch recovery dibatasi agar tidak menahan transaksi selama network call.

## Storage

S3 PUT/GET/DELETE memiliki identity per HTTP attempt aplikasi dan menghitung retry SDK dari response metadata. File bytes, ukuran akun dan snapshot tarif disimpan tanpa object key. Storage/control I/O disubsidi dan tidak memblokir unduhan saat saldo nol; biayanya tetap masuk audit operasional. Riwayat pengguna menggabungkan storage dalam indikator kapasitas sehingga setiap GET tidak membanjiri daftar pekerjaan.

Local MinIO memakai estimasi ekuivalen R2 Standard yang eksplisit: PUT/storage 30 hari, GET, retry dan delete. Ini bukan invoice MinIO/R2 atau pengukuran peak storage provider. Kapasitas setelah 30 hari dan bytes unduhan signed URL langsung memerlukan reconciliation provider; biaya egress lokal tidak diasumsikan nol. Retensi disk browser memakai konservatisme NG-036: jendela retensi penuh tiap use, bukan biaya disk eksak. `invoice_confirmed=false` pada seluruh estimasi development.

## Harga sumber, diperiksa 19 Oktober 2026

| Source/route | Snapshot |
| --- | --- |
| [OpenAI GPT-6 Luna](https://developers.openai.com/api/docs/models/gpt-6-luna) / [Standard pricing](https://developers.openai.com/api/docs/pricing) | USD0,10 input / 0,01 cached / 0,50 output per juta token, konteks pendek. |
| [GPT-5 Mini](https://developers.openai.com/api/docs/models/gpt-5-mini) | USD0,25 / 0,025 / 2 per juta token. |
| [Embedding 3 Small](https://developers.openai.com/api/docs/models/text-embedding-3-small) | USD0,02 per juta input token. |
| [TypeSafe Jev 1.13](https://docs.typesafe.ai/models) | USD0,042 per juta input token; output gratis. Model tidak di-upgrade oleh NG-040. |
| [Mistral OCR 4.1](https://docs.mistral.ai/inference/pricing) | USD4 per 1.000 halaman, mengikuti policy extraction. |
| [Daytona billing](https://www.daytona.io/docs/billing) / [pricing](https://www.daytona.io/pricing) | Rate/alokasi/version disnapshot dari policy runtime yang sudah diterima NG-035/036. |
| [R2 Standard](https://developers.cloudflare.com/r2/pricing/) | USD0,015/GB-month; Class A USD4,50/juta; Class B USD0,36/juta; DELETE gratis. Ekuivalen konfigurasi pada local MinIO. |

Quantity token terkonfirmasi dari provider tidak sama dengan biaya invoice terkonfirmasi. Cached token dipisahkan bila tersedia. Model/tier/konteks tanpa harga yang cocok menggunakan ceiling konservatif dan unknown; tidak diberi harga nol. Tarif regional, Fast, long-context atau gateway custom tidak diklaim sama dengan Standard.

## API dan operasi

- `GET /quotas`: kontrak chat tetap kompatibel.
- `GET /usage?offset=0`: saldo, hold, reset, kapasitas file dan history owner; 30 item/page.
- `POST /usage/estimate`: quote non-binding dari policy server/runtime dan file revision yang masih dimiliki; tidak menerima harga atau saldo client. Admission memeriksa ulang.
- `GET /usage/{work_id}`: receipt/event/audit owner; owner lain menerima 404.

```sh
make migrate
make usage-inspect
uv run --project apps/backend python scripts/inspect_usage.py --live --output .dev/usage-contracts-live.json
uv run --project apps/backend python scripts/benchmark_usage.py --owner OWNER_UUID --output .dev/usage-initial-benchmark.json
```

Restart API/worker setelah migration. Pekerjaan lama tidak ditagih ulang; runtime yang sudah diterima sebelum NG-040 mempertahankan budget native-nya. Repricing benchmark bersifat read-only, terpisah dari ledger pelanggan. Bukti dan batas penerimaan: [usage-40-acceptance.md](usage-40-acceptance.md).
