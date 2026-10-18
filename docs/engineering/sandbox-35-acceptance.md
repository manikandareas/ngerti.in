# NG-035 · Penerimaan runtime kode

Tanggal **18 Oktober 2026**, development lokal macOS, Daytona target `eu`, SDK Python **0.225.0**, provider **v0.225.1**, snapshot `daytona-medium`. Implementasi mengikuti [tiket NG-035](../backlog/tasks/35-eksekusi-kode-dalam-sandbox.md) dan keputusan interface Python dengan Daytona sebagai adapter pertama.

## Cakupan yang diterima

| Kebutuhan | Hasil dan bukti |
| --- | --- |
| Runtime yang dapat diganti | `SandboxRuntime` Protocol dengan tipe aplikasi, pemilihan adapter terpusat dan dependency injection. `ControlledRuntime` menjalankan kontrak Task lengkap tanpa SDK/provider. [Desain](sandbox-runtime.md), [45 kontrak](evidence/sandbox-35/controlled-contracts.json). |
| P10 isolasi | Eksekusi UID 65534; environment hanya lima key allowlist; akses environment proses root, sudo, socket, socket child dan io_uring ditolak; hard limit tidak dapat dinaikkan. [Probe nyata](evidence/sandbox-35/runtime-probes.json). |
| P11 resource | Alokasi fixed-size, hard address-space 2 GiB, 64 proses, 10 MiB/file, log 16.000 byte. Alokasi berlebih gagal; busy loop dihentikan exit 124 dalam **2.292 detik** pada deadline dua detik. Symlink output ditolak. [Probe nyata](evidence/sandbox-35/runtime-probes.json). |
| P12 persistensi | Model nyata menghasilkan JSON dan Markdown dalam satu Task; kedua berkas diverifikasi dari object storage setelah sandbox dihapus. CSV juga tetap dapat dipreview/diunduh setelah cleanup dan review. [Readback](evidence/sandbox-35/live-readback.json). |
| P24 admission | Race pada cap uang global menghasilkan satu reservasi; cap akun, concurrency, batas sesi per Task, bucket UTC asal dan unknown create/TTL diuji dalam PostgreSQL sementara. [Kontrak](evidence/sandbox-35/controlled-contracts.json). |
| P27 input sebagai data | CSV fixture memuat instruksi mencuri secret/mengubah profil dalam sebuah sel; pekerjaan tetap menghasilkan agregasi yang diminta. Tidak ada credential atau tool mutasi domain dalam runtime kode. [Input](evidence/sandbox-35/penjualan.csv), [readback](evidence/sandbox-35/live-readback.json). |
| P07 stop | Tombol Hentikan task dipakai saat program nyata sedang menunggu 45 detik. Task menjadi cancelled, resource deleted terkonfirmasi dan delivery nol. Biaya yang sudah teramati tetap tercatat. [Readback](evidence/sandbox-35/live-readback.json). |
| Review, revisi dan chat | CSV ditinjau, ringkasan diedit ke revision 2, browser dibuka ulang, dan revision 2 disetujui. Chat yang sama menjawab 42 saat review menunggu; perhitungan CSV hanya memiliki satu model call dan satu dispatch. [Desktop](evidence/sandbox-35/desktop-review.png), [mobile](evidence/sandbox-35/mobile-review.png), [readback](evidence/sandbox-35/live-readback.json). |

## Walkthrough model nyata

Task CSV `8be567c6-212a-48c6-9563-4ee65ba8bf9c` dibuat melalui form Task dengan lampiran dan pengolahan Python. File output yang dipilih pada form adalah `hasil-1.csv`; `output_spec` mengikat nama/format keluaran. Dataset berisi enam baris, satu transaction_id duplikat, lima transaksi unik. Ekspektasi dan hasil aktual cocok: Januari 250, Februari 250, total 500. Perhitungan memakai Decimal dan hanya satu dispatch; extraction/review/revision/finalisasi menaikkan nomor execution tanpa menghitung ulang data.

Unduhan candidate dan unduhan hasil siap melalui browser mempunyai bytes dan SHA-256 yang sama dengan manifest: `c83648287f0819d35c6c1e2a221034d134048ff6c11858a6472348c16864930b`. Nilai lengkap diverifikasi oleh collector; [CSV hasil](evidence/sandbox-35/hasil-1.csv) dan [readback](evidence/sandbox-35/live-readback.json) menjadi sumber checksum bila perlu pemeriksaan ulang.

