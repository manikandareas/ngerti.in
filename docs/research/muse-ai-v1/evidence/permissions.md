# REA-5 · Permissions

Sumber: [Notion](https://app.notion.com/p/3fdabdd6187381718c98c853fea3d769) · Readback: 2026-10-18T06:04:56.780944+00:00

<!-- notion-content:start -->
Tanggal/build: 18 Oktober 2026; Muse dpl_13w2XhxKwKs7oW6RrPKNJxMESSbw. Ini ringkasan evidence modul, bukan acceptance fitur Ngertiin.

## Identitas temuan

F:permissions.scoped_update/inventory, E3/E4, vendor security architecture.

## Temuan dan dampak kontrak

Frontend menunjukkan permission scope dan kontrol; dokumen vendor menjelaskan batas runtime/secrets. Owner binding, exact approvals, lease dan cost authority Ngertiin berasal dari spesifikasi aktif.

## Provenance

E2 = ev_3118eb2894143c3cdacc62932c872bf6b64db2b1f6c1733706b9e717b4676572; E3 = ev_1be87df5702e20626a0a9f7c6c743fc2c1ea4c6da588e5deed8be9f5df49c078; E4 = ev_3ef37aea9ccdb037efb5d84e1fa748379b4e903052ce94638b9d1cd06a6b2c62. Mapping F:\* ke exact path/hash berada pada source-evidence-index.json dan scripts-app-public/manifest.json; scope parsing REA terpilih dan partial.
Sumber primer snapshot: [01 · Peta Produk, UX & Interaksi](../01-produk-dan-ux.md) · [02 · Arsitektur, Runtime & Keamanan Muse](../02-arsitektur-vendor.md) · [03 · Frontend, Transport & Kontrak Data](../03-frontend-dan-kontrak.md) · [06 · Bukti, Hasil Uji & Batas Investigasi](../06-bukti-dan-gap.md) · [07 · Lampiran 338 RPC & Jejak Sumber](../07-lampiran-rpc.md). Capture digest 9d244515a58afe070e0c775f600d23cdbde1dee0fcc401a7d5a477273ae101c6; evidence-frontend-analysis.json SHA-256 da26b214536f6a070fcd80a8af18b4ecf15b2f22f2fb5cd480a9b34a4296df6f.

## Batas verifikasi

Tidak membuktikan seluruh connector writes/revoke/stale proposals atau efficacy isolasi production vendor. Quota ledger Ngertiin perlu probe tersendiri.

## Spesifikasi tiket dan penerimaan

[01 · Produk & Scope V1](../../../product/01-produk-dan-paket.md) · [02 · UX & User Flow](../../../product/02-user-flow.md) · [03 · Perilaku Agent](../../../product/03-agent.md) · [04 · Arsitektur, Runtime & Kontrak](../../../product/04-arsitektur-dan-delivery.md) · [05 · Usage, Paket & Pembayaran](../../../product/05-usage-paket-pembayaran.md) · [06 · Development, Operasi & Acceptance](../../../engineering/development.md)

[NG-028 · Sederhanakan kuota menjadi fondasi umum](../../../backlog/tasks/28-sederhanakan-kuota-menjadi-fondasi-umum.md) · [NG-029 · Buat baseline skema dan reset development](../../../backlog/tasks/29-buat-baseline-skema-dan-reset-development.md) · [NG-033 · Task background dan approval umum](../../../backlog/tasks/33-task-background-dan-approval-umum.md) · [NG-040 · Usage komputasi dan kontrak paket V1](../../../backlog/tasks/40-usage-komputasi-dan-kontrak-paket-v1.md) · [NG-021 · Checkout dan aktivasi pembayaran V1](../../../backlog/tasks/21-checkout-plus-dan-aktivasi-pembayaran.md) · [NG-022 · Paket pengguna usage expiry dan downgrade](../../../backlog/tasks/22-paket-pengguna-usage-expiry-dan-downgrade.md)

Bukti penerimaan dicatat pada masing-masing tiket, berikut environment, tanggal/provider version, input, expected/actual, trace/screenshot serta biaya. Baseline acceptance tersimpan di docs/engineering/[NG-030 · Bukti penerimaan baseline V1](../../../engineering/baseline-v1-acceptance.md); fitur baru tetap gap hingga acceptance sesuai modul selesai.
<!-- notion-content:end -->
