# NG-031 · Validasi Daytona dengan trial terbatas

Sumber: [Notion](https://app.notion.com/p/3fdabdd61873810a91b6f2e80f3fa704) · Readback: 2026-10-18T07:13:08.912354+00:00

| Property | Value |
| --- | --- |
| Ticket | 31 |
| Urutan | 6 |
| Lingkup | Aktif V1 |
| Status | Done |
| Prioritas | P0 |
| Area | Fondasi |
| Depends on | [NG-030 · Terima baseline V1 yang bersih](30-terima-baseline-v1-yang-bersih.md) |

<!-- notion-content:start -->
Tujuan: Validasi Daytona dengan trial terbatas.
Lingkup: **Aktif V1**. Identitas NG-031; Urutan delivery 6.

## Acceptance criteria

- [x] Catat konfigurasi, trial budget, SDK/provider version dan latency dari koneksi pengguna.
- [x] Buktikan shell/kode/browser, VNC, live desktop dan takeover pada sandbox serta session yang sama.
- [x] Uji dua owner, expiry URL, revoke, idle stop, reconnect, workspace/file persistence dan recovery; bedakan disk dengan RAM/proses.
- [x] Hard runtime/cost cap dan cleanup resource terkonfirmasi; hasil pengujian menentukan adapter berikutnya, tidak menjanjikan persistensi RAM.

## Spesifikasi dan bukti

[04 · Arsitektur, Runtime & Kontrak](../../product/04-arsitektur-dan-delivery.md) · [REA-6 · Browser & Computer](../../research/muse-ai-v1/evidence/computer.md)

## Dependencies

[NG-030 · Terima baseline V1 yang bersih](30-terima-baseline-v1-yang-bersih.md)

## Bukti penerimaan

**Selesai dan diterima pada 18 Oktober 2026 untuk scope trial NG-031.** Harness diagnostik, gateway desktop dan pengujian resource nyata tersedia. Laporan repo: `docs/engineering/daytona-31-acceptance.md`; trace, screenshot, manifest hasil dan cleanup readback: `docs/engineering/evidence/daytona-31/`. Integrasi tools/Task produk mengikuti tiket berikutnya; hasil trial ini tidak menyatakan fitur production sudah tersedia.
Hard per-task/resource/account cap serta cost telemetry wajib ada sejak capability pertama digunakan; paket komersial menyusul benchmark.

## Hasil trial 18 Oktober 2026

- SDK Python 0.225.0, provider v0.225.1, target eu, daytona-medium: 2 vCPU / RAM 4 GiB / disk 8 GiB. Dua akun Clerk dan dua sandbox berurutan. Provision termasuk preflight 3.572 detik; Python 0.988 detik; roundtrip file 0.491 detik; banner gateway pada dua probe 3.637 dan 3.886 detik.
- Shell/kode, upload/download dan Computer Use lulus. Marker agent terlihat di viewer; input manusia melalui VNC menambahkan human pada field yang sama. Profile sintetis tersebut pulih sesudah stop/start.
- Dua owner terisolasi: list tidak menampilkan sesi asing; viewer/control/cleanup lintas owner ditolak 409. Admission menolak resource aktif kedua lintas akun. Handoff menunggu aksi in-flight; lease lama dan dispatch saat mode human ditolak. Resume mengambil screenshot baru.
- Signed URL vendor: request baru sesudah revoke/expiry menghasilkan 401, tetapi WebSocket existing tetap menerima balasan. Gateway aplikasi menutup channel aktif dengan code 1008 dan menolak koneksi baru: revoke teramati 255 ms sesudah banner; expiry 10 detik teramati pada 10.475 detik sejak mint.
- Idle-stop dengan proses latar aktif teramati pada 76.02 detik. Restart 2.191 detik; hash file sebelum/sesudah identik, proses RAM hilang. Tidak menjanjikan persistensi RAM atau login situs pihak ketiga.
- Timeout command menghasilkan exit 124 pada 21.24 detik. Worker trial kedua sengaja di-SIGKILL; TTL provider 2 menit menghapus resource, hilang dari daftar pada pengamatan 129.74 detik. Readback akhir: 0 sandbox dan 0 channel terbuka.
- Plafon trial US\$1 ditegakkan melalui admission/reservasi durable, snapshot fixed-size, satu resource aktif, deadline/TTL dan margin cleanup. Total reservasi US\$0.60; estimasi resource konservatif US\$0.070039, bukan invoice. Tidak ada model call, snapshot/volume/GPU baru, top-up atau upgrade. API key aplikasi tetap di control plane.
- make check, make build, enam kelompok offline fault checks, inventory route production dan scan credential baru lulus. Endpoint diagnostik tidak dipasang pada production.

## Batas dan keputusan adapter

Daytona diterima sebagai dasar adapter kode dan desktop bersama pada scope yang diuji. Gateway, control lease dan reconciliation tetap wajib pada [NG-035 · Eksekusi kode dalam sandbox](35-eksekusi-kode-dalam-sandbox.md) dan [NG-036 · Browser VNC live desktop dan takeover](36-browser-vnc-live-desktop-dan-takeover.md).
Akses internet umum belum diterima untuk konfigurasi akun ini: GitHub HTTP 200; [example.com](http://example.com) gagal TLS (curl 35 / HTTP 000). Penyebab pasti tidak ditetapkan; metadata tier/billing organisasi menolak API key dengan 401. Jangan menyimpulkan tier atau biaya invoice dari hasil ini. Batas jaringan dan auth situs perlu diverifikasi pada implementasi browser produk. Cap biaya trial merupakan envelope resource/reservasi, bukan setting wallet vendor yang menjamin berhenti tepat pada nominal dolar.
<!-- notion-content:end -->

## Catatan implementasi lokal

[Laporan penerimaan NG-031](../../engineering/daytona-31-acceptance.md) memuat implementasi, metode, bukti live dan batas pengujian. [Research awal](../../research/daytona-trial-31-2026-10-18.md) adalah snapshot sebelum eksekusi. Catatan ini berada di luar konten mirror Notion.
