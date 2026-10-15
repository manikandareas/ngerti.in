# Kandidat proaktif dinamis dan reranking

Sumber: [Notion](https://app.notion.com/p/3f8abdd6187381a88a5cd665f17d979f)

Status: **Backlog** · Prioritas: **P0** · Area: **Agent** · Urutan: **19**

Depends on:

- [Pencarian sumber dan pemilihan melalui HITL](07-pencarian-sumber-dan-pemilihan-melalui-hitl.md)
- [Streak dari aktivitas belajar valid](15-streak-dari-aktivitas-belajar-valid.md)
- [Memory aktif: capture, evidence dan recall](17-memory-aktif-capture-evidence-dan-recall.md)

<!-- notion-content:start -->
## Hasil

Proaktivitas memilih konteks bernilai dan mempunyai fallback pembahasan terakhir.

## Acceptance criteria

- [ ] Kandidat berasal dari percakapan terbaru, informasi relevan baru, goal dan event belajar; evidence dan thread asal tercatat.
- [ ] Filter/reranking mempertimbangkan relevansi, manfaat, kebaruan, urgensi, saran berulang dan respons sebelumnya.
- [ ] Jika tidak ada kandidat bernilai, pilih follow-up pembahasan terakhir pengguna pada thread asal.
- [ ] Tetapkan interval evaluasi, ranking/threshold, cooldown dan budget pencarian; informasi baru memiliki sumber/waktu yang diperiksa.

## Spesifikasi

[03 · Agent](../../product/03-agent.md)
<!-- notion-content:end -->
