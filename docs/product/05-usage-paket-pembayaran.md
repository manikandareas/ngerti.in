# 05 · Usage, Paket & Pembayaran

Sumber: [Notion](https://app.notion.com/p/3fdabdd61873819ca2b5cc4e521b3587) · Readback: 2026-10-18T06:04:56.780944+00:00

<!-- notion-content:start -->
Batas chat baseline adalah **Free 100 dan Plus 300 pesan pengguna per 30 × 24 jam**, policy chat-baseline-v1. Ini batas development sementara, bukan harga atau allowance komersial yang disetujui. Meter Course/halaman materi dan kontrak reservasinya telah dihapus. GET /quotas hanya memiliki `meters.chat` dengan limit/used/reserved/remaining serta period/plan.

## Ledger dan enforcement chat

Satu input pengguna mendapat admission atomik dan audit yang dapat dipulihkan.
**Alur:** Validate → account lock → reserve + domain/enqueue → public text/approval commit → no-output failure release → explicit reverse bila dibenarkan.
**State:** reserved/committed/released/reversed; revision/token fencing.
**Input → output:** Owner, stable resource key/fingerprint, unit integer → operation/period/token dan append-only audit.
**Kegagalan & pemulihan:** Sisa habis memberi 429 quota_exceeded + Retry-After/reset_at; draft tetap. Replay/resume/recovery/approval bukan input baru.
**Izin:** Mutasi ledger/grants hanya server internal; owner/plan/amount dari browser tidak dipercaya.
**Biaya:** Satu unit per user message; reasoning saja tidak commit; partial text commit; stop tanpa output release.
**Acceptance:** Probe concurrency, idempotency, rollover, grants, refund, owner, old worker fencing, 429 serta approval saat saldo nol.
Bukti modul: [REA-5 · Permissions](../research/muse-ai-v1/evidence/permissions.md). Tiket: [NG-028 · Sederhanakan kuota menjadi fondasi umum](../backlog/tasks/28-sederhanakan-kuota-menjadi-fondasi-umum.md) · [NG-030 · Terima baseline V1 yang bersih](../backlog/tasks/30-terima-baseline-v1-yang-bersih.md).

## Compute dan allowance V1

Budget komputasi melindungi pekerjaan file/code/browser/schedule dari biaya tak terbatas.
**Alur:** Estimate/max cap → admission → cost event per model/tool/resource → settle actual/remainder → outcome dan penjelasan charge.
**State:** reserved/settling/settled/released/refunded; cost estimated/confirmed/unknown.
**Input → output:** Provider/resource identity, timestamp, price/policy version, parent budget → dedup cost events dan ringkasan user.
**Kegagalan & pemulihan:** Crash dapat menimbulkan actual vendor cost meski product charge dibebaskan; unknown cost ditandai dan direkonsiliasi.
**Izin:** Model tidak dapat menaikkan cap/plan; child tasks berbagi parent/account cap; kontrol stop/result/memory/schedule tetap terbuka.
**Biaya:** Token model, tool/search/browser, runtime/idle disk, storage/egress, parser, retry dan evaluasi background dicatat terpisah.
**Acceptance:** P24–P26; hard caps ada sejak Task/sandbox/schedule awal; benchmark memilih allowance/price komersial sebelum checkout aktif.
Bukti modul: [REA-5 · Permissions](../research/muse-ai-v1/evidence/permissions.md). Tiket: [NG-033 · Task background dan approval umum](../backlog/tasks/33-task-background-dan-approval-umum.md) · [NG-035 · Eksekusi kode dalam sandbox](../backlog/tasks/35-eksekusi-kode-dalam-sandbox.md) · [NG-036 · Browser VNC live desktop dan takeover](../backlog/tasks/36-browser-vnc-live-desktop-dan-takeover.md) · [NG-037 · Scheduler pengguna saat offline](../backlog/tasks/37-scheduler-pengguna-saat-offline.md) · [NG-040 · Usage komputasi dan kontrak paket V1](../backlog/tasks/40-usage-komputasi-dan-kontrak-paket-v1.md) · [NG-041 · Benchmark kualitas latency dan biaya asisten umum](../backlog/tasks/41-benchmark-kualitas-latency-dan-biaya-asisten-umum.md).

## Pembayaran dan lifecycle paket

Entitlement komersial hanya aktif dari pembayaran yang terbukti.
**Alur:** Checkout → server verify amount/currency/product/owner → idempotent callback/reconciliation → grant → renewal/expiry/downgrade/refund.
**State:** pending/paid/failed/expired/refunded; entitlement active/expired/downgraded.
**Input → output:** Order/provider event → verified payment dan versioned entitlement; client redirect bukan bukti pembayaran.
**Kegagalan & pemulihan:** Callback hilang/duplikat/urutan terbalik atau refund direkonsiliasi; task accepted memakai policy snapshot, bukan aturan baru diam-diam.
**Izin:** Secret gateway server-only; plan/grant bukan tool agent; ownership tetap berlaku saat expired.
**Biaya:** Harga/gateway dipilih saat implementasi setelah benchmark; tidak mewarisi Rp49.000 atau unit pembelajaran lama.
**Acceptance:** Forged/duplicate callback, renewal, expiry, downgrade, refund serta saldo 0 sambil stop/approval/download lulus.
Bukti modul: [REA-5 · Permissions](../research/muse-ai-v1/evidence/permissions.md). Tiket: [NG-021 · Checkout dan aktivasi pembayaran V1](../backlog/tasks/21-checkout-plus-dan-aktivasi-pembayaran.md) · [NG-022 · Paket pengguna usage expiry dan downgrade](../backlog/tasks/22-paket-pengguna-usage-expiry-dan-downgrade.md) · [NG-040 · Usage komputasi dan kontrak paket V1](../backlog/tasks/40-usage-komputasi-dan-kontrak-paket-v1.md) · [NG-041 · Benchmark kualitas latency dan biaya asisten umum](../backlog/tasks/41-benchmark-kualitas-latency-dan-biaya-asisten-umum.md).
<!-- notion-content:end -->
