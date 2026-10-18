# NG-026 · Bersihkan domain dan runtime pembelajaran

Sumber: [Notion](https://app.notion.com/p/3fdabdd6187381adb916f976e9095a4d) · Readback: 2026-10-18T06:04:56.780944+00:00

| Property | Value |
| --- | --- |
| Ticket | 26 |
| Urutan | 1 |
| Lingkup | Aktif V1 |
| Status | Done |
| Prioritas | P0 |
| Area | Fondasi |
| Depends on | — |

<!-- notion-content:start -->
Tujuan: Bersihkan domain dan runtime pembelajaran.
Lingkup: **Aktif V1**. Identitas NG-026; Urutan delivery 1.

## Acceptance criteria

- [x] Package kontrak, validator, answer keys, handoff, CLI dan fixture konten pembelajaran dihapus dari aplikasi aktif.
- [x] Tool request_course dan penyimpanan tujuan Course dihapus; approval menyimpan name, args dan tool_call_id umum.
- [x] Chat, profile, checkpoint, queue dan ownership tetap lolos static checks; pemulihan kode lama melalui Git.

## Spesifikasi dan bukti

[04 · Arsitektur, Runtime & Kontrak](../../product/04-arsitektur-dan-delivery.md) · [REA-1 · Chat & Session](../../research/muse-ai-v1/evidence/chat.md)

## Dependencies

Tidak ada; gerbang cleanup pertama.

## Bukti penerimaan

[NG-030 · Bukti penerimaan baseline V1](../../engineering/baseline-v1-acceptance.md). Bukti repo: docs/engineering/evidence/baseline-v1/. Status mengikuti hasil pemeriksaan baru; tidak mengandalkan penerimaan #01–05.
<!-- notion-content:end -->
