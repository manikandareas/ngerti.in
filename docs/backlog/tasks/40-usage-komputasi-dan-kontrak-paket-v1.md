# NG-040 · Usage komputasi dan kontrak paket V1

Sumber: [Notion](https://app.notion.com/p/3fdabdd6187381639bd6f377668ee2f3) · Readback: 2026-10-18T06:04:56.780944+00:00

| Property | Value |
| --- | --- |
| Ticket | 40 |
| Urutan | 20 |
| Lingkup | Aktif V1 |
| Status | Backlog |
| Prioritas | P0 |
| Area | Billing |
| Depends on | [NG-039 · Library pencarian dan penemuan kemampuan](39-library-pencarian-dan-penemuan-kemampuan.md) |

<!-- notion-content:start -->
Tujuan: Usage komputasi dan kontrak paket V1.
Lingkup: **Aktif V1**. Identitas NG-040; Urutan delivery 20.

## Acceptance criteria

- [ ] Telemetry model/tool/sandbox/storage/retry memakai dedup identity dan snapshot price/policy version; bedakan estimated/confirmed/unknown.
- [ ] Hard parent/task/account caps sudah terpasang sejak NG-033/035/036/037; tambah public allowance/estimate dan reserve-cap/settle-actual setelah benchmark awal.
- [ ] Approval/replay/stop/memory controls tidak menjadi pesan berbayar baru; quota UI menjelaskan charge, budget blocking, refund dan reset.
- [ ] Harga dan allowance komersial diputuskan dari biaya nyata, bukan mewarisi harga paket belajar; P24/P25/P26.

## Spesifikasi dan bukti

[05 · Usage, Paket & Pembayaran](../../product/05-usage-paket-pembayaran.md) · [REA-5 · Permissions](../../research/muse-ai-v1/evidence/permissions.md)

## Dependencies

[NG-039 · Library pencarian dan penemuan kemampuan](39-library-pencarian-dan-penemuan-kemampuan.md)

## Bukti penerimaan

**Belum diimplementasikan/diterima.** Saat dikerjakan, catat tanggal/environment/provider version, input, expected/actual, task/action/occurrence IDs, trace/screenshot dan biaya. Status Backlog bukan bukti kemampuan sudah tersedia.
Hard per-task/resource/account cap serta cost telemetry wajib ada sejak capability pertama digunakan; paket komersial menyusul benchmark.
<!-- notion-content:end -->
