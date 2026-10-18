# REA-2 · Task & Scheduler

Sumber: [Notion](https://app.notion.com/p/3fdabdd6187381c09face8d0b458ad24) · Readback: 2026-10-18T06:04:56.780944+00:00

<!-- notion-content:start -->
Tanggal/build: 18 Oktober 2026; Muse dpl_13w2XhxKwKs7oW6RrPKNJxMESSbw. Ini ringkasan evidence modul, bukan acceptance fitur Ngertiin.

## Identitas temuan

UI task/schedules/Upcoming, LIVE-01, E3 registry, F:ui.client_control.

## Temuan dan dampak kontrak

UI memperlihatkan task/schedule controls dan LIVE-01 instruksi kedua dijawab saat artifact pertama dibangun. Kebutuhan Task terpisah dari chat, occurrence idempotency, offline dispatch serta budget adalah keputusan desain Ngertiin.

## Provenance

E2 = ev_3118eb2894143c3cdacc62932c872bf6b64db2b1f6c1733706b9e717b4676572; E3 = ev_1be87df5702e20626a0a9f7c6c743fc2c1ea4c6da588e5deed8be9f5df49c078; E4 = ev_3ef37aea9ccdb037efb5d84e1fa748379b4e903052ce94638b9d1cd06a6b2c62. Mapping F:\* ke exact path/hash berada pada source-evidence-index.json dan scripts-app-public/manifest.json; scope parsing REA terpilih dan partial.
Sumber primer snapshot: [01 · Peta Produk, UX & Interaksi](../01-produk-dan-ux.md) · [02 · Arsitektur, Runtime & Keamanan Muse](../02-arsitektur-vendor.md) · [03 · Frontend, Transport & Kontrak Data](../03-frontend-dan-kontrak.md) · [06 · Bukti, Hasil Uji & Batas Investigasi](../06-bukti-dan-gap.md) · [07 · Lampiran 338 RPC & Jejak Sumber](../07-lampiran-rpc.md). Capture digest 9d244515a58afe070e0c775f600d23cdbde1dee0fcc401a7d5a477273ae101c6; evidence-frontend-analysis.json SHA-256 da26b214536f6a070fcd80a8af18b4ecf15b2f22f2fb5cd480a9b34a4296df6f.

## Batas verifikasi

Scheduler exactness/DST/misfire/overlap backend Muse dan seluruh crash cases belum diuji; queue maintenance Ngertiin bukan user schedule.

## Spesifikasi tiket dan penerimaan

[01 · Produk & Scope V1](../../../product/01-produk-dan-paket.md) · [02 · UX & User Flow](../../../product/02-user-flow.md) · [03 · Perilaku Agent](../../../product/03-agent.md) · [04 · Arsitektur, Runtime & Kontrak](../../../product/04-arsitektur-dan-delivery.md) · [05 · Usage, Paket & Pembayaran](../../../product/05-usage-paket-pembayaran.md) · [06 · Development, Operasi & Acceptance](../../../engineering/development.md)

[NG-033 · Task background dan approval umum](../../../backlog/tasks/33-task-background-dan-approval-umum.md) · [NG-037 · Scheduler pengguna saat offline](../../../backlog/tasks/37-scheduler-pengguna-saat-offline.md) · [NG-019 · Kandidat proaktif dinamis dan reranking](../../../backlog/tasks/19-kandidat-proaktif-dinamis-dan-reranking.md) · [NG-020 · Delivery proaktif per thread dan batas global](../../../backlog/tasks/20-delivery-proaktif-per-thread-dan-batas-global.md) · [NG-023 · Recovery end-to-end dan konsistensi state](../../../backlog/tasks/23-recovery-end-to-end-dan-konsistensi-state.md)

Bukti penerimaan dicatat pada masing-masing tiket, berikut environment, tanggal/provider version, input, expected/actual, trace/screenshot serta biaya. Baseline acceptance tersimpan di docs/engineering/[NG-030 · Bukti penerimaan baseline V1](../../../engineering/baseline-v1-acceptance.md); fitur baru tetap gap hingga acceptance sesuai modul selesai.
<!-- notion-content:end -->
