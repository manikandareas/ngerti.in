# NG-043 · Aktivitas, persetujuan, dan komputer

Implementasi 20 Oktober 2026. Status: **Review**. Sumber scope: [NG-043](../backlog/tasks/43-redesign-aktivitas-agent-approval-dan-komputer.md). Perubahan dibangun di atas working tree NG-042 yang belum di-commit; tidak ada commit/push pada pekerjaan ini.

## Implementasi

- Panel asisten berisi Aktivitas, Persetujuan, Mendatang, Identitas. Aktivitas dikelompokkan menurut tanggal perangkat, menampilkan judul/status/outcome/waktu, dan membuka detail task atau percakapan yang dipilih. Jadwal membuka resource yang tepat; waktu perangkat dan zona jadwal ditampilkan terpisah.
- Persetujuan chat dibatasi secara eksplisit ke percakapan aktif; review task mencakup hingga 50 pekerjaan aktif/terbaru lintas percakapan yang disediakan API. Tidak mengklaim inbox semua approval chat atau riwayat semua revisi. Riwayat task menampilkan keputusan terakhir yang disediakan API.
- Approval chat menampilkan aksi, parameter sebagai preview, scope satu tindakan, batas keputusan, keputusan tersimpan, dan detail teknis terlipat. Approval yang sudah berakhir menjadi disclosure; pending memiliki kontrol keputusan dan retry setelah error. Kedaluwarsa diperbarui tanpa menunggu event server, dengan enforcement backend tetap berlaku.
- Status task ringkas ditautkan ke pesan asal melalui source run. Task manual baru memiliki metadata `task_id` pada part pesan; tidak ada migrasi atau perubahan ownership/runtime. Task historis tanpa metadata atau asal yang belum dimuat tetap tersedia sebagai status ringkas di bawah transcript. Identitas tidak ditebak dari teks instruksi.
- Approval hanya ditempelkan sekali ke pesan assistant terakhir dari run terkait; bila pesan belum dimuat, approval tetap tersedia melalui fallback. Hasil tetap dikirim oleh mekanisme delivery idempotent yang ada, tanpa salinan TaskCard penuh di transcript. Error TaskCard ditampilkan sekali. Ditolak, kedaluwarsa, dan pembatalan manual mempunyai label berbeda.
- Banner komputer hanya muncul untuk browser task queued/running/waiting_user pada percakapan terkait. Panel yang ada tetap menyediakan live viewer, takeover, return control, stop, pemeriksaan outcome, dan status error/retry. Copy membedakan menutup layar/panel, menghentikan task, dan mengembalikan kendali; tidak ada keputusan izin atau penutupan sesi implisit.
- Detail versi/pemakaian dipindahkan ke disclosure. Soft Matcha, Nunito Sans, semantic tokens, serta kontrak izin, ownership, budget, persistence, dan idempotency dipertahankan.

## Bukti langsung

| Pemeriksaan | Hasil |
| --- | --- |
| Task panjang dan pesan lanjutan | Task panduan 12 bagian/sekitar 1200 kata berstatus running saat pesan hitung 7+8 dikirim; pesan diterima dan respons terpisah muncul. [DOM](evidence/activity-43/background-followup.txt), [screenshot](evidence/activity-43/background-followup.jpg). |
| Fresh task approval | Review muncul di Persetujuan; klik membuka task yang benar, preview draft dan tombol finalisasi/penolakan. [Pending](evidence/activity-43/task-pending-approvals.jpg), [preview dan draft chat](evidence/activity-43/task-review-draft.jpg). |
| Allowed dan completion | Finalisasi eksplisit menghasilkan succeeded dan satu delivery hasil di transcript. Draft composer tetap tersimpan. [DOM](evidence/activity-43/task-approved.txt). |
| Denied | Task kedua ditolak secara eksplisit; draft tersimpan, tidak ada delivery hasil, kontrol finalisasi hilang. [DOM](evidence/activity-43/task-denied.txt), [screenshot sebelum penyempurnaan label Ditolak](evidence/activity-43/task-denied.jpg). |
| Task asal manual | Task kedua memiliki status langsung setelah pesan asal, menggunakan metadata baru; fallback task historis tetap terpisah. |
| Activity navigation | Baris riset membuka detail dengan judul yang sama dan link ke percakapan asal; tidak hanya membuka daftar umum. |
| Desktop | Dark, 1672×879; empat tab, disclosure, aktivitas, detail, composer berjalan. [Aktivitas](evidence/activity-43/ngertiin-activity-desktop.jpg), [Persetujuan](evidence/activity-43/ngertiin-approvals-desktop.jpg). |
| Mobile | Dark, 390×844; scrollWidth 390, empat tab masing-masing 93.25px, tanpa overflow horizontal. [Persetujuan](evidence/activity-43/ngertiin-approvals-mobile.jpg), [Aktivitas](evidence/activity-43/ngertiin-activity-mobile.jpg). |
| Keyboard | ArrowRight dari Aktivitas memilih Persetujuan; Escape menutup panel mobile. Focus styling terlihat. Full focus-restore matrix belum selesai. |
| Upcoming | Empty state diamati langsung. Jadwal populated/timezone memakai formatter yang tersedia, belum ada jadwal aktif pada walkthrough ini. |

