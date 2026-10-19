# Tujuan personal NG-038

Goal menyimpan target pengguna, kriteria keberhasilan dan bukti kemajuan. Goal dapat berdiri tanpa Task atau Jadwal. Menyimpan atau menyelesaikan Goal tidak memberi izin menjalankan pekerjaan, mengaktifkan jadwal, melakukan aksi eksternal atau mengubah persona.

Sumber kontrak: [NG-038](../backlog/tasks/38-goals-umum-dengan-evidence-progress.md), [Perilaku Agent](../product/03-agent.md), [UX](../product/02-user-flow.md), serta P17/P09 pada [matriks penerimaan](development.md). Temuan Muse pada [REA-4](../research/muse-ai-v1/evidence/memory.md) menjadi referensi produk, bukan bukti backend Goal Ngertiin.

## Definisi dan keputusan

`user_goals` menyimpan owner, percakapan asal, status active/paused/completed/archived dan spesifikasi: title, target, criteria, horizon opsional, next_action dan budget_cap. Migration incremental `0009_personal_goals` mempertahankan data sebelumnya. Domain berada di `apps/backend/src/ngertiin/goals/`; frontend di `apps/web/src/features/goals/`.

Semua mutasi memakai proposal: create/update/pause/resume/complete/archive/evidence. Preview tersimpan 30 menit dan memuat isi exact, perubahan, bukti/sumber serta dampak future work. Panel dan chat memakai layanan keputusan yang sama. Chat menyediakan `read_user_goals` dan `preview_goal`; tool model tidak mempunyai operasi approve. Permintaan biasa untuk menyimpan Goal tidak memanggil Task atau Jadwal.

Owner berasal dari sesi server. Request key dan fingerprint mempertahankan receipt pada retry exact; key dengan isi berbeda ditolak. Keputusan berulang sama mengembalikan receipt; keputusan berlawanan, proposal expired dan revisi stale ditolak. Penolakan tetap tersedia saat expired. Source run chat harus masih memiliki lease ketika proposal dibuat. Kesalahan ID/spec dan konflik domain dikembalikan sebagai feedback tool agar model dapat membaca ulang data; nomor tiket/nama Goal bukan UUID.

Read/list, preview dan keputusan di panel tidak memanggil model dan tidak memerlukan allowance chat. Permintaan melalui chat mengikuti kuota percakapan. Implementasi membatasi 100 Goal tersimpan per akun, 20 proposal pending yang belum expired, 12 kriteria dan 12.000 UTF-8 bytes per spesifikasi. Detail memuat 50 Task, 100 Jadwal, 50 perubahan dan 50 catatan bukti terbaru; riwayat penuh tetap di database. Tool chat mengembalikan daftar ringkas, detail target, bukti serta maksimal 10 Task/Jadwal; catatan bukti dibatasi 500 karakter pada konteks model.

## Revisi dan future work

`revision` bertambah pada setiap keputusan yang diterapkan. `goal_revisions` menyimpan snapshot immutable untuk audit dan konflik dua tab. `plan_revision` menunjuk revisi yang mengubah target, kriteria atau horizon. Edit nama, next action dan anggaran mempertahankan plan_revision serta bukti yang sudah sah. Task menyimpan plan_revision dan snapshot spesifikasi/revision record yang dipakai ketika admission; pembaruan tidak menulis ulang intent Task lama.

| Keputusan | Dampak |
| --- | --- |
| Create | Menyimpan Goal active; belum membuat Task atau Jadwal. |
| Update target/kriteria/horizon | Membuat plan_revision baru; bukti lama menjadi riwayat. Jadwal dengan target lama dilewati sampai pengguna meninjau ulang kaitannya. |
| Update next action/nama/budget | Menyimpan revisi kontrol baru, mempertahankan bukti dan target. Budget tidak boleh lebih kecil dari biaya/reservasi yang sudah terikat. |
| Pause | Menahan admission Task baru, retry dan eksekusi Jadwal terkait berikutnya. Task yang sudah dibuat tetap memakai intent/izin semula; Stop terpisah. |
| Resume | Mengaktifkan admission target yang sama. Kebijakan scheduler tetap mengambil satu waktu terbaru setelah downtime; tidak mengejar seluruh slot yang terlewat. |
| Complete | Memerlukan keputusan pengguna dan seluruh kriteria mempunyai bukti current yang sah. Tidak membuat follow-up. |
| Archive | Menyimpan riwayat dan menahan pekerjaan berikutnya. Resume merupakan pembukaan kembali eksplisit. |

Goal pause/completed/archived dan target mismatch diperiksa pada dispatcher, lalu diperiksa ulang pada admission Task. Jadwal tetap memiliki definisi/waktu sendiri; occurrence dicatat skipped dengan alasan tanpa Task/job berbiaya. Jadwal mandiri tidak berubah. Edit/review Jadwal memakai `GoalRef` exact `{id, revision: plan_revision}`; mengaktifkannya tetap memerlukan proposal Jadwal tersendiri.

