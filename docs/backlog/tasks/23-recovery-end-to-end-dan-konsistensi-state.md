# NG-023 · Recovery end-to-end dan konsistensi state

Sumber: [Notion](https://app.notion.com/p/3f8abdd6187381a78cd0f770a7db65d2) · Readback: 2026-10-18T06:04:56.780944+00:00

| Property | Value |
| --- | --- |
| Ticket | 23 |
| Urutan | 23 |
| Lingkup | Aktif V1 |
| Status | Backlog |
| Prioritas | P0 |
| Area | Release |
| Depends on | [NG-022 · Paket pengguna usage expiry dan downgrade](22-paket-pengguna-usage-expiry-dan-downgrade.md) · [NG-036 · Browser VNC live desktop dan takeover](36-browser-vnc-live-desktop-dan-takeover.md) · [NG-037 · Scheduler pengguna saat offline](37-scheduler-pengguna-saat-offline.md) · [NG-038 · Goals umum dengan evidence progress](38-goals-umum-dengan-evidence-progress.md) · [NG-020 · Delivery proaktif per thread dan batas global](20-delivery-proaktif-per-thread-dan-batas-global.md) |

<!-- notion-content:start -->
Tujuan: Recovery end-to-end dan konsistensi state.
Lingkup: **Aktif V1**. Identitas NG-023; Urutan delivery 23.

## Acceptance criteria

- [ ] Fault injection mencakup task/model/tool/sandbox/action/result/occurrence/delivery/usage dan checkpoint restart.
- [ ] Unknown external effect direkonsiliasi; lease lama tidak menulis, replay tidak menggandakan action/result/charge.
- [ ] Deploy dan restore mempertahankan hasil durable; resource vendor yang hilang mempunyai outcome terlihat; P06/P08/P29/P30.

## Spesifikasi dan bukti

[06 · Development, Operasi & Acceptance](../../engineering/development.md) · [REA-2 · Task & Scheduler](../../research/muse-ai-v1/evidence/task.md)

## Dependencies

[NG-022 · Paket pengguna usage expiry dan downgrade](22-paket-pengguna-usage-expiry-dan-downgrade.md) · [NG-036 · Browser VNC live desktop dan takeover](36-browser-vnc-live-desktop-dan-takeover.md) · [NG-037 · Scheduler pengguna saat offline](37-scheduler-pengguna-saat-offline.md) · [NG-038 · Goals umum dengan evidence progress](38-goals-umum-dengan-evidence-progress.md) · [NG-020 · Delivery proaktif per thread dan batas global](20-delivery-proaktif-per-thread-dan-batas-global.md)

## Bukti penerimaan

[NG-030 · Bukti penerimaan baseline V1](../../engineering/baseline-v1-acceptance.md). Bukti repo: docs/engineering/evidence/baseline-v1/. Status mengikuti hasil pemeriksaan baru; tidak mengandalkan penerimaan #01–05.
<!-- notion-content:end -->
