# NG-031 · Penerimaan trial Daytona

Tanggal: **18 Oktober 2026**. Acuan: [tiket NG-031](../backlog/tasks/31-validasi-daytona-dengan-trial-terbatas.md) dan [kontrak runtime V1](../product/04-arsitektur-dan-delivery.md). Seluruh empat acceptance criteria telah diuji pada resource nyata. Ini penerimaan trial diagnostik; integrasi Task, File/Result, tools agent produk dan UI computer production tetap mengikuti NG-033–036.

## Hasil penerimaan

| Kriteria Notion | Hasil aktual | Bukti |
| --- | --- | --- |
| Konfigurasi, versi, budget dan latency | SDK Python 0.225.0; provider v0.225.1; target `eu`; snapshot `daytona-medium`, 2 vCPU / 4 GiB / 8 GiB. Plafon trial US$1; reservasi agregat dua akun US$0.60. | [Summary](evidence/daytona-31/summary.json), [konfigurasi isolasi](evidence/daytona-31/isolation-config.json) |
| Shell/kode/browser/VNC/live desktop/takeover pada sesi sama | Shell exit 0, Python menghasilkan 42, upload/download identik. Computer Use mengetik marker pada Chromium; viewer menampilkan marker tersebut; input manusia melalui VNC menambahkan `human` dan menyimpan pada profile yang sama. | [Shell](evidence/daytona-31/shell.json), [capabilities](evidence/daytona-31/capabilities.json), [agent](evidence/daytona-31/workbench-agent.png), [manusia](evidence/daytona-31/workbench-human.png), [layar provider](evidence/daytona-31/human-desktop.png) |
| Dua owner, expiry/revoke, idle, reconnect, persistence dan recovery | Dua akun Clerk berbeda. Akses lintas owner ditolak 409; sesi asing tidak tampil. Gateway menutup koneksi aktif dan menolak reconnect setelah revoke/expiry. Idle-stop teramati pada 76.02 detik; restart 2.191 detik; hash file sama dan proses RAM hilang. | [Dua owner](evidence/daytona-31/two-owner.json), [admission global](evidence/daytona-31/global-admission.json), [gateway](evidence/daytona-31/gateway-expiry-revoke.json), [lifecycle](evidence/daytona-31/lifecycle.json), [profile setelah restart](evidence/daytona-31/after-restart-profile.png) |
| Runtime/cost cap dan cleanup terkonfirmasi | Command dihentikan pada 21.24 detik, exit 124. Satu resource aktif global; reservasi tidak direfund ketika proses restart atau resource dihapus. Worker kedua di-SIGKILL; TTL 2 menit menghapus sandbox, hilang dari daftar pada pengamatan 129.74 detik. Readback akhir: 0 sandbox, 0 channel terbuka. | [Timeout](evidence/daytona-31/command-timeout.json), [TTL setelah SIGKILL](evidence/daytona-31/ttl-worker-crash.json), [cleanup utama](evidence/daytona-31/cleanup-main.json), [enam kelompok fault checks](evidence/daytona-31/offline-faults.json) |

Host pengujian adalah macOS pada workspace pengguna; timezone Asia/Makassar. ISP dan lokasi fisik koneksi tidak dikumpulkan. Angka latency berasal dari koneksi host ini ke target `eu`, bukan benchmark seluruh Indonesia atau p95. Provision termasuk preflight memerlukan [3.572 detik](evidence/daytona-31/provisioning.json); Python 0.988 detik; upload/download 0.491 detik. Banner viewer gateway pada dua probe memerlukan 3.637 dan 3.886 detik. [Capabilities](evidence/daytona-31/capabilities.json), [gateway](evidence/daytona-31/gateway-expiry-revoke.json).

## Implementasi yang tersedia

