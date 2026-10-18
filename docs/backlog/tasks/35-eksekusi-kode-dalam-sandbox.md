# NG-035 · Eksekusi kode dalam sandbox

Sumber: [Notion](https://app.notion.com/p/3fdabdd6187381948c64cf1f828a90c8) · Readback: 2026-10-18T15:44:00.527Z

| Property | Value |
| --- | --- |
| Ticket | 35 |
| Urutan | 10 |
| Lingkup | Aktif V1 |
| Status | Done |
| Prioritas | P0 |
| Area | Agent |
| Depends on | [NG-031 · Validasi Daytona dengan trial terbatas](31-validasi-daytona-dengan-trial-terbatas.md) · [NG-033 · Task background dan approval umum](33-task-background-dan-approval-umum.md) · [NG-034 · File produk dan hasil tersimpan](34-file-produk-dan-hasil-tersimpan.md) |

<!-- notion-content:start -->
Tujuan: Eksekusi kode melalui interface runtime milik Ngertiin; Daytona menjadi adapter pertama yang dapat diganti sesuai kontrak.

Lingkup: **Aktif V1**. Identitas NG-035; Urutan delivery 10.

## Acceptance criteria

- [x] Agent menjalankan kode melalui interface Python SandboxRuntime dengan adapter Daytona terikat owner/task; host worker dan secret control plane tidak diberikan ke kode.
- [x] Runtime/CPU/RAM/disk/egress/output caps, cancellation, timeout dan cleanup terkonfirmasi sebelum penggunaan nyata.
- [x] Code dari input file dianggap data; hasil dipersist sebelum success dan retry tidak menggandakan publikasi.
- [x] Uji analisis CSV hingga download serta P10/P11/P12/P24/P27; catat latency dan actual cost termasuk retry.

## Spesifikasi dan bukti

[04 · Arsitektur, Runtime & Kontrak](../../product/04-arsitektur-dan-delivery.md) · [REA-6 · Browser & Computer](../../research/muse-ai-v1/evidence/computer.md)

## Dependencies

[NG-031 · Validasi Daytona dengan trial terbatas](31-validasi-daytona-dengan-trial-terbatas.md) · [NG-033 · Task background dan approval umum](33-task-background-dan-approval-umum.md) · [NG-034 · File produk dan hasil tersimpan](34-file-produk-dan-hasil-tersimpan.md)

## Bukti penerimaan

Diterima lokal pada **2026-10-18**. Laporan repo `docs/engineering/sandbox-35-acceptance.md`, desain interface `docs/engineering/sandbox-runtime.md`, evidence `docs/engineering/evidence/sandbox-35/`. Migrasi incremental `0004_sandbox_runtime` sudah diterapkan tanpa reset.

Interface Python `SandboxRuntime` memakai tipe aplikasi, dependency injection dan pemilihan adapter terpusat; Daytona menjadi adapter produksi pertama. SDK tidak masuk ke Task/Agent/File/Result. Kontrak lengkap berjalan dengan adapter terkontrol tanpa credential Daytona. Provider lain/self-hosted belum diimplementasikan.

Daytona SDK0.225.0/provider v0.225.1, snapshot daytona-medium 2vCPU/4GiB/8GiB. Program UID65534, no-new-privs, environment allowlist, hard limits dan filter syscall kernel; socket/child socket, sudo, environment proses root dan io_uring ditolak. Flag firewall provider saja ternyata masih mengizinkan koneksi pada akun ini, sehingga enforcement kernel wajib dan fail-closed. Busy loop berhenti exit124 dalam2.292detik; memory/file oversize gagal; symlink output ditolak.

CSV nyata Task `8be567c6-212a-48c6-9563-4ee65ba8bf9c`: enam baris, satu duplikasi, lima transaksi unik, Januari250/Februari250/total500. Ringkasan diedit ke revision2 dan disetujui; satu model call/satu dispatch, unduhan candidate dan hasil siap cocok SHA-256 setelah sandbox dihapus. Chat yang sama tetap menjawab saat review menunggu. Task `290a623e-47e6-46ac-bf59-daa459a2ca28` menghasilkan JSON+Markdown dengan model/Daytona nyata. P07 Task `b0ca364f-be31-4b37-af9d-718035d909fb` dibatalkan lewat UI saat kode berjalan: cleanup confirmed dan nol delivery.

Policy awal: command60detik, Task300detik, TTL maksimal10menit plus margin reservasi120detik; tiga dispatch/tiga sesi per Task, satu resource/akun dan dua global. Output10file/25MiB, log16000byte. Reservasi36.000microUSD/sesi, cap108.000/Task, 1.000.000/akun/UTC dan5.000.000/global/UTC. Unknown menahan reservasi dan tidak didispatch ulang; penolakan pasti sebelum alokasi berbiaya resource nol. Review/finalisasi tidak menghitung ulang kode.

45 kontrak terkontrol lulus untuk ownership, range/revision, fake adapter, admission race, original UTC bucket, lost ack, cleanup, code repair, hasil gagal/partial dan retry publication. Regresi Task55/File47/quota46, make check/build dan walkthrough1280x900/390x844/320x640 lulus; mobile adalah emulasi viewport. Reduced motion dan download/preview diperiksa.

Tiga Task model mencatat4.862token confirmed. Estimasi konservatif resource tiga Task USD0.004279 ditambah probe runtime USD0.001433; token model tidak dikonversi ke uang tanpa snapshot tarif yang diterima. Empat resource diagnostik awal terpisah memiliki ceiling agregat USD0.056 dan sudah dihapus. Invoice provider belum diverifikasi; usage aktual dan status estimated/confirmed/unknown dibedakan. Readback akhir provider: nol resource NG-035 tersisa. Crash/SIGKILL produk, provider produksi kedua, browser/VNC/takeover dan RAM persistence tidak diklaim; NG-036/NG-023/NG-040 tetap mengikuti scope masing-masing.

Hard per-task/resource/account cap serta cost telemetry wajib ada sejak capability pertama digunakan; paket komersial menyusul benchmark.
<!-- notion-content:end -->
