# 08 · Bukti Riset & REA

Sumber: [Notion](https://app.notion.com/p/3fdabdd6187381edb593cae8f95784e7) · Readback: 2026-10-18T06:04:56.780944+00:00

<!-- notion-content:start -->
Indeks ini menyimpan observasi dan provenance; rencana implementasi aktif berada di spesifikasi serta backlog utama. Snapshot riset Muse: **18 Oktober 2026**, build dpl_13w2XhxKwKs7oW6RrPKNJxMESSbw, 199 app chunks publik, 338 deklarasi RPC, 32 source-evidence entries. Ini tidak membuktikan backend Muse diperoleh atau semua RPC dijalankan.
Rantai kerja: spesifikasi → bukti modul → tiket → bukti penerimaan. Label bukti dibedakan: observed UI, static shipped frontend, vendor-documented, implemented Ngertiin, accepted Ngertiin. UI-* adalah indeks observasi, F:* finding statik, E2/E3/E4 alias Evidence ID aktual; tidak saling menggantikan.

## Bukti per modul

- [REA-1 · Chat & Session](evidence/chat.md)
- [REA-2 · Task & Scheduler](evidence/task.md)
- [REA-3 · File & Artifact](evidence/file.md)
- [REA-4 · Memory & Goals](evidence/memory.md)
- [REA-5 · Permissions](evidence/permissions.md)
- [REA-6 · Browser & Computer](evidence/computer.md)

## Observasi lengkap dan sumber

[01 · Peta Produk, UX & Interaksi](01-produk-dan-ux.md) · [02 · Arsitektur, Runtime & Keamanan Muse](02-arsitektur-vendor.md) · [03 · Frontend, Transport & Kontrak Data](03-frontend-dan-kontrak.md) · [06 · Bukti, Hasil Uji & Batas Investigasi](06-bukti-dan-gap.md) · [07 · Lampiran 338 RPC & Jejak Sumber](07-lampiran-rpc.md)

Raw provenance berada di .firecrawl/muse-re-20261018/ (scratch lokal di-ignore Git), dengan scripts-app-public/manifest.json, scripts-public/manifest.json dan evidence bundles. Indeks source-evidence-index.json serta rpc-registry.json di repo menyimpan identifiers/locations. Capture SHA-256 9d244515a58afe070e0c775f600d23cdbde1dee0fcc401a7d5a477273ae101c6; export manifest e946df2e1510a595e9b04915d8779093dd1b93fd01afcec51d37200c00477629. REA semantic coverage partial; keberadaan literal/registry bukan bukti alur berhasil.

## Perencanaan yang sudah dilebur

Blueprint dan roadmap riset lama tidak menjadi sumber rencana kedua. Isi implementasi serta P01–P30 dipindahkan ke spesifikasi, matriks penerimaan dan backlog utama; dua halaman lama menjadi penunjuk arsip. Observasi, hash dan batas verifikasi tetap tersedia. Tidak ada instruksi mempertahankan package V2 atau menunda takeover dari roadmap lama yang berlaku pada V1 aktif.
Spesifikasi: [01 · Produk & Scope V1](../../product/01-produk-dan-paket.md) · [02 · UX & User Flow](../../product/02-user-flow.md) · [03 · Perilaku Agent](../../product/03-agent.md) · [04 · Arsitektur, Runtime & Kontrak](../../product/04-arsitektur-dan-delivery.md) · [05 · Usage, Paket & Pembayaran](../../product/05-usage-paket-pembayaran.md) · [06 · Development, Operasi & Acceptance](../../engineering/development.md) · [07 · Backlog Implementasi V1](../../backlog/README.md)

## Halaman bukti modul

[REA-1 · Chat & Session](evidence/chat.md)

[REA-2 · Task & Scheduler](evidence/task.md)

[REA-3 · File & Artifact](evidence/file.md)

[REA-4 · Memory & Goals](evidence/memory.md)

[REA-5 · Permissions](evidence/permissions.md)

[REA-6 · Browser & Computer](evidence/computer.md)

## Sumber observasi rinci

[01 · Peta Produk, UX & Interaksi](01-produk-dan-ux.md)

[02 · Arsitektur, Runtime & Keamanan Muse](02-arsitektur-vendor.md)

[03 · Frontend, Transport & Kontrak Data](03-frontend-dan-kontrak.md)

[06 · Bukti, Hasil Uji & Batas Investigasi](06-bukti-dan-gap.md)

[07 · Lampiran 338 RPC & Jejak Sumber](07-lampiran-rpc.md)

## Arsip perencanaan

[Arsip perencanaan sebelum reset](archive/README.md)
<!-- notion-content:end -->
