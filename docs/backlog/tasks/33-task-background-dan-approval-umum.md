# NG-033 · Task background dan approval umum

Sumber: [Notion](https://app.notion.com/p/3fdabdd6187381ba979ac9f219c55a5a) · Readback: 2026-10-18T10:08:03.263Z

| Property | Value |
| --- | --- |
| Ticket | 33 |
| Urutan | 8 |
| Lingkup | Aktif V1 |
| Status | Done |
| Prioritas | P0 |
| Area | Agent |
| Depends on | [NG-032 · Shell onboarding dan walkthrough asisten umum](32-shell-onboarding-dan-walkthrough-asisten-umum.md) |

<!-- notion-content:start -->
Tujuan: Task background dan approval umum.

Scope diterima: pekerjaan teks dari instruksi/konteks chat, review/finalisasi hasil, runtime durable dan budget internal.

Lingkup: **Aktif V1**. Identitas NG-033; Urutan delivery 8.

## Acceptance criteria

- [x] Task/execution terpisah dari chat turn; pengguna dapat chat pada thread asal saat task berjalan atau menunggu keputusan.
- [x] Intent/input snapshot, target/revision, exact approval, idempotency, lease fencing, stop/retry dan unknown effect outcome disimpan.
- [x] Simpan task + budget + enqueue atomik; model/network call di luar transaksi; waiting_user tidak menahan worker berbayar.
- [x] Hasil/progress/delivery durable dan sekali; uji P02–P08, P09 serta P24–P27; hard budget internal dimulai di sini.

## Spesifikasi dan bukti

[04 · Arsitektur, Runtime & Kontrak](../../product/04-arsitektur-dan-delivery.md) · [REA-2 · Task & Scheduler](../../research/muse-ai-v1/evidence/task.md)

## Dependencies

[NG-032 · Shell onboarding dan walkthrough asisten umum](32-shell-onboarding-dan-walkthrough-asisten-umum.md)

## Bukti penerimaan

**Selesai dan diterima pada 2026-10-18 untuk Task teks dan approval umum sesuai scope yang disepakati.** Laporan repo: `docs/engineering/task-33-acceptance.md`; bukti IDs, versions, telemetry, screenshots dan kontrak: `docs/engineering/evidence/task-33/`.

## Hasil penerimaan

- Permintaan chat membuat Task teks dari snapshot instruksi/konteks. Chat thread asal dan side chat tetap dapat digunakan saat Task running atau waiting_user. Pembuatan lewat menu Task juga tersedia; form/draft dan request identity pulih setelah reload.
- LangGraph PostgreSQL checkpoints menjalankan draft/review; Procrastinate menjalankan job terpisah dengan lock per task. Waiting_user mengakhiri job dan melepas execution slot. Model/network berada di luar transaksi domain.
- Approval mengikat draft/hash, target thread dan revision. Edit membuat revision baru, stale/expired proposal ditolak, approve/reject replay konsisten. Stop mencabut lease pada domain dan checkpoints; partial output dan usage tetap tersimpan.
- Task, budget dan enqueue atomik; publikasi hasil/receipt/pesan/terminal status atomik dan unik. Unknown dispatch diblokir sampai rekonsiliasi adapter. Batas awal internal: 60.000 unit kerja/task, 240.000/account/hari UTC, 2.400.000 global/hari UTC, dua task aktif/account, tiga model calls/task. Ini conservative token work tanpa harga komersial.
- Browser dengan model nyata gpt-6-luna: satu Task direvisi lalu difinalisasi sekali; satu selesai otomatis sambil user mengirim chat ketika running; satu dihentikan, retry, lalu draft ditolak tanpa delivery. Tiga task, enam executions, dua receipts. Tiga completed model calls Task melaporkan 4.688 token; satu stopped call tetap unknown dengan cadangan 12.618 unit, tanpa menganggap invoice nol.
- Desktop 1280×900, mobile 390×844/320×640, review/edit, reload, stop/retry/reject, draft/request identity, failed-submit recovery, keyboard/menu dan reduced motion diverifikasi. Mobile adalah emulasi viewport.
- make task-inspect lulus 55 skenario pada PostgreSQL/checkpoints nyata dengan provider terkontrol: concurrency, exact approval, ownership, expiry, checkpoint/stop fencing, fault boundaries, unknown outcome, account/global caps, rollover, policy snapshot, source-data injection dan truncated-output failure. make quota-inspect 46 skenario, make check, make build dan git diff --check lulus.

## Batas integrasi

Hasil NG-033 adalah teks persisten di PostgreSQL/thread asal. File/manifests mengikuti NG-034; code/browser/VNC/takeover mengikuti NG-035/036; offline scheduler NG-037; harga/allowance komersial NG-040. Unknown external effects dan source injection melalui file/web dibuktikan pada integrasi berikutnya; NG-033 membuktikan kontrak dan adapter finalisasi teks terkontrol.
<!-- notion-content:end -->
