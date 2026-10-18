# Chat personal: thread dan streaming resumable

Sumber: [Notion](https://app.notion.com/p/3f8abdd61873816d8b15ed7b7b1b82a9) · Readback: 2026-10-18T06:04:56.780944+00:00

| Property | Value |
| --- | --- |
| Ticket | 4 |
| Urutan | 1004 |
| Lingkup | Histori |
| Status | Done |
| Prioritas | P0 |
| Area | Agent |
| Depends on | [Fondasi production: workspace, auth dan data](02-fondasi-production-workspace-auth-dan-data.md) |

<!-- notion-content:start -->
**Lingkup: Histori · NG-004 · reset 18 Oktober 2026.** Penerimaan lama tetap Done sebagai catatan historis. Scope pembelajaran dan paket lama tidak menjadi acceptance V1 baru.
Spesifikasi aktif: [01 · Produk & Scope V1](../../product/01-produk-dan-paket.md). Urutan/dependensi aktif: [07 · Backlog Implementasi V1](../README.md).

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

<mention-date start="2026-10-16"/> — Implementasi chat selesai; delapan acceptance criteria di atas tercakup oleh penerimaan lokal dan pemeriksaan cleanup React.
- Runtime: main/side chat, soul/profil bersama, LangChain `create_agent`, batas akses dan budget, job/checkpoint durable, HITL approve/reject, `/course`, history per thread, SSE replay, stop/retry, serta recovery worker sudah diimplementasikan.
- Bukti penerimaan di repo: `docs/engineering/chat-04-implementation.md`, `docs/engineering/evidence/chat-04/manual-acceptance.json`, dan `docs/engineering/evidence/chat-04/stream-duplication-audit.json`. Audit streaming memeriksa 70 snapshot baru tanpa duplikasi.
- Cleanup React: query/pembuatan thread, panel/Drawer, subscription, draft/pengiriman/idempotency, aksi run, dan transcript mempunyai tanggung jawab terpisah. `Thread` turun dari 249 menjadi 93 baris; route diagnostik dari 198 menjadi 10 baris. Komponen dan hooks diagnostik berada di fitur sendiri.
- Verifikasi cleanup baru: login akun uji Clerk; kegagalan kirim 503 yang disimulasikan mempertahankan draft dan request key setelah reload; retry nyata memakai key yang sama dan menghasilkan satu jawaban. Panel desktop/Escape/fokus, pencarian, Drawer mobile, draft lintas thread, upload/hapus file, dan job diagnostik lulus. Viewport 1440×900 dan 390×844 tidak overflow horizontal.
- `make check` dan `make build` lulus. Rincian cleanup dan bukti baru: `docs/engineering/react-cleanup-2026-10-16.md` serta `docs/engineering/evidence/react-cleanup/manual-acceptance.json`.

### Batas penerimaan

Pemeriksaan cleanup ini melengkapi bukti runtime yang sudah tercatat; matriks crash/recovery/HITL tidak seluruhnya diulang. Persetujuan tujuan Course sudah nyata; generation Course lengkap dan integrasi konteks Course/Lesson mengikuti backlog domain berikutnya. Deployment production, uji beban multi-replica, dan exactly-once billing provider belum menjadi bukti penerimaan ini.

## Spesifikasi

[03 · Perilaku Agent](../../product/03-agent.md)

[04 · Arsitektur, Runtime & Kontrak](../../product/04-arsitektur-dan-delivery.md)
<!-- notion-content:end -->
