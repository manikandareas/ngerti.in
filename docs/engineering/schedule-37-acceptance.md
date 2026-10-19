# NG-037 · Scheduler pengguna saat offline

Diterima pada **19 Oktober 2026 WITA** di development lokal macOS: FastAPI, worker Procrastinate, PostgreSQL/checkpoints, Clerk development dan model nyata yang dikonfigurasi backend. Migration incremental `0006_user_schedules` sudah diterapkan tanpa reset. [Desain runtime](scheduler-runtime.md) dan [tiket NG-037](../backlog/tasks/37-scheduler-pengguna-saat-offline.md).

Model `gpt-6-luna`; versi terpasang: Procrastinate 3.10.0, LangGraph 1.2.15, LangChain 1.4.6, langchain-openai 1.7.2 dan OpenAI SDK 3.31.0.

## Expected → actual

| Kebutuhan | Hasil dan bukti |
| --- | --- |
| Preview lengkap dan keputusan exact | Form sekali jalan menampilkan instruksi, target thread, Asia/Makassar, waktu berikutnya dan batas 60.000 unit. Preview pertama ditolak; preview baru dikonfirmasi dengan waktu 10.14 WITA yang tepat. Tidak ada jadwal aktif sebelum keputusan. |
| P18: offline dan satu outcome | Halaman Ngertiin dinavigasikan ke about:blank sebelum due. Worker mengklaim occurrence pada **02:14:00.712937 UTC** untuk intended_at **02:14:00 UTC**. Task `3542c668-6725-4379-b6ab-69fbb4de2ab6` succeeded, satu delivery, hasil terlihat setelah halaman dibuka kembali. [Readback](evidence/schedule-37/live-readback.json). |
| Hasil persisten | Riwayat → Buka pekerjaan & hasil → Lihat detail menampilkan “Audit scheduler offline selesai. Tidak ada layanan eksternal yang digunakan.” Delivery juga tampak di percakapan asal. Model dipakai untuk teks audit; tidak ada browser/connector/runtime eksternal lain pada Task ini. |
| Pengelolaan lewat chat | Side chat audit meminta jadwal Senin/Rabu 09.00 WITA mulai 21 Oktober 2026, batas 30.000 unit. Model menghasilkan kartu preview, lalu pengguna mengaktifkan. Permintaan edit menghasilkan 09.30 dengan hari, instruksi, cap dan target tetap; konfirmasi menciptakan revision 2. Permintaan jeda menghasilkan kartu tersendiri; konfirmasi menghasilkan paused revision 3, next_due null. |
| P19: races, misfire dan revision | Probes PostgreSQL memverifikasi dispatcher paralel satu occurrence/Task/job, pause mencegah dispatch, proposal stale ditolak, crash sebelum commit tidak meninggalkan state parsial, restart mengklaim sekali, downtime coalesce terbaru dan overlap queued/waiting_user dilewati. Delete/pause tidak membatalkan Task yang sudah dibuat; Stop eksplisit tetap bekerja. |
| P20: timezone dan DST | Preview dan dispatch memakai fungsi yang sama. Probes membuktikan Asia/Makassar → UTC, hari mingguan, DST New York waktu hilang dilewati, waktu berulang fold pertama satu kali dan one-shot DST invalid tanpa preview. Tidak mengubah jam sistem. |
| P23: hasil terjadwal | Jalur publikasi Task/delivery berjalan terpisah dari proaktivitas dan tetap durable. Counter/quiet-hours proaktif NG-019/020 belum tersedia; tidak diklaim telah diuji production. |
| Budget dan ownership | Probes membuktikan per-run cap, dua jadwal berebut sisa cap secara atomik, blocked_budget tanpa Task/retry berbiaya, tidak ada charge chat otomatis, owner asing ditolak, source run usang tidak dapat membuat proposal, serta kontrol pause/delete tetap tersedia ketika input file hilang. |
| Desktop/mobile | Browser autentikasi nyata: desktop 1280×900, viewport mobile 390×844 dan 320×640. Proposal chat, konfirmasi, navigasi mobile, jadwal paused dan form tanggal terlihat; document scrollWidth sama dengan viewport pada ketiga ukuran. Input tanggal pada 320 px berukuran 238 px. Override viewport dipulihkan sesudah pemeriksaan. |

## Telemetry dan pemeriksaan

Task offline menggunakan **satu panggilan model, 2.806 token confirmed**, satu occurrence dan satu delivery. Pemicu otomatis tidak mengurangi kuota chat; tiga permintaan pengelolaan melalui percakapan memakai kuota chat normal. Biaya model tidak dikonversi menjadi invoice/harga komersial. Tidak ada sandbox/browser resource baru untuk Task teks ini.

