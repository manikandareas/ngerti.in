# NG-033 · Task background dan approval umum

Diterima lokal pada 18 Oktober 2026 untuk pekerjaan teks dari instruksi dan konteks chat. Sumber scope: [NG-033](../backlog/tasks/33-task-background-dan-approval-umum.md), [runtime](../product/04-arsitektur-dan-delivery.md), dan [usage](../product/05-usage-paket-pembayaran.md).

## Perilaku yang tersedia

Pengguna dapat meminta Gwen menulis, merangkum, atau menyusun rencana di background melalui chat, atau membuat task dari menu Task. Snapshot instruksi dan konteks diambil saat pembuatan. Pesan chat berikutnya tidak mengubah snapshot tersebut. Chat thread asal dan side chat tetap dapat digunakan saat task berjalan maupun menunggu review.

Task menampilkan tahap nyata, draft/hasil, percobaan, batas kerja, stop/retry, dan proposal finalisasi. Review mengikat isi draft, hash, target thread, dan revision. Mengedit draft membuat revision baru; proposal lama tidak berlaku. Menunda berarti membiarkan proposal menunggu, sedangkan menolak menghentikan finalisasi dan mempertahankan draft.

## Runtime dan transaksi

- Migrasi incremental `0002_background_tasks` menambah task, execution attempts, draft revisions, actions, cost events, delivery receipts, dan command identities. Baseline/data development tidak direset.
- Chat memakai tool `start_background_task`; satu chat turn dapat membuat satu task dengan request identity stabil. Tool mendapat owner/thread/lease dari server. POST langsung dari menu Task menggunakan input identity sendiri.
- Create menyimpan domain, snapshot, reservasi komputasi, chat admission bila berasal dari form, dan enqueue dalam transaksi yang sama. Satu input memakai satu chat unit; background steps, approval, replay, stop, dan retry task tidak menambah pesan berbayar.
- Procrastinate menjalankan `task.execute` dengan lock per task. LangGraph menjalankan graph draft → review dengan PostgreSQL checkpoints bernama per task/revision. LangChain ChatOpenAI melakukan satu panggilan model bounded untuk setiap generation attempt.
- Interrupt menyimpan proposal/checkpoint, kemudian job selesai dan execution slot dilepas. Decision yang sah mengantrekan kelanjutan; `Command(resume=...)` melanjutkan graph tanpa mengulang draft yang sudah durable.
- Publikasi dilakukan setelah checkpoint terakhir. Receipt, pesan hasil, action outcome, dan status success disimpan atomik. Identitas unik mencegah publikasi kedua; delivery tidak membuat ChatRun baru atau mengubah status run percakapan yang sedang aktif.
- Lease fencing berlaku pada content writes dan checkpoint writes. Stop mencabut lease; watcher membatalkan coroutine aktif. Queue recovery menyimpan unknown provider usage, mengganti lease, dan hanya melanjutkan pekerjaan yang aman.
- Action yang sudah masuk dispatch tetapi outcome-nya belum pasti menjadi `unknown`. Retry biasa diblokir sampai rekonsiliasi. Adapter yang tersedia hanya finalisasi teks transaksional: receipt dalam transaksi yang sama dapat membuktikan publikasi. Kesimpulan ini tidak boleh dipakai ulang untuk connector/browser writes.

API tersedia: `GET/POST /tasks`, `GET /tasks/{id}`, `POST /tasks/{id}/cancel`, `/retry`, `/revise`, `/reconcile`, dan `POST /approvals/{id}/decision`. Snapshot chat memuat task; SSE version 1 menambah `task.upsert` dan tetap memakai `message.upsert` untuk hasil final. Seluruh command/read/approval terikat owner; payload publik tidak menerima owner, budget, tool name, atau plan.

## Batas kerja internal

Policy `text-task-work-v1` menggunakan **conservative token work**, tanpa nilai uang atau harga paket komersial. Model dan seluruh policy limits disnapshot saat admission.

| Batas awal | Nilai |
| --- | --- |
| Task | 60.000 unit kerja |
| Account per tanggal UTC | 240.000 unit kerja |
| Global per tanggal UTC | 2.400.000 unit kerja |
| Task queued/running per account | 2 |
| Model calls per task, termasuk retry | 3 |
| Input model / output maksimum per call | 20.000 byte / 3.000 token |
| Workflow attempt timeout | 180 detik |
| Maksimum execution attempts / draft revisions | 12 / 6 |
| Masa berlaku proposal | 7 hari |

Sebelum network call, server mencadangkan input byte bound + 4.096 framing units + output maksimum. Usage provider yang lengkap menyelesaikan reservasi dengan jumlah token aktual. Usage hilang/terputus tetap dihitung sebesar cap panggilan dan ditandai unknown. Rekonsiliasi metadata boleh berjalan setelah stop, tetapi worker lama tetap tidak boleh memublikasikan konten.

