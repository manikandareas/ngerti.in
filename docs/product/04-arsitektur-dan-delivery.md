# 04 · Arsitektur, Runtime & Kontrak

> Pembaruan 22 Oktober 2026: runtime aktif hanya E2B. Kode, resource dan data Daytona telah dihapus. Keterangan provider lama di bawah adalah konteks historis, bukan instruksi operasi saat ini. Lihat [pembersihan provider](../engineering/e2b-only-cleanup.md).


Sumber: [Notion](https://app.notion.com/p/3f8abdd6187381198256f4ee69db1e78) · Readback: 2026-10-19T02:50:23.615600+00:00

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

**Input → output:** NG-033 menyediakan GET/POST `/tasks`, GET `/tasks/{id}`, POST `/tasks/{id}/cancel`, `/retry`, `/revise`, `/reconcile`, dan `/approvals/{id}/decision`. Snapshot chat memuat Task; SSE version 1 menambah `task.upsert` untuk status/progress/draft/action serta `message.upsert` untuk delivery hasil teks. NG-034 menambah file inputs/output spec dan result references dalam Task/chat. Publikasi file memakai manifest durable dan delivery atomik; detail tersedia di bagian File storage dan publication.

**Kegagalan & pemulihan:** Procrastinate menjamin delivery/retry, LangGraph checkpoint menjaga workflow; keduanya bukan source of truth task success; crash di setiap boundary diuji.

**Izin:** Typed domain services, exact revision, owner/session/grant, cancellation fencing; waiting_user tidak memegang worker/stream/lock.

**Biaya:** Hard cap + telemetry internal sejak NG-033; resource waiting memiliki TTL dan settlement eksplisit.

**Acceptance:** P02–P08/P09/P24/P29/P30; task yang berhenti tidak mempublikasi hasil baru dari worker lama.

Bukti modul: [REA-2 · Task & Scheduler](../research/muse-ai-v1/evidence/task.md). Tiket: [NG-033 · Task background dan approval umum](../backlog/tasks/33-task-background-dan-approval-umum.md) · [NG-023 · Recovery end-to-end dan konsistensi state](../backlog/tasks/23-recovery-end-to-end-dan-konsistensi-state.md).

## File storage dan publication

File produk serta hasil menggunakan revision immutable dan manifest bertipe.

**Alur:** Upload intent → storage → validate metadata → ready revision → task → persist output → result ready.

**State:** File uploading/ready/failed/deleted; result constructing/ready/updating/failed/interrupted.

**Input → output:** NG-034 menyediakan GET/POST `/files`, POST `/files/{id}/revisions`, authenticated proxy `/files/revisions/{id}/content`, extraction status/retry serta GET/DELETE `/results`. File/output refs mengikat owner, immutable revision, SHA-256 dan exact page/line selection; object_key ditentukan server.

**Kegagalan & pemulihan:** Publish parsial tidak menandai success; input revision hilang tidak diganti diam-diam; garbage collection/retention diaudit.

**Izin:** S3 prefix per owner dan proxy berautentikasi memeriksa akses sebelum/sesudah I/O; tidak membagikan signed URL. HTML disanitasi (termasuk link/navigation/form/external URL), lalu iframe sandbox kosong dengan origin opaque, CSP dan no-referrer. Bytes download tetap asli.

**Biaya:** PDF/PNG/JPEG memakai Mistral OCR `mistral-ocr-4-1`; TXT/MD/CSV/JSON lokal. Cache revision+model+policy menghindari redispatch. Admission halaman OCR akun/global atomik; unknown tetap terhitung dan retry berbiaya memerlukan keputusan eksplisit. Storage/parser/model cost terpisah; diagnostics /dev tetap gated.

**Acceptance:** NG-034 diterima lokal 18 Oktober 2026 untuk P09/P12/P13/P28 slice file/result. `docs/engineering/files-34-acceptance.md` memuat OCR nyata, review/revision dan desktop/mobile, 47 fault/owner contracts, serta tiga hasil dari sandbox Daytona nyata yang tetap terbaca sesudah sandbox dihapus. Produksi kode umum mengikuti NG-035; R2 production dan full Library search belum diterima.

Bukti modul: [REA-3 · File & Artifact](../research/muse-ai-v1/evidence/file.md). Tiket: [NG-034 · File produk dan hasil tersimpan](../backlog/tasks/34-file-produk-dan-hasil-tersimpan.md).

## Daytona code browser dan komputer

NG-036 diterima development pada **2026-10-19**. ComputerRuntime/Action/Screen milik aplikasi membatasi observasi, typed actions, target fingerprint, download, stop/delete dan viewer. DaytonaComputer adalah adapter pertama. Satu workspace/profil persisten per account, sesi compute per Task, hasil File/Result terpisah. Profil tetap di disk Daytona yang sama saat stop/start; auto archive nonaktif.

**Alur:** Resolve owned browser workspace → reservasi budget dan ambil lease eksklusif → start/reconnect dengan profil yang sama → bounded browser/computer actions → persist outputs → tutup browser dengan benar → cabut viewer/lease dan hentikan proses/komputasi → pertahankan profil sesuai retensi. Task berikutnya mendapat lease baru dan melakukan observasi ulang; takeover memakai control lease backend pada sesi yang sama.

**State:** Session provisioning/ready/stopping/stopped/failed; control agent/handoff/human/resuming, control_version monoton. Hanya satu Task atau pengendali manusia yang memakai workspace; antrean menunggu release yang sudah direkonsiliasi, bukan sekadar timeout lock lokal.

**Input → output:** Owner/workspace/profile identity, Task/execution, output spec dan action/control version → fenced receipts, live view, screen transient, File/Result dan cost events. Migrasi incremental 0005_browser_workspace menyimpan browser_workspaces, computer_sessions/steps/outputs/viewers; screenshot tidak disimpan pada checkpoint. Target fingerprint di-hash dalam Chromium, tanpa mengekspor DOM/form value. SDK hanya dalam adapter/gateway boundary.

**Kegagalan & pemulihan:** Provider timeout/expired URL/unknown effect direkonsiliasi sebelum dispatch berikutnya. Hasil model/command dengan lease usang ditolak. Resume dari manusia mencabut channel input, mengambil observasi baru lalu mengaktifkan agent; viewer disconnect tidak otomatis mengembalikan kendali. Stop/start atau archive/restore mempertahankan profil sejauh bukti baru; RAM/proses tidak dijanjikan. Login expired/2FA meminta bantuan manusia, bukan retry login buta. Unknown effect menahan workspace sampai aman dipakai execution berikutnya.

**Izin:** App secrets tetap di control plane. Viewer proxy/token memeriksa owner/expiry dan setiap dispatch memeriksa lease. Profil login diperlakukan sebagai kredensial, owner-scoped, tidak diekspor ke prompt/log/File/Result atau dipasang ke runtime Python offline. Input privat menghentikan observasi model/rekaman. Halaman web tetap data tidak tepercaya; login tidak menciptakan grant baru. Approval aksi eksternal mengikat target/isi/revision dan diperiksa lagi sebelum dispatch.

**Cleanup dan penghapusan:** Akhir Task mencabut semua akses execution lama, mengonfirmasi penghentian komputasi, membersihkan proses/berkas sementara dan mempertahankan profil. Reset profil adalah command owner tersendiri dengan konfirmasi, fencing seluruh akses aktif dan penghapusan profil terkonfirmasi; File/Result tidak ikut dihapus. Desain ini tidak mengubah isolasi maupun kontrak delete runtime kode NG-035.

**Biaya:** Task maksimal 20 menit/24 langkah, fixed 2vCPU/4GiB/8GiB, idle stop 2 menit, margin 180 detik. Profil 7 hari/20 global, ambang 1GiB dipantau; download 25MiB dipantau dan collector 10MiB/file/25MiB total; proxy public-only 200MiB. Satu compute/account dan dua global berbagi admission/cap uang dengan Python. Sesi default mereservasi 208.964microUSD termasuk storage 145.152microUSD, seluruh retention window dicadangkan ulang per use. Ini estimasi, bukan invoice.

**Acceptance:** Login pihak ketiga nyata A → stop/start → B, mobile VNC privat/reconnect, fresh return, exact Logout approval, SIGKILL/idle stop, reset dan checksum hasil diuji. 47 kontrak terkontrol mencakup owner/two-tab/RFB/stale/unknown/queue/caps/retention/cleanup/candidate recovery. Laporan `docs/engineering/computer-36-acceptance.md`. Archive dan situs 2FA khusus tidak dipakai; production/invoice tidak diklaim. Isolasi Python NG-035 tetap terpisah.

Bukti modul: [REA-6 · Browser & Computer](../research/muse-ai-v1/evidence/computer.md). Tiket: [NG-031 · Validasi Daytona dengan trial terbatas](../backlog/tasks/31-validasi-daytona-dengan-trial-terbatas.md) · [NG-035 · Eksekusi kode dalam sandbox](../backlog/tasks/35-eksekusi-kode-dalam-sandbox.md) · [NG-036 · Browser VNC live desktop dan takeover](../backlog/tasks/36-browser-vnc-live-desktop-dan-takeover.md).

## Schedule occurrence dan offline delivery

NG-037 diterima development pada 2026-10-19. Migrasi incremental `0006_user_schedules` menambah jadwal/revision immutable, preview keputusan dan occurrence unik. API GET `/schedules`, POST `/schedules/proposals` dan keputusan proposal mengikat owner, instruksi/input, expected revision, target thread dan per-run cap. Dispatcher Procrastinate per menit menyimpan occurrence + admission + Task + enqueue atomik; tidak membuat pesan user/charge chat otomatis. DST waktu hilang dilewati dan fold pertama dipilih sekali; overlap termasuk waiting_user dilewati, downtime coalesce terbaru dan blocked_budget tanpa retry berbiaya. Riwayat mengambil outcome Task/delivery durable. Perluasan interval memakai `frequency=interval` dan `interval_hours` bilangan bulat 1–8760, tanpa migration tambahan. Slot dihitung dalam durasi UTC dari tanggal/pukul mulai; resume/run-now dan waktu selesai Task tidak menggeser anchor. Preview dan dispatch memakai aritmetika slot yang sama, termasuk downtime panjang. Anchor DST yang hilang ditolak, anchor berulang memakai fold pertama; interval tetap N jam nyata. Kebijakan overlap, coalesce, budget dan idempotensi tetap berlaku. Payload jadwal/proposal lama dan replay request key kalender tetap kompatibel. Control pause/delete tetap tersedia ketika file hilang. Desain `docs/engineering/scheduler-runtime.md`; acceptance `docs/engineering/schedule-37-acceptance.md`. Bukti Muse menyediakan referensi UX/kontrak; scheduler internal Muse belum diperoleh.
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

Baseline aplikasi adalah 0001_v1_baseline: accounts, agent_profiles, chat_threads/runs/messages/events/approvals, stored_objects, diagnostic_runs, runtime_schema_versions, quota_grants/periods/operations/events. Meter CHECK hanya chat; posisi transcript sudah ada sejak creation. Queue schema dibuat oleh Procrastinate schema_manager, checkpoint oleh PostgresSaver.setup. Readiness membandingkan migration head dari Alembic, queue library version, checkpoint migrations dan heartbeat. Migrasi incremental 0002_background_tasks menambah background_tasks, task_executions, task_revisions, task_actions, task_cost_events, task_deliveries dan task_commands tanpa reset data. 0003_product_files menambah file/revision/extraction, task_file_inputs, result/revision dan file finalization; put+SHA verification mendahului transaksi manifest/Task success/action/delivery. Delete merevoke akses dahulu, maintenance purge berikutnya; upload tanpa penggunaan dibersihkan sesudah 24 jam.

Reset sekali ini membuang seluruh data development proyek dan tidak menyediakan compatibility untuk pesan/approval/checkpoint pembelajaran lama. Migrasi masa depan kembali bersifat incremental; baseline ini bukan prosedur upgrade production.

Kontrak target yang belum diimplementasikan di atas diselesaikan pada tiket terkait sebelum endpoint/event dipasarkan. Memory, Goal dan Library mengikuti [03 · Perilaku Agent](03-agent.md) · [02 · UX & User Flow](02-user-flow.md). Usage dan operasi mengikuti [05 · Usage, Paket & Pembayaran](05-usage-paket-pembayaran.md) · [06 · Development, Operasi & Acceptance](../engineering/development.md).

## Runtime kode NG-035 yang sudah diterima

Pada **2026-10-18**, [NG-035 · Eksekusi kode dalam sandbox](../backlog/tasks/35-eksekusi-kode-dalam-sandbox.md) menerima runtime kode produk melalui interface Python `SandboxRuntime`; Daytona adalah adapter pertama. Kontrak, tipe, error dan receipt milik aplikasi. SDK capability produk hanya berada di adapter; pemilihan runtime terpusat dan orkestrasi menerima dependency. ControlledRuntime membuktikan kontrak tanpa SDK/credential Daytona; provider produksi kedua belum tersedia.

Migrasi `0004_sandbox_runtime` menambah runtime_kind, sandbox_sessions, sandbox_steps dan sandbox_outputs. Domain aplikasi mengatur owner/Task/execution, reservasi atomic, lease fencing, step receipt dan outcome unknown. Code memakai input revision/rentang exact; hanya sampel terbatas masuk model. Candidate bytes dipersist dan diverifikasi sebelum review, lalu publikasi manifest/delivery memakai File/Result. Update Result mempertahankan runtime komputasi. Worker tidak mengeksekusi program pada host.

Daytona: 2vCPU/4GiB/8GiB, UID65534/no-new-privs, environment bersih, hard resource limits dan filter seccomp diwariskan ke child. Probe menemukan firewall flag saja belum menolak koneksi, sehingga filter kernel wajib dan fail-closed. Stop/delete terkonfirmasi, TTL absolut, unknown create/dispatch tidak diulang buta, sweep tiap menit dan candidate GC. Resource dibersihkan sebelum review/success. Hasil persisten tidak menjanjikan RAM/proses.

Desain `docs/engineering/sandbox-runtime.md`; acceptance `docs/engineering/sandbox-35-acceptance.md` dan evidence `docs/engineering/evidence/sandbox-35/`. Browser/VNC/live desktop/takeover tetap NG-036.
<!-- notion-content:end -->
