# NG-020 · Delivery proaktif per thread dan batas global

Sumber: [Notion](https://app.notion.com/p/3f8abdd618738137a8c9c719f5b64bc4) · Readback: 2026-10-18T06:04:56.780944+00:00

| Property | Value |
| --- | --- |
| Ticket | 20 |
| Urutan | 18 |
| Lingkup | Aktif V1 |
| Status | Backlog |
| Prioritas | P0 |
| Area | Agent |
| Depends on | [NG-019 · Kandidat proaktif dinamis dan reranking](19-kandidat-proaktif-dinamis-dan-reranking.md) · [NG-037 · Scheduler pengguna saat offline](37-scheduler-pengguna-saat-offline.md) |

<!-- notion-content:start -->
Tujuan: Delivery proaktif per thread dan batas global.
Lingkup: **Aktif V1**. Identitas NG-020; Urutan delivery 18.

## Acceptance criteria

- [ ] Global daily cap atomik per account, quiet hours, mute/snooze dan dedup lintas thread diterapkan lagi saat delivery.
- [ ] Satu kandidat menuju thread yang relevan; bukan broadcast; race dua worker tidak melampaui cap.
- [ ] Hasil yang memang dijadwalkan tetap tercatat dan mempunyai kebijakan delivery terpisah dari inisiatif proaktif; P21/P22/P23.

## Spesifikasi dan bukti

[03 · Perilaku Agent](../../product/03-agent.md) · [REA-2 · Task & Scheduler](../../research/muse-ai-v1/evidence/task.md)

## Dependencies

[NG-019 · Kandidat proaktif dinamis dan reranking](19-kandidat-proaktif-dinamis-dan-reranking.md) · [NG-037 · Scheduler pengguna saat offline](37-scheduler-pengguna-saat-offline.md)

## Bukti penerimaan

[NG-030 · Bukti penerimaan baseline V1](../../engineering/baseline-v1-acceptance.md). Bukti repo: docs/engineering/evidence/baseline-v1/. Status mengikuti hasil pemeriksaan baru; tidak mengandalkan penerimaan #01–05.
<!-- notion-content:end -->
