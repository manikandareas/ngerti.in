# Delivery proaktif per thread dan batas global

Sumber: [Notion](https://app.notion.com/p/3f8abdd618738137a8c9c719f5b64bc4)

Status: **Backlog** · Prioritas: **P0** · Area: **Agent** · Urutan: **20**

Depends on:

- [Chat personal: thread dan streaming resumable](04-chat-personal-thread-dan-streaming-resumable.md)
- [Kuota Course, chat dan materi per periode](05-kuota-course-chat-dan-materi-per-periode.md)
- [Pengayaan opsional dalam Course](13-pengayaan-opsional-dalam-course.md)
- [Kandidat proaktif dinamis dan reranking](19-kandidat-proaktif-dinamis-dan-reranking.md)

<!-- notion-content:start -->
## Hasil

Pesan assistant proaktif hadir pada thread yang tepat dengan timing yang disepakati.

## Acceptance criteria

- [ ] Main chat, side chat dan thread Course menerima pesan sesuai konteks; satu kandidat tidak dibroadcast.
- [ ] Maksimum dua pesan/hari/pengguna lintas thread; quiet hours 21–07, focus, mute/snooze dan budget diperiksa sebelum send.
- [ ] Timezone/reset harian, focus detection dan cakupan mute ditetapkan; kandidat tertunda diperiksa ulang sebelum dikirim.
- [ ] Fallback tunduk pada aturan yang sama; send idempotent dan pemeriksaan cap global aman pada job bersamaan.
- [ ] Pesan memakai soul, satu CTA utama, badge/mute dan HITL untuk tindakan Course; riwayat tersimpan meski pengguna offline.

## Spesifikasi

[03 · Agent](../../product/03-agent.md)
<!-- notion-content:end -->
