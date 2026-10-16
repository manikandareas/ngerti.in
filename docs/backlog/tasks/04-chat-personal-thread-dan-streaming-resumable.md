# Chat personal: thread dan streaming resumable

Sumber: [Notion](https://app.notion.com/p/3f8abdd61873816d8b15ed7b7b1b82a9)

Status: **Done** · Prioritas: **P0** · Area: **Agent** · Urutan: **4**

Depends on:

- [Fondasi production: workspace, auth dan data](02-fondasi-production-workspace-auth-dan-data.md)

<!-- notion-content:start -->
## Hasil

Satu agent personal melayani main chat dan side chat melalui agent loop dinamis LangChain create_agent, dengan riwayat durable.

## Acceptance criteria

- [x] LangChain `create_agent` dapat langsung merespons tanpa tool atau memilih beberapa tool berturut-turut berdasarkan hasilnya, tanpa urutan tool wajib per topik.
- [x] Tools yang tersedia mengikuti konteks dan izin pengguna; backend memvalidasi akses serta batas iterasi/budget.
- [x] Tool yang membutuhkan HITL menunggu keputusan atas proposal yang tersimpan; penolakan tidak mengeksekusi perubahan.
- [x] Workflow panjang berjalan sebagai job dengan execution ID terpisah; proposal tertunda tidak menahan slot worker atau mengunci chat lain.
- [x] Pengguna membuat, membuka, dan melanjutkan thread sendiri; agent memakai soul/profil pengguna yang sama.
- [x] Pesan dan stream seq tersimpan sebelum dikirim; reconnect melanjutkan tanpa duplikasi.
- [x] Konteks/history diambil sesuai thread, bukan seluruh history sekaligus.
- [x] Slash command Course masuk flow HITL yang sama dengan bahasa natural; nama command v1 ditetapkan.

## Progres implementasi

16 Oktober 2026 — Implementasi chat selesai; delapan acceptance criteria di atas tercakup oleh penerimaan lokal dan pemeriksaan cleanup React.
- Runtime: main/side chat, soul/profil bersama, LangChain `create_agent`, batas akses dan budget, job/checkpoint durable, HITL approve/reject, `/course`, history per thread, SSE replay, stop/retry, serta recovery worker sudah diimplementasikan.
- Bukti penerimaan di repo: `docs/engineering/chat-04-implementation.md`, `docs/engineering/evidence/chat-04/manual-acceptance.json`, dan `docs/engineering/evidence/chat-04/stream-duplication-audit.json`. Audit streaming memeriksa 70 snapshot baru tanpa duplikasi.
- Cleanup React: query/pembuatan thread, panel/Drawer, subscription, draft/pengiriman/idempotency, aksi run, dan transcript mempunyai tanggung jawab terpisah. `Thread` turun dari 249 menjadi 93 baris; route diagnostik dari 198 menjadi 10 baris. Komponen dan hooks diagnostik berada di fitur sendiri.
- Verifikasi cleanup baru: login akun uji Clerk; kegagalan kirim 503 yang disimulasikan mempertahankan draft dan request key setelah reload; retry nyata memakai key yang sama dan menghasilkan satu jawaban. Panel desktop/Escape/fokus, pencarian, Drawer mobile, draft lintas thread, upload/hapus file, dan job diagnostik lulus. Viewport 1440×900 dan 390×844 tidak overflow horizontal.
- `make check` dan `make build` lulus. Rincian cleanup dan bukti baru: `docs/engineering/react-cleanup-2026-10-16.md` serta `docs/engineering/evidence/react-cleanup/manual-acceptance.json`.

### Batas penerimaan

Pemeriksaan cleanup ini melengkapi bukti runtime yang sudah tercatat; matriks crash/recovery/HITL tidak seluruhnya diulang. Persetujuan tujuan Course sudah nyata; generation Course lengkap dan integrasi konteks Course/Lesson mengikuti backlog domain berikutnya. Deployment production, uji beban multi-replica, dan exactly-once billing provider belum menjadi bukti penerimaan ini.

## Spesifikasi

[03 · Agent](../../product/03-agent.md)
[04 · Arsitektur & Delivery](../../product/04-arsitektur-dan-delivery.md)
<!-- notion-content:end -->