Task multi-file `290a623e-47e6-46ac-bf59-daa459a2ca28` menghasilkan `angka.json` dengan total 42 dan `laporan.md` melalui model dan Daytona nyata. Task P07 `b0ca364f-be31-4b37-af9d-718035d909fb` dibatalkan saat kode berjalan. Kedua Task sukses mempunyai satu delivery; Task batal tidak mempunyai delivery. Seluruh hasil sukses dipublikasikan setelah konfirmasi cleanup.

Walkthrough memakai akun Clerk development yang sudah ada, API/worker host, PostgreSQL/checkpoints dan MinIO lokal. Browser diperiksa pada **1280×900** dan **390×844**; mobile adalah emulasi viewport. Tidak ditemukan horizontal overflow pada review/result. Preview CSV memakai sheet File/Result yang ada; unduhan candidate dan hasil siap dicocokkan. [Preview mobile](evidence/sandbox-35/mobile-preview.png), [hasil mobile](evidence/sandbox-35/mobile-result.png). Reduced motion diaktifkan saat pemeriksaan akhir. Browser pengujian yang macet dihentikan secara terarah; sesi browser lain tidak disentuh.

## Biaya, latency dan batas bukti

Tiga Task model nyata mencatat **4.862 token confirmed**, satu panggilan model per Task, tanpa retry model pada walkthrough. Keempat sesi produk (termasuk probe runtime terkontrol) masing-masing mereservasi 36.000 micro USD. Estimasi penggunaan teramati untuk tiga Task adalah **USD 0,004279** dan probe runtime **USD 0,001433**, total **USD 0,005712**. Ini estimasi konservatif konfigurasi, **bukan invoice**. Token model tidak dikonversi ke biaya uang tanpa snapshot tarif model yang diterima.

Probe runtime terkontrol berlangsung 31,405 detik. `live-readback.json` memuat timestamps, duration receipt, policy/rate snapshot, reservasi, settlement dan status tiap percobaan. Empat resource diagnostik awal terpisah dari ledger produk memiliki ceiling reservasi agregat USD 0,056 dan semuanya dihapus. Pengujian awal ini menemukan perbedaan flag firewall dan enforcement aktual; [probe isolasi akhir](evidence/sandbox-35/preflight-isolation.json) membuktikan network=false sesudah filter kernel dipasang. Readback akhir provider mengonfirmasi **nol resource NG-035 tersisa**.

Lost acknowledgement, failed storage publication, owner/range/revision races, duplicate approval/job, bounded repair dan retry yang tidak menduplikasi hasil memakai adapter terkontrol. Ini dibedakan dari probe resource dan walkthrough provider nyata. Crash host/SIGKILL ulang pada runtime produk, penetrasi penuh, invoice vendor, deployment production, browser/VNC/takeover dan persistensi RAM tidak diklaim oleh penerimaan ini. Bukti TTL provider setelah SIGKILL dari [NG-031](daytona-31-acceptance.md) tetap rujukan trial, bukan uji ulang NG-035. Pemulihan menyeluruh mengikuti NG-023; browser mengikuti NG-036.

## Menjalankan dan memeriksa

```sh
make install
make migrate
make check
make build
make sandbox-inspect
make task-inspect
make files-inspect
make quota-inspect
make docs-check
```

Migrasi incremental **0004_sandbox_runtime** sudah diterapkan tanpa reset. Restart worker setelah perubahan Python/config; autoreload API tidak mereload worker. `SANDBOX_PROVIDER=daytona` memilih adapter pertama; cap akun/global dan snapshot harga disediakan pada `.env.example`. Mengganti rate memerlukan versi harga dan cap yang konsisten.

`make sandbox-inspect` menjalankan 45 skenario pada database sementara dan prefix MinIO milik fixture, lalu menghapus resource sementara. Gate Task 55, File 47 dan quota 46 skenario tetap lulus. Static gates mencakup Biome, TypeScript, Ruff dan mypy; build lulus. Probe berbayar hanya dijalankan eksplisit:

```sh
uv run --project apps/backend python scripts/probe_sandbox_runtime.py \
  --live --owner-file /path/to/private-owner.json --output .dev/runtime-probes.json
```

File owner berisi `owner_id` UUID akun development yang sah. Probe membuat satu Task/resource, memakai ledger produk, mencatat hasil dan mengonfirmasi cleanup. Jangan masukkan token/kredensial atau histori percakapan pribadi ke evidence. Dokumen/manifest Notion disinkronkan setelah exact readback dan empat view; tidak ada tiket lain yang diubah.
