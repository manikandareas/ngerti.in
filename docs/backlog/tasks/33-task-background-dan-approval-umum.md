# NG-033 · Task background dan approval umum

Sumber: [Notion](https://app.notion.com/p/3fdabdd6187381ba979ac9f219c55a5a) · Readback: 2026-10-18T06:04:56.780944+00:00

| Property | Value |
| --- | --- |
| Ticket | 33 |
| Urutan | 8 |
| Lingkup | Aktif V1 |
| Status | Backlog |
| Prioritas | P0 |
| Area | Agent |
| Depends on | [NG-032 · Shell onboarding dan walkthrough asisten umum](32-shell-onboarding-dan-walkthrough-asisten-umum.md) |

<!-- notion-content:start -->
Tujuan: Task background dan approval umum.
Lingkup: **Aktif V1**. Identitas NG-033; Urutan delivery 8.

## Acceptance criteria

- [ ] Task/execution terpisah dari chat turn; pengguna dapat chat pada thread asal saat task berjalan atau menunggu keputusan.
- [ ] Intent/input snapshot, target/revision, exact approval, idempotency, lease fencing, stop/retry dan unknown effect outcome disimpan.
- [ ] Simpan task + budget + enqueue atomik; model/network call di luar transaksi; waiting_user tidak menahan worker berbayar.
- [ ] Hasil/progress/delivery durable dan sekali; uji P02–P08, P09 serta P24–P27; hard budget internal dimulai di sini.

## Spesifikasi dan bukti

[04 · Arsitektur, Runtime & Kontrak](../../product/04-arsitektur-dan-delivery.md) · [REA-2 · Task & Scheduler](../../research/muse-ai-v1/evidence/task.md)

## Dependencies

[NG-032 · Shell onboarding dan walkthrough asisten umum](32-shell-onboarding-dan-walkthrough-asisten-umum.md)

## Bukti penerimaan

**Belum diimplementasikan/diterima.** Saat dikerjakan, catat tanggal/environment/provider version, input, expected/actual, task/action/occurrence IDs, trace/screenshot dan biaya. Status Backlog bukan bukti kemampuan sudah tersedia.
<!-- notion-content:end -->