Admission account/global diserialisasi pada transaksi singkat. Retry/revision mempertahankan bucket tanggal asal dan tidak menaikkan cap task. Task waiting mempertahankan cadangan sisa tanpa worker aktif; terminal state melepas sisanya. Maintenance mengakhiri proposal kedaluwarsa dengan draft tetap tersimpan. Allowance/harga komersial dan konversi biaya uang tetap NG-040.

## Bukti penerimaan

[Live readback](evidence/task-33/live-readback.json) mencatat IDs, versions, outcomes, job status, executions, cost events, dan delivery receipts. Environment: local API/web/worker, PostgreSQL/MinIO lokal, akun Clerk test sintetis, model `gpt-6-luna`; LangGraph 1.2.15, LangChain 1.4.6, langchain-openai 1.7.2, Procrastinate 3.10.0, psycopg 3.3.6.

| Skenario nyata | Expected / actual |
| --- | --- |
| Chat mendelegasikan rencana peluncuran toko buku, meminta review | Task `fe4c5331-9839-46b0-a1ba-da41121669bb` dibuat lewat tool; job selesai pada waiting_user. Chat tentang soft launch tetap berfungsi. Reload mempertahankan proposal. |
| Edit draft, lalu approve versi baru | Revision 2 mempunyai action baru; tiga executions tetapi hanya satu model call. Hasil persis draft yang disetujui, satu receipt/pesan hasil. |
| Form membuat panduan, tanpa review | Task `a3a42e33-6da2-46ad-8aa8-63f4cf427f51` teramati running sebelum pengguna mengirim chat tentang pre-order; keduanya selesai. [Observasi waktu](evidence/task-33/concurrent-observation.json), [screenshot](evidence/task-33/concurrent-chat.png). |
| Mobile stop → retry → reject | Task `28268e93-5e28-4d93-a0a5-745c6b550550` dihentikan sebelum teks diterima, dapat dicoba lagi dengan identitas/snapshot sama, lalu draft ditolak. Tidak ada delivery hasil. [Stop readback](evidence/task-33/stop-observation.json), [screenshot](evidence/task-33/mobile-stop.png). |
| Draft form dan jaringan | Draft serta request key tetap sama setelah reload. Hydration diperbaiki agar nilai yang dipulihkan juga mengaktifkan tombol submit. Request gagal mempertahankan input; data task terakhir tetap terbaca. [Sebelum](evidence/task-33/network-draft.json), [sesudah](evidence/task-33/network-draft-restored.json), [kegagalan jaringan](evidence/task-33/mobile-network-failure.png). |
| Desktop/mobile/accessibility | Review, edit dan kontrol dapat digunakan; viewport 1280×900, 390×844, dan 320×640 tidak overflow horizontal. Menu mobile/keyboard dan reduced motion diperiksa. Bukti mobile adalah emulasi viewport, bukan perangkat fisik. |

Tiga completed model calls Task melaporkan **4.688 token** total. Satu stopped call tidak mempunyai usage lengkap dan tetap dicatat **unknown**, dengan cadangan 12.618 unit kerja; biaya invoice tidak dianggap nol. Angka token ini hanya Task, tidak termasuk panggilan chat. Dua task sukses menghasilkan dua receipts; task yang ditolak tidak menghasilkan receipt.

`make task-inspect` lulus **55 skenario** pada PostgreSQL/checkpoint sungguhan di database sementara yang dihapus setelah probe. [Hasil kontrak](evidence/task-33/contracts.json) mencakup admission/decision races, ownership, exact revision, expiry, stop fencing, checkpoint authority, crash sebelum checkpoint/setelah publication commit, unknown effects, account/global caps, rollover, policy snapshot, source injection sebagai data, quota-zero approval, retry costs dan truncated-output failure. Provider model pada fault/race probe adalah adapter terkontrol; walkthrough di atas memakai model dan worker nyata.

`make check`, `make build`, `make quota-inspect` (46 skenario), dan `git diff --check` lulus. Probe concurrency/fault merupakan bukti kontrak backend; screenshot sendiri tidak membuktikan failure boundary.

## Batas penerimaan

Hasil pada NG-033 berupa teks persisten di PostgreSQL dan thread asal. File/manifests/object-storage publication mengikuti NG-034; sandbox/code mengikuti NG-035; browser/VNC/takeover dan connector effects mengikuti NG-036; offline scheduling mengikuti NG-037; commercial price/allowance mengikuti NG-040. Tidak ada host shell, external-write tool, mutasi persona/memory, atau scheduler baru yang diberikan kepada model oleh tiket ini. Unknown external effects dan source injection dari file/web belum diuji melalui integrasi tersebut.
