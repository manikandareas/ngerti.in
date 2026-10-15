# Recovery end-to-end dan konsistensi state

Sumber: [Notion](https://app.notion.com/p/3f8abdd6187381a78cd0f770a7db65d2)

Status: **Backlog** · Prioritas: **P0** · Area: **Release** · Urutan: **23**

Depends on:

- [Generation: node pertama lalu background](09-generation-node-pertama-lalu-background.md)
- [Onboarding dan tour Course pertama](10-onboarding-dan-tour-course-pertama.md)
- [Course player dan panel chat kontekstual](11-course-player-dan-panel-chat-kontekstual.md)
- [Practice: review jawaban salah dan unlock](12-practice-review-jawaban-salah-dan-unlock.md)
- [Pengayaan opsional dalam Course](13-pengayaan-opsional-dalam-course.md)
- [Reward flashcard tersimpan dan review](14-reward-flashcard-tersimpan-dan-review.md)
- [Streak dari aktivitas belajar valid](15-streak-dari-aktivitas-belajar-valid.md)
- [Delivery proaktif per thread dan batas global](20-delivery-proaktif-per-thread-dan-batas-global.md)
- [Paket pengguna: usage, expiry dan downgrade](22-paket-pengguna-usage-expiry-dan-downgrade.md)

<!-- notion-content:start -->
## Hasil

Alur lengkap dapat dilanjutkan setelah gangguan tanpa side effect ganda.

## Acceptance criteria

- [ ] Uji tutup browser/reconnect, restart worker, generation partial gagal dan koneksi terputus saat Practice.
- [ ] Input/file, outline sebelumnya, node valid, posisi belajar dan jawaban dapat dipulihkan.
- [ ] Approval, kuota, memory, pesan proaktif, reward, streak dan unlock tidak digandakan oleh retry.
- [ ] User melihat state dan tindakan pemulihan yang jelas; akun lain tidak dapat membaca/mengubah state tersebut.

## Spesifikasi

[02 · User Flow](../../product/02-user-flow.md)

[04 · Arsitektur & Delivery](../../product/04-arsitektur-dan-delivery.md)
<!-- notion-content:end -->
