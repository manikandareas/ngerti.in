# Persona: Identity dan Soul (NG-016)

Status implementasi dan bukti penerimaan mengikuti [NG-016](../backlog/tasks/16-perubahan-soul-atas-permintaan-dan-hitl.md).

## Pengalaman pengguna

Avatar/nama asisten membuka panel **Aktivitas / Mendatang / Identitas**. Aktivitas membaca Task yang sudah ada; Mendatang membaca jadwal aktif. Settings menyediakan akses alternatif menuju Identitas.

- **Profil / Identity:** nama, deskripsi singkat dan pilihan avatar Gwen atau inisial nama. Upload/generasi avatar baru tidak dicakup NG-016.
- **Karakter / Soul:** dokumen Markdown yang menjelaskan cara asisten berbicara dan membantu.
- **Memory:** domain informasi pengguna yang terpisah, kini tersedia melalui NG-017/018. Capture/recall serta kendali pengguna dijelaskan di [memory-runtime.md](memory-runtime.md).
- Goals, Task, jadwal dan proaktivitas mempunyai kewenangan serta state masing-masing. Mengubah Soul tidak membuat grant, schedule atau Goal.

Rujukan: [observasi avatar/editor Muse](../research/muse-ai-v1/01-produk-dan-ux.md), [pemetaan Identity/Soul/Memory](../research/muse-ai-v1/02-arsitektur-vendor.md). Editor SOUL teramati pada snapshot 18 Oktober 2026; autosave, rollback, konflik dan approval Muse belum diuji. Revision/approval di bawah adalah kontrak Ngertiin.

## Perubahan dan keputusan

Edit langsung menampilkan formulir/dokumen dan tinjauan perubahan, lalu **Simpan perubahan** menjadi keputusan owner atas isi exact. Chat menyediakan `read_agent_profile` serta `preview_persona`; model hanya menyiapkan usulan immutable, pengguna memilih **Terapkan perubahan / Tolak** pada kartu. Usulan mengikat revision aktif dan keseluruhan isi sebelum/sesudah. TTL 30 menit, maksimal 20 usulan chat aktif per akun. Edit langsung dan restore tidak memerlukan inference atau allowance chat.

`agent_profiles` menyimpan satu revision aktif per owner. `persona_revisions` menyimpan snapshot immutable Identity/Soul, asal perubahan dan optional restored_from. `persona_proposals` menyimpan request key/fingerprint, base revision, isi exact, sumber run/thread dan keputusan proposed/approved/rejected/expired. Mutasi diserialkan melalui account lock, lalu mengubah profil, menambah history dan menyelesaikan receipt dalam satu transaksi. Retry exact mengembalikan receipt sebelumnya; request key dengan isi lain mendapat 409. Keputusan bertentangan, kedaluwarsa atau base revision stale tidak diterapkan.

Restore meninjau isi versi terdahulu terhadap versi aktif dan membuat revision baru. History dipaginasi 20 revision per halaman. Query kartu mendahulukan usulan chat aktif agar edit langsung yang banyak tidak menyembunyikan keputusan tertunda. Endpoint selalu mendapatkan owner dari autentikasi; ID milik akun lain mendapat 404.

Draft editor berada di sessionStorage bertipe/berversi dan dipisahkan per akun. Menutup panel atau reload tidak menyimpan perubahan ke server. Jika tab lain mengubah profil, draft dipertahankan dan simpan diblokir. **Tinjau draft pada versi terbaru** menggabungkan hanya field yang benar-benar diedit ke versi aktif; pengguna tetap menekan Simpan setelah meninjau. Field lain dari tab lain dipertahankan. Storage browser yang tidak tersedia tidak menghalangi penyimpanan server; draft/receipt memakai fallback dalam memori.

Desktop menyediakan dokumen dan chat berdampingan. **Bicarakan lewat chat** mengisi draft pembahasan tanpa mengirim dan mempertahankan draft percakapan sebelumnya. Mobile membuka panel penuh, lalu kembali ke composer ketika membahas dokumen. Focus, Escape, tab keyboard dan reduced motion mengikuti primitive lokal. Kartu yang sudah diputuskan menampilkan ringkasan dengan detail yang dapat dibuka.

## Snapshot eksekusi dan batas kepercayaan

`persona.policy.CORE` menyimpan instruksi aplikasi terpisah dari Soul yang dapat diedit. UI hanya menerima profil/karakter pengguna. Soul tidak memberi akses tool, file, browser atau jadwal, dan konten eksternal tetap data. Model task/browser/Python tidak mendapatkan tool perubahan persona.

Chat mengikat `persona_snapshot` ketika run dibuat. Claim/retry/checkpoint memakai snapshot tersebut. Run lama yang dibuat proses sebelum NG-016 mengikat profil sekali saat claim pertama bila snapshot kosong. Task menyimpan persona dalam input_snapshot ketika dibuat; retry memakai snapshot yang sama. Occurrence Schedule baru mengikat persona aktif ketika dimaterialisasi menjadi Task, tidak ketika jadwal pertama kali dibuat. Task yang sudah berjalan tidak mengikuti perubahan berikutnya.

Konteks persona dibatasi 4000 karakter dan 6000 byte Soul, nama 50 karakter dan tagline 160 karakter. Konteks tersebut masuk ceiling model yang sudah ada dan dipasang satu kali dalam instruksi model; tidak mengubah hard caps akun/global. UI edit, keputusan dan restore tidak membuat panggilan model baru.

## Sambungan Memory berikutnya

`persona.store.memory_exclusions(conn, owner, run_ids)` memberi referensi run dan status keputusan untuk batch maksimal 100 sumber. Capture NG-017 wajib memperlakukannya sebagai instruksi persona, bukan fakta/preferensi pengguna; terutama usulan rejected/expired tidak boleh dihidupkan sebagai aturan melalui memory. Referensi serta keputusan durable tersedia sekarang. Capture/recall dan uji end-to-end ekstraksi setelah rejection tetap menjadi pekerjaan NG-017, bukan kemampuan yang diklaim NG-016.

## Operasi dan verifikasi

Migrasi incremental `0007_persona_revisions` mempertahankan akun, chat, Task dan jadwal. Hanya Soul yang sama persis dengan default aplikasi lama dinormalisasi menjadi karakter publik; profil custom dipertahankan. Baseline history dan snapshot run yang sudah ada diisi tanpa reset. Jalankan `make migrate`, lalu restart worker agar tool persona dimuat; API autoreload tidak mereload worker.

`make persona-inspect` menjalankan owner/race/retry/revision/snapshot contracts dalam database PostgreSQL disposable, tanpa model/provider. Bukti fitur nyata, viewport, hasil model, batas pengujian dan hasil static/build dicatat pada [penerimaan NG-016](persona-16-acceptance.md).