- `apps/backend/src/ngertiin/daytona_trial/`: adapter SDK terbatas, ledger SQLite lokal `.dev/daytona-trial.sqlite3`, CLI, fixture desktop, capability/lifecycle/TTL probes, gateway WebSocket dan parser RFB.
- `/dev/daytona` pada web: workbench dengan autentikasi Clerk, viewer, pergantian kendali, revoke dan cleanup. Router API hanya dipasang ketika development diagnostics aktif; inventory route production telah diperiksa tidak memuat endpoint ini.
- State `agent → handoff → human → resuming → agent`, revisi monoton, satu aksi in-flight dan satu channel viewer. Transisi menunggu penyelesaian aksi serta penutupan upstream; resume mengambil screenshot baru sebelum lease agent aktif. Outcome tidak pasti memblokir dispatch berikutnya. [Race](evidence/daytona-31/control-race.json), [event gateway](evidence/daytona-31/gateway-events.json).
- Owner berasal dari sesi Clerk yang diverifikasi server. Cookie viewer HttpOnly, SameSite Strict, berumur maksimal 60 detik; grant tersimpan sebagai hash secret dan terikat owner/session/revisi. Mint baru membatalkan grant sebelumnya. API key dan signed preview URL tetap di backend.
- Parser RFB memeriksa stream terfragmentasi dan memblokir keyboard, pointer, clipboard serta QEMU key event di luar lease manusia. Client `viewOnly` tetap false selama trial sehingga enforcement backend yang diuji.
- Snapshot fixed-size diverifikasi sebelum provisioning. Maksimal satu sandbox aktif lintas owner; TTL 1–30 menit; batas output command 16 KB, screenshot harness 2 MiB dan fixture file 24 byte, batas ukuran pesan, deadline command dan batas proses. Code trial deterministik; tidak ada loop model, snapshot/volume/GPU baru, upgrade atau top-up.

SQLite ini state operator untuk trial lokal, terpisah dari schema/domain produksi. Ia bukan implementasi SandboxSession production atau pengganti PostgreSQL, LangGraph maupun Procrastinate. Setelah gateway crash, channel yang belum mendapat konfirmasi close sengaja memblokir transisi; operator melakukan cleanup resource yang direkonsiliasi. Pemulihan multi-worker untuk produk tetap memerlukan lease/reconciliation NG-035/036/023.

## Temuan yang menentukan adapter berikutnya

