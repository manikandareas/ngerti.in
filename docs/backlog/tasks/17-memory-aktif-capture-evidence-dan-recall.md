# Memory aktif: capture, evidence dan recall

Sumber: [Notion](https://app.notion.com/p/3f8abdd618738151a38ffb012be2c9ce)

Status: **Backlog** · Prioritas: **P0** · Area: **Agent** · Urutan: **17**

Depends on:

- [Chat personal: thread dan streaming resumable](04-chat-personal-thread-dan-streaming-resumable.md)
- [Practice: review jawaban salah dan unlock](12-practice-review-jawaban-salah-dan-unlock.md)
- [Perubahan soul atas permintaan dan HITL](16-perubahan-soul-atas-permintaan-dan-hitl.md)

<!-- notion-content:start -->
## Hasil

Agent mengingat profil dan pengamatan relevan dari history/event.

## Acceptance criteria

- [ ] Capture membedakan pernyataan pengguna, fakta domain dan inferensi; entry menyimpan evidence, scope dan waktu.
- [ ] Update/deduplikasi/supersede aman terhadap retry dan revisi; nilai/progress/reward tetap milik domain aplikasi.
- [ ] Memory relevan tersedia pada interaksi berikutnya dengan budget konteks terukur dan isolasi akun.
- [ ] Pengguna dapat mengoreksi atau meminta forgetting melalui chat; sumber yang sama tidak langsung menghidupkan memory dilupakan.

## Spesifikasi

[03 · Agent](../../product/03-agent.md)
<!-- notion-content:end -->
