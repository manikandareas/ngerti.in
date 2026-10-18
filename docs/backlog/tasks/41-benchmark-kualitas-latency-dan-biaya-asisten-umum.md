# NG-041 · Benchmark kualitas latency dan biaya asisten umum

Sumber: [Notion](https://app.notion.com/p/3fdabdd6187381f8ade2c7db2c75396e) · Readback: 2026-10-18T06:04:56.780944+00:00

| Property | Value |
| --- | --- |
| Ticket | 41 |
| Urutan | 24 |
| Lingkup | Aktif V1 |
| Status | Backlog |
| Prioritas | P0 |
| Area | Release |
| Depends on | [NG-023 · Recovery end-to-end dan konsistensi state](23-recovery-end-to-end-dan-konsistensi-state.md) |

<!-- notion-content:start -->
Tujuan: Benchmark kualitas latency dan biaya asisten umum.
Lingkup: **Aktif V1**. Identitas NG-041; Urutan delivery 24.

## Acceptance criteria

- [ ] Corpus mencakup chat/file/code/browser/takeover/offline schedules/memory/goals/proactivity; catat kualitas, p50/p95, lifecycle cost dan failure recovery.
- [ ] Laporkan owner/environment/provider/model/price version, input, trace, actual-vs-estimate dan batas verifikasi.
- [ ] Bandingkan total biaya dengan allowance/paket, termasuk idle disk, retry, background evaluators dan retention; tidak memakai benchmark Course sebagai gate.

## Spesifikasi dan bukti

[05 · Usage, Paket & Pembayaran](../../product/05-usage-paket-pembayaran.md) · [REA-6 · Browser & Computer](../../research/muse-ai-v1/evidence/computer.md)

## Dependencies

[NG-023 · Recovery end-to-end dan konsistensi state](23-recovery-end-to-end-dan-konsistensi-state.md)

## Bukti penerimaan

**Belum diimplementasikan/diterima.** Saat dikerjakan, catat tanggal/environment/provider version, input, expected/actual, task/action/occurrence IDs, trace/screenshot dan biaya. Status Backlog bukan bukti kemampuan sudah tersedia.
<!-- notion-content:end -->
