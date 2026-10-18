# NG-036 · Browser VNC live desktop dan takeover

Sumber: [Notion](https://app.notion.com/p/3fdabdd618738198b295ca667c34f1b1) · Readback: 2026-10-18T06:04:56.780944+00:00

| Property | Value |
| --- | --- |
| Ticket | 36 |
| Urutan | 11 |
| Lingkup | Aktif V1 |
| Status | Backlog |
| Prioritas | P0 |
| Area | Agent |
| Depends on | [NG-035 · Eksekusi kode dalam sandbox](35-eksekusi-kode-dalam-sandbox.md) |

<!-- notion-content:start -->
Tujuan: Browser VNC live desktop dan takeover.
Lingkup: **Aktif V1**. Identitas NG-036; Urutan delivery 11.

## Acceptance criteria

- [ ] Pengguna melihat dan mengendalikan browser/desktop yang sama dengan agent melalui panel VNC dalam aplikasi.
- [ ] Backend mengatur control state agent/handoff/human/resuming dengan lease/version; takeover mencabut hak agent mengirim aksi.
- [ ] Aksi in-flight selesai/direkonsiliasi sebelum input manusia aktif; saat dikembalikan, input manusia dicabut dan agent membaca keadaan terbaru.
- [ ] Uji dua tab, dua owner, viewer expiry/revoke, disconnect/reconnect, stale commands, unknown external effect; tombol viewOnly bukan otorisasi backend.
- [ ] Workspace/hasil persisten; browser auth dan RAM/proses hanya dijanjikan sejauh bukti NG-031; budget/TTL dan cleanup aktif.

## Spesifikasi dan bukti

[02 · UX & User Flow](../../product/02-user-flow.md) · [REA-6 · Browser & Computer](../../research/muse-ai-v1/evidence/computer.md)

## Dependencies

[NG-035 · Eksekusi kode dalam sandbox](35-eksekusi-kode-dalam-sandbox.md)

## Bukti penerimaan

**Belum diimplementasikan/diterima.** Saat dikerjakan, catat tanggal/environment/provider version, input, expected/actual, task/action/occurrence IDs, trace/screenshot dan biaya. Status Backlog bukan bukti kemampuan sudah tersedia.
Hard per-task/resource/account cap serta cost telemetry wajib ada sejak capability pertama digunakan; paket komersial menyusul benchmark.
<!-- notion-content:end -->
