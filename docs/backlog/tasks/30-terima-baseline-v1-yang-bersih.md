# NG-030 · Terima baseline V1 yang bersih

Sumber: [Notion](https://app.notion.com/p/3fdabdd61873819ebe51d0445fb7da4e) · Readback: 2026-10-18T06:04:56.780944+00:00

| Property | Value |
| --- | --- |
| Ticket | 30 |
| Urutan | 5 |
| Lingkup | Aktif V1 |
| Status | Done |
| Prioritas | P0 |
| Area | Fondasi |
| Depends on | [NG-029 · Buat baseline skema dan reset development](29-buat-baseline-skema-dan-reset-development.md) |

<!-- notion-content:start -->
Tujuan: Terima baseline V1 yang bersih.
Lingkup: **Aktif V1**. Identitas NG-030; Urutan delivery 5.

## Acceptance criteria

- [x] make check, make build dan probe ledger chat lulus setelah reset.
- [x] Browser nyata membuktikan login, main/side chat, respons model, refresh/replay, stop/retry serta tampilan desktop/mobile.
- [x] Worker crash/recovery, ownership, upload/download/delete dan quota rejection mempunyai bukti baru yang dicatat; bukti historis tidak otomatis dianggap lulus.
- [x] Seluruh fitur baru tetap bergantung pada kelulusan NG-030; tidak menggunakan trial Daytona sebelum gate ini Done.

## Spesifikasi dan bukti

[06 · Development, Operasi & Acceptance](../../engineering/development.md) · [REA-1 · Chat & Session](../../research/muse-ai-v1/evidence/chat.md)

## Dependencies

[NG-029 · Buat baseline skema dan reset development](29-buat-baseline-skema-dan-reset-development.md)

## Bukti penerimaan

[NG-030 · Bukti penerimaan baseline V1](../../engineering/baseline-v1-acceptance.md). Bukti repo: docs/engineering/evidence/baseline-v1/. Status mengikuti hasil pemeriksaan baru; tidak mengandalkan penerimaan #01–05.

## Hasil penerimaan 18 Oktober 2026

Lulus static/build, 46 skenario ledger, browser login/chat/replay/stop/retry, storage, 7 pemeriksaan ownership serta SIGKILL worker setelah checkpoint tersimpan. Detail/metode/batas: [NG-030 · Bukti penerimaan baseline V1](../../engineering/baseline-v1-acceptance.md). Seluruh fitur baru kini menunggu NG-031; trial Daytona belum dijalankan.
<!-- notion-content:end -->
