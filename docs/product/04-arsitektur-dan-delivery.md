# 04 · Arsitektur, Runtime & Kontrak

Sumber: [Notion](https://app.notion.com/p/3f8abdd6187381198256f4ee69db1e78) · Readback: 2026-10-18T10:08:03.263Z

<!-- notion-content:start -->
Stack aktual: TanStack Start/React, FastAPI, Clerk, PostgreSQL/pgvector, LangChain create_agent + LangGraph checkpoints, Procrastinate dan S3/MinIO. API dan worker adalah proses host untuk development; PostgreSQL/MinIO berada pada Compose ngertiin-v1. Pertahankan fondasi; LiteLLM/LlamaIndex/LangSmith/R2 production bukan dependency yang dianggap aktif hanya karena pernah tercantum pada riset.

## Model domain dan invariant lintas modul

Account memiliki Thread, Profile, Task, Schedule, Goal, Memory, File, Result dan SandboxSession. ChatRun adalah satu giliran percakapan; Task/Execution adalah pekerjaan produk dan attempt yang terpisah. Schedule menghasilkan Occurrence, lalu Task, kemudian Delivery ke thread eksplisit. Goal dapat berdiri tanpa Schedule atau Task.

Owner berasal dari konteks server. Simpan domain + reservasi + enqueue dalam transaksi singkat; network/model/provider calls di luar transaksi. Request key/fingerprint mengikat input exact; replay/retry tidak menciptakan charge, occurrence atau publikasi kedua. Lease/version mencabut hak worker lama. Hasil baru durable setelah manifest/domain dan object storage tersimpan.

## Chat event dan replay

Transcript durable terpisah dari koneksi browser.

**Alur:** Submit validated text/request_key → reserve chat + run/message/event/enqueue → worker model → projection → SSE → snapshot/replay.

**State:** Run queued/running/waiting_approval/cancelling/complete/failed/cancelled; message ordered by position.

**Input → output:** POST /chat/threads/\{id\}/runs; GET snapshot/events dengan after/cursor → event version/thread_id/seq dan message/run/approval upserts.

**Kegagalan & pemulihan:** Reconnect snapshot through_seq dan replay sesudahnya; stop mencabut lease; partial output tetap ada; retry bounded.

**Izin:** Clerk verified account dan ownership pada command/snapshot/stream; satu active run per thread baseline.

**Biaya:** Ledger chat commit pada public text/approval; failure tanpa usable output release; usage provider tercatat di run.

**Acceptance:** NG-030 ulangi main/side, stop/retry/replay/ownership; NG-033 memisahkan long Task agar approval tidak mengunci percakapan.

Bukti modul: [REA-1 · Chat & Session](../research/muse-ai-v1/evidence/chat.md). Tiket: [NG-026 · Bersihkan domain dan runtime pembelajaran](../backlog/tasks/26-bersihkan-domain-dan-runtime-pembelajaran.md) · [NG-028 · Sederhanakan kuota menjadi fondasi umum](../backlog/tasks/28-sederhanakan-kuota-menjadi-fondasi-umum.md) · [NG-030 · Terima baseline V1 yang bersih](../backlog/tasks/30-terima-baseline-v1-yang-bersih.md) · [NG-033 · Task background dan approval umum](../backlog/tasks/33-task-background-dan-approval-umum.md).

## Task action dan result runtime

Durable execution memberi state produk terpisah dari job/checkpoint.

**Alur:** Create Task → Execution lease → bounded model/tools → action approval → output persistence → terminal + delivery.

**State:** Task queued/running/waiting_user/succeeded/failed/cancelled; Action unknown/reconciling bila effect belum pasti.

**Input → output:** NG-033 menyediakan GET/POST `/tasks`, GET `/tasks/{id}`, POST `/tasks/{id}/cancel`, `/retry`, `/revise`, `/reconcile`, dan `/approvals/{id}/decision`. Snapshot chat memuat Task; SSE version 1 menambah `task.upsert` untuk status/progress/draft/action serta `message.upsert` untuk delivery hasil teks. File result manifests mengikuti NG-034.

**Kegagalan & pemulihan:** Procrastinate menjamin delivery/retry, LangGraph checkpoint menjaga workflow; keduanya bukan source of truth task success; crash di setiap boundary diuji.

**Izin:** Typed domain services, exact revision, owner/session/grant, cancellation fencing; waiting_user tidak memegang worker/stream/lock.

**Biaya:** Hard cap + telemetry internal sejak NG-033; resource waiting memiliki TTL dan settlement eksplisit.

**Acceptance:** P02–P08/P09/P24/P29/P30; task yang berhenti tidak mempublikasi hasil baru dari worker lama.

Bukti modul: [REA-2 · Task & Scheduler](../research/muse-ai-v1/evidence/task.md). Tiket: [NG-033 · Task background dan approval umum](../backlog/tasks/33-task-background-dan-approval-umum.md) · [NG-023 · Recovery end-to-end dan konsistensi state](../backlog/tasks/23-recovery-end-to-end-dan-konsistensi-state.md).

## File storage dan publication

File produk serta hasil menggunakan revision immutable dan manifest bertipe.

**Alur:** Upload intent → storage → validate metadata → ready revision → task → persist output → result ready.

**State:** File uploading/ready/failed/deleted; result constructing/ready/updating/failed/interrupted.

**Input → output:** Target /files, /files/\{id\}/revisions, /results, signed download/preview; server owns object_key dan size/type validation.

**Kegagalan & pemulihan:** Publish parsial tidak menandai success; input revision hilang tidak diganti diam-diam; garbage collection/retention diaudit.

**Izin:** S3 key per owner, short-lived URLs, owner checks sebelum signature, isolated preview origin, egress/output caps.

**Biaya:** Storage/disk/network/parser/model cost dipisah; diagnostics /dev tetap gated, bukan API produk.

**Acceptance:** P09/P12/P13/P28: output tetap ada setelah runtime hilang dan tidak memuat credential aplikasi.

Bukti modul: [REA-3 · File & Artifact](../research/muse-ai-v1/evidence/file.md). Tiket: [NG-034 · File produk dan hasil tersimpan](../backlog/tasks/34-file-produk-dan-hasil-tersimpan.md).

## Daytona code browser dan komputer

Adapter terisolasi mengeksekusi kode serta satu sesi GUI yang bisa dilihat pengguna.

**Alur:** Resolve owned SandboxSession → start/reconnect → bounded shell/code/browser → persist outputs → idle stop/cleanup. Takeover memakai control lease backend.

**State:** Session provisioning/ready/stopping/stopped/failed; control agent/handoff/human/resuming, control_version monoton.

**Input → output:** Sandbox ID, owner, task, workspace manifest, action/control revision → execution result, live-view URL, observed screen dan cost events.

**Kegagalan & pemulihan:** Provider timeout/expired URL/unknown effect di-reconcile; stop/restart memulihkan disk/workspace sejauh PoC, tidak menjanjikan RAM atau session web.

**Izin:** App secrets tetap di control plane. Viewer proxy/token memeriksa owner/expiry. Agent dan manusia memakai session yang sama; setiap dispatch mengecek lease.

**Biaya:** CPU/RAM/disk/egress/runtime/concurrency/idle caps sejak awal, termasuk stopped disk; cleanup dikonfirmasi.

**Acceptance:** NG-031 trial dahulu; NG-035 isolasi/timeout; NG-036 exclusive takeover + fresh observation; P07–P12/P24/P27.

Bukti modul: [REA-6 · Browser & Computer](../research/muse-ai-v1/evidence/computer.md). Tiket: [NG-031 · Validasi Daytona dengan trial terbatas](../backlog/tasks/31-validasi-daytona-dengan-trial-terbatas.md) · [NG-035 · Eksekusi kode dalam sandbox](../backlog/tasks/35-eksekusi-kode-dalam-sandbox.md) · [NG-036 · Browser VNC live desktop dan takeover](../backlog/tasks/36-browser-vnc-live-desktop-dan-takeover.md).

## Schedule occurrence dan offline delivery

Jadwal pengguna berjalan tanpa browser terbuka di atas dispatcher durable.

**Alur:** Schedule reviewed → due dispatcher claims occurrence → task with per-run budget → persist outcome → deliver target thread.

**State:** Schedule active/paused/deleted; Occurrence pending/queued/running/succeeded/failed/skipped/blocked_budget.

**Input → output:** Instruction snapshot, IANA timezone, recurrence/one-shot, revision, intended_at → unique occurrence/task/delivery and next_due.

**Kegagalan & pemulihan:** Policy default: overlap skip bila run sebelumnya aktif; downtime coalesce satu occurrence terbaru, bukan burst semua yang terlewat. Edit/pause hanya future work, running task dibatalkan eksplisit.

**Izin:** Grant dan ownership dievaluasi lagi saat execute; jadwal tidak memperoleh akses baru saat user offline.

**Biaya:** Per-run max dan account cap; blocked_budget tidak terus retry berbiaya; schedule/delivery budget terpisah dari proactive cap.

**Acceptance:** P18–P20/P23: duplicate dispatch, edit-pause race, DST, downtime, offline, budget nol serta satu delivery.

Bukti modul: [REA-2 · Task & Scheduler](../research/muse-ai-v1/evidence/task.md). Tiket: [NG-037 · Scheduler pengguna saat offline](../backlog/tasks/37-scheduler-pengguna-saat-offline.md).

## Baseline data dan batas reset

Baseline aplikasi adalah 0001_v1_baseline: accounts, agent_profiles, chat_threads/runs/messages/events/approvals, stored_objects, diagnostic_runs, runtime_schema_versions, quota_grants/periods/operations/events. Meter CHECK hanya chat; posisi transcript sudah ada sejak creation. Queue schema dibuat oleh Procrastinate schema_manager, checkpoint oleh PostgresSaver.setup. Readiness membandingkan migration head dari Alembic, queue library version, checkpoint migrations dan heartbeat. Migrasi incremental 0002_background_tasks menambah background_tasks, task_executions, task_revisions, task_actions, task_cost_events, task_deliveries dan task_commands tanpa reset data.

Reset sekali ini membuang seluruh data development proyek dan tidak menyediakan compatibility untuk pesan/approval/checkpoint pembelajaran lama. Migrasi masa depan kembali bersifat incremental; baseline ini bukan prosedur upgrade production.

Kontrak target yang belum diimplementasikan di atas diselesaikan pada tiket terkait sebelum endpoint/event dipasarkan. Memory, Goal dan Library mengikuti [03 · Perilaku Agent](03-agent.md) · [02 · UX & User Flow](02-user-flow.md). Usage dan operasi mengikuti [05 · Usage, Paket & Pembayaran](05-usage-paket-pembayaran.md) · [06 · Development, Operasi & Acceptance](../engineering/development.md).
<!-- notion-content:end -->
