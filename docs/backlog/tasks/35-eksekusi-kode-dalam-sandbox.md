# NG-035 · Eksekusi kode dalam sandbox

Sumber: [Notion](https://app.notion.com/p/3fdabdd6187381948c64cf1f828a90c8) · Readback: 2026-10-18T06:04:56.780944+00:00

| Property | Value |
| --- | --- |
| Ticket | 35 |
| Urutan | 10 |
| Lingkup | Aktif V1 |
| Status | Backlog |
| Prioritas | P0 |
| Area | Agent |
| Depends on | [NG-031 · Validasi Daytona dengan trial terbatas](31-validasi-daytona-dengan-trial-terbatas.md) · [NG-033 · Task background dan approval umum](33-task-background-dan-approval-umum.md) · [NG-034 · File produk dan hasil tersimpan](34-file-produk-dan-hasil-tersimpan.md) |

<!-- notion-content:start -->
Tujuan: Eksekusi kode dalam sandbox.
Lingkup: **Aktif V1**. Identitas NG-035; Urutan delivery 10.

## Acceptance criteria

- [ ] Agent menjalankan kode melalui adapter Daytona terikat owner/task; host worker dan secret control plane tidak diberikan ke kode.
- [ ] Runtime/CPU/RAM/disk/egress/output caps, cancellation, timeout dan cleanup terkonfirmasi sebelum penggunaan nyata.
- [ ] Code dari input file dianggap data; hasil dipersist sebelum success dan retry tidak menggandakan publikasi.
- [ ] Uji analisis CSV hingga download serta P10/P11/P12/P24/P27; catat latency dan actual cost termasuk retry.

## Spesifikasi dan bukti

[04 · Arsitektur, Runtime & Kontrak](../../product/04-arsitektur-dan-delivery.md) · [REA-6 · Browser & Computer](../../research/muse-ai-v1/evidence/computer.md)

## Dependencies

[NG-031 · Validasi Daytona dengan trial terbatas](31-validasi-daytona-dengan-trial-terbatas.md) · [NG-033 · Task background dan approval umum](33-task-background-dan-approval-umum.md) · [NG-034 · File produk dan hasil tersimpan](34-file-produk-dan-hasil-tersimpan.md)

## Bukti penerimaan

**Belum diimplementasikan/diterima.** Saat dikerjakan, catat tanggal/environment/provider version, input, expected/actual, task/action/occurrence IDs, trace/screenshot dan biaya. Status Backlog bukan bukti kemampuan sudah tersedia.
Hard per-task/resource/account cap serta cost telemetry wajib ada sejak capability pertama digunakan; paket komersial menyusul benchmark.
<!-- notion-content:end -->
