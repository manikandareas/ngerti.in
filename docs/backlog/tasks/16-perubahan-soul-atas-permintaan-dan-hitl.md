# Perubahan soul atas permintaan dan HITL

Sumber: [Notion](https://app.notion.com/p/3f8abdd6187381469879f976651f1717)

Status: **Backlog** · Prioritas: **P0** · Area: **Agent** · Urutan: **16**

Depends on:

- [Chat personal: thread dan streaming resumable](04-chat-personal-thread-dan-streaming-resumable.md)

<!-- notion-content:start -->
## Hasil

Pengguna mengubah persona dengan proposal yang dapat ditinjau.

## Acceptance criteria

- [ ] Permintaan eksplisit menghasilkan usulan edit [soul.md](http://soul.md) yang menampilkan isi/revisi untuk review.
- [ ] Backend menerapkan tepat isi yang disetujui; rejected/pending proposal tidak mengubah soul aktif.
- [ ] Approval stale dan retry ditangani tanpa menimpa revisi baru atau membuat update ganda.
- [ ] Tool memory dan job proaktif tidak dapat mengubah soul atau menerapkan persona ditolak melalui memory.

## Spesifikasi

[03 · Agent](../../product/03-agent.md)
<!-- notion-content:end -->
