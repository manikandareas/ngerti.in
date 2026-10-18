# 03 · Perilaku Agent

Sumber: [Notion](https://app.notion.com/p/3f8abdd6187381658b61f4283ee83428) · Readback: 2026-10-18T06:04:56.780944+00:00

<!-- notion-content:start -->
Gwen adalah asisten personal yang hangat, jelas, jujur mengenai hasil dan kemampuan. Bahasa mengikuti pengguna. Jawaban langsung didahulukan untuk permintaan sederhana; Task digunakan untuk pekerjaan lama, bukan semua percakapan. Baseline hanya menyediakan read_recent_messages dan read_agent_profile. Tool baru ditambahkan melalui domain service berizin; tidak ada host shell tool atau setter kuota dari model.

## Persona dan soul

Identitas/perilaku dipersonalisasi melalui perubahan yang dapat ditinjau.
**Alur:** Permintaan user → usulan diff terhadap revision aktif → review → approve exact → revision baru.
**State:** proposed/approved/rejected/expired; satu active revision.
**Input → output:** Instruksi eksplisit → persona revision/history; fakta memory tetap domain berbeda.
**Kegagalan & pemulihan:** Revision stale ditolak; penolakan tidak berubah menjadi instruksi memory; restore perlu keputusan eksplisit.
**Izin:** Hanya owner, exact approval dan target version sah; data web/file tidak mengubah persona.
**Biaya:** Model/context cap dan audit cost; tidak ada inference tanpa batas untuk personalisasi.
**Acceptance:** P16/P27: reject mempertahankan soul, source injection tidak mengubah profil, restore dapat diperiksa.
Bukti modul: [REA-4 · Memory & Goals](../research/muse-ai-v1/evidence/memory.md). Tiket: [NG-016 · Perubahan soul atas permintaan dan HITL](../backlog/tasks/16-perubahan-soul-atas-permintaan-dan-hitl.md).

## Memory aktif dan kendali pengguna

Konteks relevan lintas thread dapat diingat, diperiksa, dikoreksi atau dilupakan.
**Alur:** Capture evidence → classify/candidate → simpan scope → recall relevan → correction/forget suppression.
**State:** candidate/active/corrected/forgotten; evidence revision dan tombstone/suppression durable.
**Input → output:** Pesan/file/result references → fact/preference/observation dengan confidence, waktu, owner dan evidence.
**Kegagalan & pemulihan:** Evidence hilang/basi tidak dipakai sebagai fakta; retry curation history lama menghormati forgetting; conflicting entries terlihat.
**Izin:** Secret tidak ditangkap; capture dapat dimatikan; memory bukan otoritas izin, saldo atau status tugas.
**Biaya:** Budget extraction/recall, konteks dan evaluasi internal terpisah; kontrol user tetap ada saat allowance nol.
**Acceptance:** P14/P15/P16/P27: recall thread baru, koreksi, forget dan re-curation tidak menghidupkan kembali fakta lama.
Bukti modul: [REA-4 · Memory & Goals](../research/muse-ai-v1/evidence/memory.md). Tiket: [NG-017 · Memory aktif capture evidence dan recall](../backlog/tasks/17-memory-aktif-capture-evidence-dan-recall.md) · [NG-018 · Pengaturan inspeksi dan koreksi memory](../backlog/tasks/18-pengaturan-untuk-inspeksi-dan-koreksi-memory.md).

## Goals dan langkah berikutnya

Tujuan umum memberi konteks dan bukti kemajuan tanpa menjadi izin eksekusi.
**Alur:** User menyebut target → review success criteria → simpan → optional task/schedule → evaluasi evidence → user pause/ubah/selesaikan.
**State:** active/paused/completed/archived; optimistic revision.
**Input → output:** Target/horizon optional/evidence → next action dan progress bertaut task.
**Kegagalan & pemulihan:** Task gagal tidak menyelesaikan goal; target berubah memerlukan replan eksplisit; pause berlaku untuk inisiatif berikutnya.
**Izin:** Goal owner-scoped; tindakan eksternal dan schedule mengikuti izin tersendiri.
**Biaya:** Parent goal/task/account budget membatasi child tasks; evaluasi progress dibatasi.
**Acceptance:** P17/P09: banyak task untuk satu goal, kegagalan, perubahan target serta pause teruji.
Bukti modul: [REA-4 · Memory & Goals](../research/muse-ai-v1/evidence/memory.md). Tiket: [NG-038 · Goals umum dengan evidence progress](../backlog/tasks/38-goals-umum-dengan-evidence-progress.md).

## Tools permission dan approval

Agent mengusulkan aksi; backend menentukan legalitas scope, target dan revision.
**Alur:** Model proposes → backend validate owner/grant/budget → exact review bila diperlukan → execute → reconcile outcome.
**State:** proposed/allowed/waiting_user/executing/succeeded/failed/unknown/revoked.
**Input → output:** Typed args, target/version, idempotency key → result/error/evidence.
**Kegagalan & pemulihan:** Stale grant/approval ditolak; unknown external effect direkonsiliasi sebelum retry; cancellation fences worker lama.
**Izin:** Read/reversible sandbox actions mengikuti scoped grant; external writes memerlukan izin eksplisit yang cocok target/risiko; tidak menjalankan nama fungsi dari client.
**Biaya:** Per-tool/task/account hard cap; provider retry tetap dicatat meski product charge dipulihkan.
**Acceptance:** P04/P05/P08/P09/P10/P27; input file/web tetap data dan tidak menciptakan grant.
Bukti modul: [REA-5 · Permissions](../research/muse-ai-v1/evidence/permissions.md). Tiket: [NG-033 · Task background dan approval umum](../backlog/tasks/33-task-background-dan-approval-umum.md) · [NG-035 · Eksekusi kode dalam sandbox](../backlog/tasks/35-eksekusi-kode-dalam-sandbox.md) · [NG-036 · Browser VNC live desktop dan takeover](../backlog/tasks/36-browser-vnc-live-desktop-dan-takeover.md).

## Proaktivitas dan delivery

Agent boleh menawarkan bantuan yang relevan tanpa membanjiri pengguna.
**Alur:** Evidence memory/goal/result → candidate/rank → no-op atau policy → dedup → kirim ke thread asal.
**State:** candidate/eligible/snoozed/expired/delivered/discarded; delivery pending/sent/failed.
**Input → output:** Evidence, relevansi, expiry, preferences → satu usulan/hasil yang punya alasan.
**Kegagalan & pemulihan:** Tidak ada kandidat layak berarti diam; quiet hours/mute/cap dicek ulang saat kirim; dua worker tidak menggandakan pesan.
**Izin:** Opt-in kontrol user, mute/snooze; proaktivitas tidak memberi izin aksi eksternal baru.
**Biaya:** Global daily cap atomik dan evaluation budget; hasil Schedule yang diminta punya policy delivery terpisah.
**Acceptance:** P21/P22/P23: no-op sah, cap lintas thread, kandidat basi dibuang, scheduled result tetap tersimpan.
Bukti modul: [REA-2 · Task & Scheduler](../research/muse-ai-v1/evidence/task.md). Tiket: [NG-019 · Kandidat proaktif dinamis dan reranking](../backlog/tasks/19-kandidat-proaktif-dinamis-dan-reranking.md) · [NG-020 · Delivery proaktif per thread dan batas global](../backlog/tasks/20-delivery-proaktif-per-thread-dan-batas-global.md).
<!-- notion-content:end -->
