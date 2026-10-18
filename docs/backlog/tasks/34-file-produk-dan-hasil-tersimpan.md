# NG-034 · File produk dan hasil tersimpan

Sumber: [Notion](https://app.notion.com/p/3fdabdd618738108a7d9ed086cd2c1ea) · Readback: 2026-10-18T14:17:35.163Z

| Property | Value |
| --- | --- |
| Ticket | 34 |
| Urutan | 9 |
| Lingkup | Aktif V1 |
| Status | Done |
| Prioritas | P0 |
| Area | Agent |
| Depends on | [NG-033 · Task background dan approval umum](33-task-background-dan-approval-umum.md) |

<!-- notion-content:start -->
Tujuan: File produk dan hasil tersimpan.

Lingkup: **Aktif V1**. Identitas NG-034; Urutan delivery 9.

## Acceptance criteria

- [x] Upload dengan batas/format eksplisit, immutable file revisions, attachment owner-scoped serta result manifest.
- [x] Result lifecycle constructing/ready/updating/failed/interrupted; partial result dan failed publication tidak disamakan dengan success.
- [x] Preview HTML terisolasi tanpa credential aplikasi, download, delete/retention dan referensi exact input dapat diperiksa.
- [x] File/output dipublikasikan ke object storage sebelum task success dan tetap dapat dibuka sesudah sandbox dihapus; P12/P13/P28/P09.

## Spesifikasi dan bukti

[04 · Arsitektur, Runtime & Kontrak](../../product/04-arsitektur-dan-delivery.md) · [REA-3 · File & Artifact](../../research/muse-ai-v1/evidence/file.md)

## Dependencies

[NG-033 · Task background dan approval umum](33-task-background-dan-approval-umum.md)

## Bukti penerimaan

Diterima lokal pada **2026-10-18**. Laporan repo `docs/engineering/files-34-acceptance.md`; evidence `docs/engineering/evidence/files-34/`. Migrasi incremental 0003_product_files, tanpa reset.

PDF/gambar memakai Mistral OCR snapshot `mistral-ocr-4-1`; TXT/MD/CSV/JSON lokal, tanpa LlamaIndex/LlamaParse. Batas eksplisit: 10 MiB/file, 5 lampiran/25 MiB, PDF20 halaman dan OCR40 halaman/Task; 10 output/25 MiB, storage250 MiB. OCR100 halaman/akun/UTC dan1000 global adalah cap internal. Cache mengikat revision/model/policy; unknown OCR tidak diulang otomatis dan tetap terhitung.

Walkthrough model nyata: Task PDF `e12e415b-543e-456e-bc1b-fa156e10efa3` menghasilkan HTML+CSV; pembaruan `18195256-680d-4ec9-8f13-479f18d08c0b` memakai cache dan isi hasil sebelumnya, review/edit/reload menjadi revision2. Chat tetap berfungsi saat Task menunggu. Task PNG `505f7dfa-47f0-4ad8-86d6-0c0af9c87976` menghasilkan JSON dan membuktikan usage OCR tetap tersimpan sesudah bytes sumber dipurge pada worker final. Total tiga model Task calls confirmed3.782 token; satu Task fixture tanpa model. OCR nyata total3 halaman (dua integrasi, satu smoke langsung), estimasi konfigurasi USD0,012; saldo kredit/invoice tidak diperiksa.

P12: Task fixture `0ef19566-314f-431c-844f-6077d41b7063`, Daytona SDK0.225.0/provider v0.225.1, snapshot daytona-medium, TTL3 menit. Tiga file benar-benar berasal dari sandbox, dipersist dan diverifikasi sebelum success; sandbox dihapus/cleanup dikonfirmasi, lalu output masih dapat diunduh dengan checksum sama. Ceiling reservasi trial USD0,0833, bukan invoice. Ini adapter fixture terbatas; eksekusi kode umum tetap NG-035.

P09/P13/P28: 47 probe PostgreSQL/MinIO mencakup owner, immutable/replay, deleted input, batas/unknown OCR, failed update/partial publication, lost ack/stop dan late-writer cleanup. HTML disanitasi, navigation/script/form/external URL dibuang, iframe sandbox origin opaque/no-referrer/CSP; akses same-origin gagal dan nol request domain uji. Preview/download/delete, revision lama, draft/network recovery, keyboard/reduced motion dan viewport1280x900/390x844/320x640 diperiksa; mobile emulasi viewport. Unduhan cocok SHA-256. Hasil siap tetap ada sesudah sumber dihapus.

`make check`, `make build`, `make files-inspect`47, `make task-inspect`55, `make quota-inspect`46 dan diff check lulus; docs/mirror diverifikasi lewat exact readback dan empat views. Provider fault probe terkontrol dipisahkan dari walkthrough provider nyata. R2 production, pencarian Library NG-039, general code NG-035 dan benchmark seluruh kualitas OCR belum diterima oleh slice ini.
<!-- notion-content:end -->
