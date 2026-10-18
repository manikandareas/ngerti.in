# NG-030 · Bukti penerimaan baseline V1

Sumber: [Notion](https://app.notion.com/p/3fdabdd61873817ab755f7d9bf4c1ce8) · Readback: 2026-10-18T06:04:56.780944+00:00

<!-- notion-content:start -->
Penerimaan baseline development **18 Oktober 2026**, checkout ngertiin, Compose ngertiin-v1. Ini bukti NG-026–030, bukan penerimaan seluruh fitur target V1.

## Cleanup dan reset

- Domain/kontrak/CLI/fixture pembelajaran, tool request_course, tujuan Course, UI khusus dan meter Course/halaman materi dihapus dari aplikasi aktif.
- Dua volume terverifikasi ngertiin-v1_postgres-data dan ngertiin-v1_minio-data dihapus lalu dibangun ulang. Akun Clerk, kredensial dan resource remote dipertahankan.
- Migration head 0001_v1_baseline; Procrastinate official schema dan LangGraph PostgresSaver.setup. make setup dijalankan ulang dengan sukses. Script reset mode validasi memastikan endpoint/mount/volume ownership tanpa menghapus data baru.
- Readiness membandingkan head Alembic aktual, queue/checkpoints versions, storage dan heartbeat worker.

## Hasil verifikasi baru

- make check lulus: Biome, TypeScript, Ruff/format dan mypy. make build lulus; warning bundler dependency use-client/chunk size tidak menjadi error build.
- make quota-inspect lulus **46 skenario** pada database sementara, lalu database probe dihapus. Skenario mencakup concurrency slot terakhir, idempotency, period/grants, fencing, settlement, approval umum, owner, retry/recovery dan structured 429.
- Browser nyata login dengan akun Clerk development yang sudah ada, main/side chat, jawaban model 17 × 19 = 323, reload/history serta UI desktop/mobile 390 px tanpa horizontal overflow.
- SSE replay: 13 event awal unik berurutan; Last-Event-ID 7 mengembalikan tepat 8–13; transcript tidak berubah dan tidak membuat charge baru.
- Tombol stop membatalkan run dan melepaskan kuota ketika belum ada public output. Retry: failure tanpa output disiapkan secara terkontrol; tombol Coba lagi memanggil backend/worker/model nyata, hasil RETRY-OK selesai dan ledger konsisten.
- Storage melalui browser authenticated: upload 200, signed download mempunyai bytes yang sama, delete 204, download setelah delete 404.
- Ownership probe backend dengan account kedua sintetis: snapshot, event stream, submit, cancel, retry, signed download dan delete milik account lain semuanya 404; tidak memakai login account orang lain.
- Worker sungguhan dimatikan dengan SIGKILL setelah diagnostic workflow running dan satu checkpoint tersimpan. Sesudah heartbeat kedaluwarsa 32 detik, worker startup recovery menyelesaikan job pada attempt 2 dan hanya satu artifact terdaftar.
- Walkthrough menemukan reloader API memantau scratch dan menunggu SSE saat restart. dev:api kini memantau apps/backend/src saja dan membatasi graceful shutdown 5 detik. Readiness serta retry browser diulang sesudah restart.

## Lokasi bukti repo

Docs engineering/evidence/baseline-v1: ledger-probe.json, browser-api.json, sse-replay.json, stop.json, retry.json, ownership.json, worker-recovery.json, schema.json, desktop.png, mobile.png dan retry.png. Batas metode dicatat pada tiap JSON; kegagalan retry adalah fault injection, sedangkan respons sesudahnya memakai model nyata.

## Batas penerimaan

NG-030 menutup baseline auth/chat/queue/checkpoint/storage/ledger development. Task umum, Daytona trial/runtime, VNC/live desktop/takeover, offline schedules, memory/goals/proaktivitas, Library produk, compute allowance dan pembayaran production belum dibangun atau diterima. File diagnostics belum menjadi attachment produk. Production R2/CI/restore dan keamanan vendor belum diverifikasi oleh reset ini.
Spesifikasi: [06 · Development, Operasi & Acceptance](development.md) · [04 · Arsitektur, Runtime & Kontrak](../product/04-arsitektur-dan-delivery.md) · [05 · Usage, Paket & Pembayaran](../product/05-usage-paket-pembayaran.md). Bukti modul: [REA-1 · Chat & Session](../research/muse-ai-v1/evidence/chat.md) · [REA-5 · Permissions](../research/muse-ai-v1/evidence/permissions.md). Tiket: [NG-026 · Bersihkan domain dan runtime pembelajaran](../backlog/tasks/26-bersihkan-domain-dan-runtime-pembelajaran.md) · [NG-027 · Bersihkan UI dan persona awal](../backlog/tasks/27-bersihkan-ui-dan-persona-awal.md) · [NG-028 · Sederhanakan kuota menjadi fondasi umum](../backlog/tasks/28-sederhanakan-kuota-menjadi-fondasi-umum.md) · [NG-029 · Buat baseline skema dan reset development](../backlog/tasks/29-buat-baseline-skema-dan-reset-development.md) · [NG-030 · Terima baseline V1 yang bersih](../backlog/tasks/30-terima-baseline-v1-yang-bersih.md).
<!-- notion-content:end -->
