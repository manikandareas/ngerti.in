# Chat personal: thread dan streaming resumable

Sumber: [Notion](https://app.notion.com/p/3f8abdd61873816d8b15ed7b7b1b82a9)

Status: **Backlog** · Prioritas: **P0** · Area: **Agent** · Urutan: **4**

Depends on:

- [Fondasi production: workspace, auth dan data](02-fondasi-production-workspace-auth-dan-data.md)

<!-- notion-content:start -->
## Hasil

Satu agent personal melayani main chat dan side chat melalui agent loop dinamis LangChain create_agent, dengan riwayat durable.

## Acceptance criteria

- [ ] LangChain `create_agent` dapat langsung merespons tanpa tool atau memilih beberapa tool berturut-turut berdasarkan hasilnya, tanpa urutan tool wajib per topik.
- [ ] Tools yang tersedia mengikuti konteks dan izin pengguna; backend memvalidasi akses serta batas iterasi/budget.
- [ ] Tool yang membutuhkan HITL menunggu keputusan atas proposal yang tersimpan; penolakan tidak mengeksekusi perubahan.
- [ ] Workflow panjang berjalan sebagai job dengan execution ID terpisah; proposal tertunda tidak menahan slot worker atau mengunci chat lain.
- [ ] Pengguna membuat, membuka, dan melanjutkan thread sendiri; agent memakai soul/profil pengguna yang sama.
- [ ] Pesan dan stream seq tersimpan sebelum dikirim; reconnect melanjutkan tanpa duplikasi.
- [ ] Konteks/history diambil sesuai thread, bukan seluruh history sekaligus.
- [ ] Slash command Course masuk flow HITL yang sama dengan bahasa natural; nama command v1 ditetapkan.

## Spesifikasi

[03 · Agent](../../product/03-agent.md)

[04 · Arsitektur & Delivery](../../product/04-arsitektur-dan-delivery.md)
<!-- notion-content:end -->
