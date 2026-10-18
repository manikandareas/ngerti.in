# NG-029 · Buat baseline skema dan reset development

Sumber: [Notion](https://app.notion.com/p/3fdabdd61873818fb608fde942a00855) · Readback: 2026-10-18T06:04:56.780944+00:00

| Property | Value |
| --- | --- |
| Ticket | 29 |
| Urutan | 4 |
| Lingkup | Aktif V1 |
| Status | Done |
| Prioritas | P0 |
| Area | Fondasi |
| Depends on | [NG-028 · Sederhanakan kuota menjadi fondasi umum](28-sederhanakan-kuota-menjadi-fondasi-umum.md) |

<!-- notion-content:start -->
Tujuan: Buat baseline skema dan reset development.
Lingkup: **Aktif V1**. Identitas NG-029; Urutan delivery 4.

## Acceptance criteria

- [x] Satu migration head 0001_v1_baseline membuat database kosong tanpa migrasi historis dan tanpa tabel Course.
- [x] Reset memverifikasi APP_ENV, local endpoints, Compose project, container mounts dan volume labels sebelum menghapus dua volume ngertiin-v1.
- [x] PostgreSQL dan MinIO dibangun ulang; official Procrastinate schema dan PostgresSaver.setup dipakai; setup ulang idempoten.
- [x] Clerk, kredensial, Daytona serta resource environment lain tetap dipertahankan; readiness memakai migration head aktual.

## Spesifikasi dan bukti

[06 · Development, Operasi & Acceptance](../../engineering/development.md) · [REA-5 · Permissions](../../research/muse-ai-v1/evidence/permissions.md)

## Dependencies

[NG-028 · Sederhanakan kuota menjadi fondasi umum](28-sederhanakan-kuota-menjadi-fondasi-umum.md)

## Bukti penerimaan

[NG-030 · Bukti penerimaan baseline V1](../../engineering/baseline-v1-acceptance.md). Bukti repo: docs/engineering/evidence/baseline-v1/. Status mengikuti hasil pemeriksaan baru; tidak mengandalkan penerimaan #01–05.
<!-- notion-content:end -->
