# NG-031 · Validasi Daytona dengan trial terbatas

Sumber: [Notion](https://app.notion.com/p/3fdabdd61873810a91b6f2e80f3fa704) · Readback: 2026-10-18T06:04:56.780944+00:00

| Property | Value |
| --- | --- |
| Ticket | 31 |
| Urutan | 6 |
| Lingkup | Aktif V1 |
| Status | Ready |
| Prioritas | P0 |
| Area | Fondasi |
| Depends on | [NG-030 · Terima baseline V1 yang bersih](30-terima-baseline-v1-yang-bersih.md) |

<!-- notion-content:start -->
Tujuan: Validasi Daytona dengan trial terbatas.
Lingkup: **Aktif V1**. Identitas NG-031; Urutan delivery 6.

## Acceptance criteria

- [ ] Catat konfigurasi, trial budget, SDK/provider version dan latency dari koneksi pengguna.
- [ ] Buktikan shell/kode/browser, VNC, live desktop dan takeover pada sandbox serta session yang sama.
- [ ] Uji dua owner, expiry URL, revoke, idle stop, reconnect, workspace/file persistence dan recovery; bedakan disk dengan RAM/proses.
- [ ] Hard runtime/cost cap dan cleanup resource terkonfirmasi; hasil pengujian menentukan adapter berikutnya, tidak menjanjikan persistensi RAM.

## Spesifikasi dan bukti

[04 · Arsitektur, Runtime & Kontrak](../../product/04-arsitektur-dan-delivery.md) · [REA-6 · Browser & Computer](../../research/muse-ai-v1/evidence/computer.md)

## Dependencies

[NG-030 · Terima baseline V1 yang bersih](30-terima-baseline-v1-yang-bersih.md)

## Bukti penerimaan

**Belum diimplementasikan/diterima.** Saat dikerjakan, catat tanggal/environment/provider version, input, expected/actual, task/action/occurrence IDs, trace/screenshot dan biaya. Status Ready berarti dependencies telah Done; kemampuan Daytona tetap belum diuji atau diterima.
Hard per-task/resource/account cap serta cost telemetry wajib ada sejak capability pertama digunakan; paket komersial menyusul benchmark.
<!-- notion-content:end -->