- `make schedule-inspect`: **82 skenario** setelah perluasan interval (52 baseline + 30 tambahan), model terkontrol dengan PostgreSQL/checkpoints sementara; database dihapus. [Hasil kontrak](evidence/schedule-37/controlled-contracts.json).
- Regresi `make task-inspect`: **55**, `make quota-inspect`: **46**, `make files-inspect`: **47** lulus.
- `make check`: Biome, TypeScript, Ruff dan mypy lulus; `make build` lulus.
- `make docs-check` dan `git diff --check` lulus pada verifikasi akhir.

Fixture owner pada inspector Task kini memakai timestamp PostgreSQL, agar clock host/container yang berbeda beberapa milidetik tidak menyebabkan account activation berada di masa depan terhadap clock ledger. Ini perbaikan fixture, tanpa mengubah policy kuota produk.

## Perluasan interval setiap N jam

Disetujui dan diterima pada 19 Oktober 2026 WITA. Form “Setiap beberapa jam”, ringkasan jadwal dan tool chat mendukung `frequency=interval` dengan `interval_hours` bilangan bulat 1–8760. Tanggal/pukul mulai menjadi anchor. Setiap 3 jam mulai 09:00 menghasilkan 09:00 → 12:00 → 15:00 → 18:00, termasuk lintas malam. Aktivasi setelah anchor memilih slot berikutnya. Durasi UTC tetap; waktu selesai Task, resume dan run-now tidak menggeser anchor. DST dapat menggeser jam lokal; anchor waktu hilang ditolak, fold pertama dipakai pada waktu berulang. Tidak ada migration tambahan.

Walkthrough form nyata membuat **NG-037 · Audit interval**, setiap 3 jam dari anchor 07.47 WITA, cap 30.000 unit. Preview menunjukkan 10.47/13.47/16.47. Setelah konfirmasi, halaman ditinggalkan ke about:blank. Dispatcher alami mengklaim satu occurrence pada **02:47:00.662882 UTC** untuk intended **02:47 UTC**; Task `1fc579b1-0dbe-435c-a4a7-ce2e55f4c1f3` succeeded dengan hasil “Audit interval per jam selesai.” Satu panggilan model `gpt-6-luna`, **903 token confirmed**, satu delivery pada **02:47:04.268528 UTC**. `next_due` maju ke 13.47 WITA. Setelah aplikasi dibuka kembali, hasil terlihat di riwayat dan percakapan; jadwal dijeda pada revision 2, next_due null.

Chat nyata menghasilkan usulan **Audit interval chat**, setiap 2 jam mulai 20 Oktober 2026 09.00 WITA, dengan preview 09.00/11.00/13.00. Usulan ditolak setelah diperiksa agar tidak ada jadwal audit baru yang aktif. Kartu interval pada viewport 320×640 memiliki lebar 288 px dan document scrollWidth 320 px; viewport dipulihkan setelah pemeriksaan. [Readback interval](evidence/schedule-37/interval-readback.json) dan [tampilan akhir](evidence/schedule-37/interval-ui.jpg).

30 kontrak tambahan memverifikasi batas input jam, anchor inklusif/eksklusif, lintas malam dan interval melebihi sehari, durasi saat DST, anchor invalid, downtime panjang, duplicate tick, overlap, budget, pause/resume/edit, jadwal lama serta replay fingerprint proposal sebelum penambahan field interval. `make check` dan `make build` lulus. Satu slot interval dibuktikan live; cadence berjam-jam, DST, downtime dan races memakai probes terkontrol, tanpa mengubah clock sistem.

## Batas penerimaan

Eksekusi terjadwal model nyata yang dijalankan pada walkthrough ini adalah Task teks. Python/browser memakai jalur Task serta admission/approval/isolasi yang sudah ada; tidak ada klaim jadwal login pihak ketiga atau seluruh provider diuji ulang secara live oleh NG-037. Login atau exact action approval tetap dapat meminta pengguna meskipun jadwal terpicu offline.

Races, budget nol, DST, downtime dan crash boundary dibuktikan dengan probes terkontrol; tidak ada klaim kill worker production atau outage control-plane menyeluruh. Browser mobile adalah emulasi viewport, bukan perangkat fisik. Timer per menit dan antrean tidak memberikan SLA presisi detik. Jadwal audit berulang ditinggalkan **paused**; jadwal sekali jalan selesai tanpa next_due. Tidak ada eksekusi otomatis audit berikutnya.

Email/push/WhatsApp, event-driven connector schedules, goals/memory/proaktivitas, harga paket dan production deployment tetap mengikuti lingkup tiket masing-masing. Kontrak Muse dijadikan referensi pengalaman; backend scheduler Muse tidak diklaim direkonstruksi.
