# NG-023 · Recovery end-to-end dan konsistensi state

Sumber: [Notion](https://app.notion.com/p/3f8abdd6187381a78cd0f770a7db65d2) · Readback: 2026-10-19T13:56:22.261Z

| Property | Value |
| --- | --- |
| Ticket | 23 |
| Urutan | 23 |
| Lingkup | Aktif V1 |
| Status | Done |
| Prioritas | P0 |
| Area | Release |
| Depends on | [NG-022 · Paket pengguna usage expiry dan downgrade](22-paket-pengguna-usage-expiry-dan-downgrade.md) · [NG-036 · Browser VNC live desktop dan takeover](36-browser-vnc-live-desktop-dan-takeover.md) · [NG-037 · Scheduler pengguna saat offline](37-scheduler-pengguna-saat-offline.md) · [NG-038 · Goals umum dengan evidence progress](38-goals-umum-dengan-evidence-progress.md) · [NG-020 · Delivery proaktif per thread dan batas global](20-delivery-proaktif-per-thread-dan-batas-global.md) |

<!-- notion-content:start -->
Tujuan: Recovery end-to-end dan konsistensi state.
Lingkup: **Aktif V1**. Identitas NG-023; Urutan delivery 23.
## Acceptance criteria
- [x] Fault injection mencakup task/model/tool/sandbox/action/result/occurrence/delivery/usage dan checkpoint restart.
- [x] Unknown external effect direkonsiliasi; lease lama tidak menulis, replay tidak menggandakan action/result/charge.
- [x] Deploy dan restore mempertahankan hasil durable; resource vendor yang hilang mempunyai outcome terlihat; P06/P08/P29/P30.
## Spesifikasi dan bukti
[06 · Development, Operasi & Acceptance](../../engineering/development.md) · [REA-2 · Task & Scheduler](../../research/muse-ai-v1/evidence/task.md)
## Dependencies
[NG-022 · Paket pengguna usage expiry dan downgrade](22-paket-pengguna-usage-expiry-dan-downgrade.md) · [NG-036 · Browser VNC live desktop dan takeover](36-browser-vnc-live-desktop-dan-takeover.md) · [NG-037 · Scheduler pengguna saat offline](37-scheduler-pengguna-saat-offline.md) · [NG-038 · Goals umum dengan evidence progress](38-goals-umum-dengan-evidence-progress.md) · [NG-020 · Delivery proaktif per thread dan batas global](20-delivery-proaktif-per-thread-dan-batas-global.md)
## Penerimaan NG-023
Diterima development pada 19 Oktober 2026. Repo: `docs/engineering/recovery-23-acceptance.md`; runbook: `docs/engineering/recovery-runtime.md`; evidence: `docs/engineering/evidence/recovery-23/`.
41 kontrak recovery lulus: dua SIGKILL nyata sebelum checkpoint/publikasi, orphan Task/chat, rollback manifest/delivery, lease dan usage replay, compatibility workflow/jadwal, occurrence dedup dan dump/object restore terisolasi. Task55/File47/Computer47/Sandbox45/Schedule82/Usage48/Goal74/Proactivity105/Billing69/Entitlement49 lulus. make check/build dan pemeriksaan diff lulus.
Migrasi incremental 0016/0017 tanpa reset; worker dimuat ulang saat tidak ada Task/chat running. Restore menahan startup, memeriksa pasangan bucket, menolak pemakaian resource vendor yang masih ada, mempertahankan hasil durable dan memberi outcome ketika resource hilang. Jadwal dijeda dan efek dari snapshot tidak diputar ulang otomatis.
Walkthrough Brave terautentikasi desktop/mobile 390x844: dua state recovery sintetis, detail/reload dan kontrol yang sesuai. Hasil Markdown lama tetap dapat dibuka setelah migrasi. Lookup Daytona absent nyata memakai operasi read-only tanpa membuat resource.
Batas: lifecycle restore provider/model/tool faults memakai adapter terkontrol; SIGKILL, PostgreSQL, MinIO dan lookup absent nyata dibedakan. Production R2, rolling deploy production dan invoice belum diklaim. NG-041 tetap gate benchmark; NG-025 tetap gate release.
## Bukti penerimaan baseline
[NG-030 · Bukti penerimaan baseline V1](../../engineering/baseline-v1-acceptance.md). Bukti repo: docs/engineering/evidence/baseline-v1/. Status mengikuti hasil pemeriksaan baru; tidak mengandalkan penerimaan #01–05.
<!-- notion-content:end -->