Semua keputusan dan admission memakai lock akun yang sama, lalu thread/resource, sehingga pause/edit dan due claim memiliki urutan yang jelas. Bila claim lebih dahulu membuat Task, keputusan Goal berikutnya tidak membatalkannya. Bila pause/edit lebih dahulu, dispatcher tidak membuat pekerjaan target lama. Receipt Task yang sudah dibuat tetap bisa dibaca ulang meskipun Goal kemudian dijeda.

## Bukti per kriteria

Panel menampilkan jumlah kriteria yang terpenuhi dan sumbernya. Tidak ada persentase perkiraan atau completion otomatis dari jumlah Task berhasil. Setiap penilaian memerlukan catatan dan keputusan pengguna; Gwen dapat mengusulkannya lewat chat berdasarkan sumber yang dibaca.

- Laporan pengguna diberi label `user_report` dan tidak dianggap verifikasi independen.
- Sumber Task mengikat owner, ID, revision, status dan hash hasil. Status met memerlukan Task succeeded. Task gagal/cancelled/queued tidak menjadi bukti met.
- Sumber Result mengikat ID/revision exact dan hash manifest serta Task asal, termasuk bila pemanggil hanya mengirim Result. Result/Task target lama atau milik Goal lain tidak diterima untuk target current. Task independen milik owner dapat ditautkan secara eksplisit sebagai bukti.
- Readback memeriksa kembali Task, Result dan revision file pada manifest. Sumber yang berubah/dihapus tidak dihitung met. Kriteria dapat dinilai ulang dengan bukti baru. Goal yang sudah completed tetap menyimpan keputusan historis, dengan penanda needs_review jika dukungannya hilang.

Catatan terbaru per kriteria dipilih menurut revision keputusan, bukan timestamp awal transaksi. Ini mencegah transaksi yang menunggu lock mengganti urutan penilaian. Perubahan target tidak membawa bukti lama menjadi bukti target baru secara otomatis. Bukti dan seluruh perubahan tetap dapat diperiksa pada riwayat.

## Anggaran dan hasil turunan

Goal mempunyai batas total internal token-work, default 360.000 unit dan rentang 30.000–3.000.000. Admission mengurangi penggunaan Task terminal dan reservasi penuh Task aktif lintas seluruh revisi Goal. Cap Task baru adalah minimum batas Task server, cap Jadwal jika ada, dan sisa Goal. Batas akun/global serta resource/storage/browser yang sudah ada tetap diperiksa domain masing-masing.

Retry memeriksa kembali Goal active, target current, sisa parent dan budget attempt lama sebelum enqueue. Pembaruan Result yang berasal dari Goal mewarisi Goal/target asal meskipun client tidak mengirim GoalRef; request tidak dapat melewati parent cap dengan menghilangkan field tersebut. Mengubah target Goal tidak diam-diam mengubah target pembaruan hasil lama.

Goal, Task, snapshot, reservasi dan enqueue tersimpan dalam transaksi yang sama. Kegagalan enqueue membatalkan pekerjaan/reservasi parsial. Usage model yang terkonfirmasi dan unknown outcome mengikuti ledger Task. Unit kerja Goal tidak mencakup invoice provider atau harga komersial; hard caps resource sandbox/browser tetap terpisah. Tidak ada polling model untuk menilai Goal; readback dukungan bukti memakai PostgreSQL.

## API dan UI

- GET `/goals`: daftar owner dan proposal pending.
- GET `/goals/{id}`: target, current evidence, kebutuhan review, budget, Task/Jadwal dan riwayat.
- POST `/goals/proposals`: preview exact.
- POST `/goals/proposals/{id}/decision`: keputusan pengguna yang idempotent.
- POST `/tasks` dan `ScheduleSpec`: GoalRef opsional, ditinjau ketika membuat pekerjaan.

Menu **Tujuan** menyediakan form dengan draft session, daftar, detail, bukti, sumber exact, riwayat serta kontrol lifecycle. Form Task/Jadwal menyediakan pilihan tujuan aktif. Pilihan target stale tidak diganti diam-diam; pengguna perlu memilih kembali. Kartu review disorot dan dibawa ke viewport setelah pengguna menyiapkan preview melalui panel. Proposal chat muncul di thread asal. Kesalahan query mempertahankan data terakhir dan menyediakan Coba lagi.

`make goal-inspect` menjalankan kontrak pada PostgreSQL/checkpoints disposable, termasuk faults dan races. Walkthrough model nyata, screenshot, usage dan batas bukti berada pada [penerimaan NG-038](goals-38-acceptance.md). Proaktivitas/reranking mengikuti NG-019/020; menambahkan Goal tidak mengaktifkan pengiriman proaktif.
