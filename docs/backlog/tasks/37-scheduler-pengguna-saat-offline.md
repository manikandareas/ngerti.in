# NG-037 · Scheduler pengguna saat offline

Sumber: [Notion](https://app.notion.com/p/3fdabdd61873813a9603fb38d0df673f) · Readback: 2026-10-18T06:04:56.780944+00:00

| Property | Value |
| --- | --- |
| Ticket | 37 |
| Urutan | 12 |
| Lingkup | Aktif V1 |
| Status | Backlog |
| Prioritas | P0 |
| Area | Agent |
| Depends on | [NG-036 · Browser VNC live desktop dan takeover](36-browser-vnc-live-desktop-dan-takeover.md) · [NG-033 · Task background dan approval umum](33-task-background-dan-approval-umum.md) |

<!-- notion-content:start -->
Tujuan: Scheduler pengguna saat offline.
Lingkup: **Aktif V1**. Identitas NG-037; Urutan delivery 12.

## Acceptance criteria

- [ ] Schedule menyimpan intent, timezone IANA, recurrence/one-shot, revision, target thread, per-run cap, next_due; preview waktu dapat ditinjau.
- [ ] Occurrence unik schedule/revision/intended_at menciptakan satu task dan delivery; worker tetap berjalan saat browser pengguna tertutup.
- [ ] Default overlap skip saat occurrence terdahulu aktif, misfire coalesce satu occurrence terbaru, budget habis blocked_budget tanpa retry berbiaya.
- [ ] Edit/pause hanya mengubah future occurrence; user memilih stop task yang sudah berjalan secara eksplisit; P18/P19/P20/P23.

## Spesifikasi dan bukti

[04 · Arsitektur, Runtime & Kontrak](../../product/04-arsitektur-dan-delivery.md) · [REA-2 · Task & Scheduler](../../research/muse-ai-v1/evidence/task.md)

## Dependencies

[NG-036 · Browser VNC live desktop dan takeover](36-browser-vnc-live-desktop-dan-takeover.md) · [NG-033 · Task background dan approval umum](33-task-background-dan-approval-umum.md)

## Bukti penerimaan

**Belum diimplementasikan/diterima.** Saat dikerjakan, catat tanggal/environment/provider version, input, expected/actual, task/action/occurrence IDs, trace/screenshot dan biaya. Status Backlog bukan bukti kemampuan sudah tersedia.
Hard per-task/resource/account cap serta cost telemetry wajib ada sejak capability pertama digunakan; paket komersial menyusul benchmark.
<!-- notion-content:end -->