1. **Signed URL tidak cukup untuk mencabut channel aktif.** HTTP sesudah revoke dan expiry mengembalikan 401, tetapi WebSocket provider yang telah terbuka masih menerima balasan. Gateway Ngertiin menutup channel dengan code 1008; pengamatan revoke 255 ms setelah banner dan expiry 10 detik pada 10.475 detik sejak request mint. Koneksi baru ditolak. [Probe vendor](evidence/daytona-31/signed-preview.json), [probe gateway](evidence/daytona-31/gateway-expiry-revoke.json). Perbedaan ini menjadi alasan mempertahankan proxy dan pemeriksaan lease, sesuai [kontrak Preview vendor](https://www.daytona.io/docs/en/preview/).
2. **Disk/profile terbukti bertahan; RAM/proses tidak.** Hash file 24 byte tetap `37d7bcb75135c80d5f9513e0ac7f9f731f8013cadbb6d2fbcbe1d11086fb4027`. Proses `ng031-ram-probe` hilang setelah stop/start. Marker localStorage sintetis pulih setelah Chromium dibuka kembali; ini tidak membuktikan login situs pihak ketiga atau koneksi jaringan akan pulih. [File hasil recovery](evidence/daytona-31/recovered-workspace.txt), [profile](evidence/daytona-31/after-restart-profile.png). Tidak ada janji persistensi RAM container.
3. **Preview aktif tidak menjaga sandbox dari idle-stop.** Lifecycle vendor perlu dibaca terpisah dari aktivitas viewer; adapter produk harus menetapkan kapan refresh activity sah dan tetap mempertahankan TTL absolut. [Lifecycle SDK](https://www.daytona.io/docs/en/sandboxes/#automated-lifecycle-management).
4. **Akses internet umum belum diterima untuk akun ini.** GitHub menghasilkan HTTP 200; `example.com` gagal TLS, curl exit 35 / HTTP 000. Penyebab pastinya tidak ditetapkan dari uji ini. Metadata tier/billing organisasi menolak API key dengan 401. Jangan menyamakan kegagalan ini dengan bukti tier tertentu; kelayakan tujuan web produk tetap perlu verifikasi akun/provider sebelum NG-036 dipasarkan. [Network evidence](evidence/daytona-31/network.json), [kebijakan jaringan vendor](https://www.daytona.io/docs/en/network-limits/).
5. **Stop/delete provider berbeda dari timeout HTTP.** Tidak ada retry create otomatis setelah outcome tidak pasti. Nama resource deterministik dan reservasi durable memblokir provisioning berikutnya sampai reconciliation/cleanup terkonfirmasi. TTL provider tetap aktif setelah worker lokal mati; tidak diperpanjang saat reconnect.

Keputusan: Daytona diterima sebagai dasar adapter kode dan desktop bersama pada scope yang diuji, dengan gateway dan control lease sebagai kewajiban aplikasi. Akses web umum serta auth situs tidak dinyatakan lulus. Hasil trial ini memenuhi gerbang NG-031 dan memberi batas untuk implementasi NG-035/036.

## Biaya dan batas operasional

Dua resource dibuat secara berurutan: sesi utama owner A dan sesi TTL owner B. Reservasi account trial agregat US$0.60 dari plafon US$1, tetap terpakai pada ledger setelah cleanup; ledger tidak direset otomatis. Penolakan resource aktif kedua dan penolakan reservasi yang melebihi plafon diuji. Tidak ada aplikasi/model credential di sandbox. [Summary](evidence/daytona-31/summary.json), [admission](evidence/daytona-31/global-admission.json), [isolasi](evidence/daytona-31/isolation-config.json).

Estimasi konservatif resource adalah **US$0.070039**, menghitung seluruh 1,384.95 detik sesi utama dan 129.74 detik sesi TTL sebagai running, termasuk interval stopped, serta seluruh disk 8 GiB. Rumus menggunakan snapshot harga publik Linux: `2×0.0504 + 4×0.0162 + 8×0.000108` USD/jam. Mengabaikan free disk membuat estimasi konservatif. Ini **estimasi, bukan invoice**; endpoint billing organisasi tidak dapat diakses oleh API key yang tersedia. [Pricing](https://www.daytona.io/pricing), [Billing](https://www.daytona.io/docs/en/billing/).

Cap biaya trial ditegakkan melalui admission/reservasi, alokasi fixed-size, jumlah resource, deadline dan provider TTL dengan margin cleanup 2 menit; bukan setting wallet vendor yang mengklaim berhenti tepat pada nominal dolar. Runtime/cleanup aktual diuji lewat fault injection. Resource, model dan egress untuk workload produk yang lebih luas tetap memerlukan policy NG-035/036/040; trial tidak menguji kode adversarial atau unduhan internet tanpa batas.

## Menjalankan ulang

Konfigurasi `DAYTONA_API_KEY`, `DAYTONA_API_URL`, optional `DAYTONA_TARGET` dibaca dari `.env` root dan tidak dikirim ke frontend/sandbox. Jalankan `make install` untuk dependency development.

```bash
make daytona-preflight
make daytona-inspect
uv run --project apps/backend python -m ngertiin.daytona_trial list
```

Provisioning selalu eksplisit melalui workbench atau CLI `create --owner <account-id> --ttl <1-30>`. CLI juga menyediakan `setup`, `exec`, `probe`, `screenshot`, `control`, `lifecycle`, `ttl-probe`, dan `cleanup`; command yang bekerja pada resource memerlukan `--owner` dan `--session`, dengan output probe diarahkan ke direktori evidence melalui `--output`. `ttl-probe` sengaja membunuh child worker miliknya sendiri dan membuat resource 2 menit. Jangan menghapus ledger untuk melewati plafon; trial baru memerlukan peninjauan budget operator.

Validasi akhir: `make check`, `make build`, enam kelompok offline fault checks, inventory route production, scan credential baru, serta readback resource cleanup. Screenshot dan trace berada di [direktori evidence](evidence/daytona-31/summary.json). Verifikasi status Notion, empat view dan hash mirror dilakukan setelah publikasi hasil penerimaan.