## Reference sheet: observasi versus adaptasi

Referensi langsung Muse: tab Activity/Approvals/Upcoming/Identity, Activity berbentuk baris actionable dengan judul/outcome/waktu dan grup tanggal, serta riwayat approval Allowed/Allowed once dengan disclosure. [Riwayat approval desktop](evidence/activity-43/muse-approvals-history-desktop.jpg), [Activity mobile](evidence/activity-43/muse-activity-mobile.jpg). Screenshot adalah bukti state saat pengamatan, bukan golden pixel parity; isi pekerjaan berbeda.

Pengukuran DOM Muse pada lebar 390: baris tab 358px di dalam panel 390px, padding horizontal 16px, wadah tab 36px dengan padding 4px, trigger Approvals 86.75×28px dengan padding 6px. Ngertiin memakai empat tab minimal tinggi 48px dan lebar 93.25px pada viewport 390, panel desktop awal 360px yang dapat diubah lebarnya, padding isi 20px. Ukuran target sentuh, token, serta pembagian scope approval adalah adaptasi desain yang disengaja, bukan klaim pixel-identical. Pending approval, computer/takeover, light mode, dan reduced-motion Muse belum teramati dalam sesi ini.

## Gate regresi

- `make check`: lulus (Biome, TypeScript, Ruff, mypy).
- `make build`: lulus; warning bundler dependency yang ada tidak menggagalkan build.
- `bun scripts/inspect_activity.ts`: 10 assertions, mencakup beberapa task satu run, source manual, pagination/fallback, single approval anchor, dan perbedaan rejected/expired/cancelled.
- `make task-inspect`: 56 kontrak lulus pada database sementara, termasuk metadata origin baru; database dihapus oleh harness.
- `make computer-inspect`: default fixture tertahan admission allowance ketika membuat browser task kedua. Ulang dengan `COMPUTE_FREE_CREDITS=100000 COMPUTE_ACCOUNT_DAILY_MICROUSD=100000000 COMPUTE_GLOBAL_DAILY_MICROUSD=1000000000 make computer-inspect`: 47 kontrak lulus, resource sementara dibersihkan. Override hanya proses inspector/database sementara; konfigurasi aplikasi tidak diubah. Ini bukan bukti acceptance allowance default.
- `git diff --check` dan `make docs-check`: lulus sesudah readback Notion dan empat view (46/30/0/16 rows); 70 page hashes, 46 tickets, 4 views, 1345 local links.

## Sisa acceptance sebelum Done

1. Runtime chat saat ini memasang `HumanInTheLoopMiddleware(interrupt_on={})`; tidak ada tool chat yang memicu approval blocking secara alami. Tidak mengubah kebijakan runtime hanya untuk menghasilkan state uji. Fresh **blocking chat approval** (berbeda dari review task), expired, beberapa pending request serentak, retry/gangguan koneksi, dan rekonsiliasi keputusan perlu walkthrough live lengkap.
2. Live browser takeover/return/stop/close dan reconnect pada UI baru belum diuji ulang; 47 kontrak controlled-I/O bukan pengganti walkthrough VNC nyata.
3. Muse pending approval dan takeover belum tersedia untuk diamati; tidak mengklaim kemiripan state tersebut. Riwayat Allowed bukan bukti pending.
4. Light/dark matrix lengkap, reduced motion, loading/error/recovery interaktif, populated Upcoming, focus restore semua entry point, dan pasangan screenshot dengan konten/state yang benar-benar setara belum lengkap.
5. NG-042 masih Review. Kelulusan gate kode dan dokumentasi tidak menaikkan kedua tiket menjadi Done.
