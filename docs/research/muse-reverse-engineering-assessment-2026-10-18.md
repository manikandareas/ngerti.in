# Muse: penilaian awal reverse engineering untuk V1

Tanggal: 18 Oktober 2026. Status: **penilaian kelayakan dan observasi UI awal; investigasi implementasi belum lengkap**.

Pembaruan pada hari yang sama: [audit dan perbaikan REA](rea-environment-audit-2026-10-18.md) sudah menyelaraskan CLI, skill, runtime, dan registrasi Codex. Server MCP serta analisis browser/JavaScript lolos uji nyata memakai fixture terisolasi. Sesi Codex yang sudah berjalan masih memerlukan restart/reconnect untuk memuat tool baru. Ledger lingkungan di bawah dipertahankan sebagai catatan kondisi sebelum perbaikan; investigasi Muse sendiri belum lengkap.

## Tujuan dan batas bukti

Target adalah Muse di `https://muse.ai/`, sesuai percakapan tentang arah V1 asisten personal dan V2 artefak pembelajaran. Pemeriksaan memakai skill lokal `reverse-engineer-anything`, diagnostik/CLI REA, dan observasi halaman Muse yang sudah terbuka pada browser pengguna.

Reverse engineering dapat menjelaskan frontend yang dikirim ke browser, alur yang diamati, serta batas integrasi yang terlihat. Source backend, implementasi scheduler internal, penyimpanan server, prompt tersembunyi, dan konfigurasi deployment tidak otomatis dapat diperoleh dari aplikasi web.

Label `UI-*` dan `ENV-*` di bawah adalah indeks temuan laporan ini, **bukan Evidence ID yang diterbitkan REA**. Capture bundle/runtime REA belum dilakukan. Laporan menyimpan struktur produk, tanpa menyalin isi percakapan, identitas goal, atau dokumen pribadi pengguna.

## Checklist investigasi

| Pertanyaan | Status | Dasar |
| --- | --- | --- |
| Apakah target dan akses aplikasi jelas? | Terjawab | Tab Muse tersedia dan menampilkan aplikasi setelah loading. |
| Bagaimana pembagian layar utama produk? | Sebagian terjawab | Chat, Goals, dan Library diperiksa; layar lain baru terlihat pada navigasi. |
| Apakah REA dapat dipanggil? | Sebagian terjawab | CLI 4.0.1 bisa dijalankan; tool MCP tidak tersedia dalam sesi aktif. |
| Apakah browser siap untuk capture REA? | Belum siap | Tidak ditemukan endpoint CDP pada browser Brave yang sedang berjalan. |
| Bagaimana kontrak API, streaming, dan state frontend? | Belum ditelusuri | Memerlukan capture runtime/bundle atau artefak JavaScript yang tersedia. |
| Bagaimana scheduler, retry, takeover, dan memory benar-benar bekerja? | Belum diuji | Keberadaan UI atau tulisan assistant tidak membuktikan mekanisme tersebut. |
| Apakah seluruh internal backend dapat direkonstruksi? | Tidak dapat dipastikan dari bukti saat ini | Backend yang tidak dikirim ke client tetap tidak terlihat. |

## Ledger temuan awal

| ID | Observasi langsung | Jenis / keyakinan | Batas dan pertanyaan lanjutan |
| --- | --- | --- | --- |
| UI-01 | Chat mempunyai navigasi Search, Feed, Ideas, Goals, Library, serta kontrol membuka main/side chats. | UI live / tinggi untuk keberadaan kontrol | Pencarian, Feed, Ideas, dan lifecycle side chat belum diuji. |
| UI-02 | Chat menampilkan kartu hasil berlabel Artifact dengan preview dan kontrol pembukaan. | UI live / tinggi untuk tampilan hasil tersimpan | Pembuatan, revisi, publikasi, dan rendering artefak belum ditelusuri. |
| UI-03 | `/goals` mempunyai bagian Tracking, ringkasan status goal, checkbox penyelesaian, menu opsi, kategori pembuatan, dan kontrol side-by-side chat. | UI live / tinggi untuk struktur layar | Tidak mengubah goal atau checkbox. Sinkronisasi dengan agent dan eksekusi background belum diverifikasi. |
| UI-04 | `/library/artifacts` membedakan All artifacts, Documents, Web artifacts, Images, Videos, Podcasts, dan System files. | UI live / tinggi untuk kategori yang ditampilkan | Keberadaan kategori tidak membuktikan semua kemampuan generation atau playback telah diuji. |
| UI-05 | Library menyediakan pencarian, sort, selection, create-artifact, item recent, dan menu per item. Item yang terlihat mencakup artefak, teks, dan HTML. | UI live / tinggi untuk kontrol dan jenis item terlihat | Tidak membuat, mengedit, membagikan, atau menghapus artefak. |
| ENV-01 | `npx -y rea-agents@4.0.1 --help` berhasil dan menyediakan `list-browser-targets`, `inspect-web-page`, `analyze-web-bundle`, serta tracing JavaScript. | CLI langsung / tinggi | Keberhasilan help belum membuktikan capture terhadap Muse berhasil. |
| ENV-02 | Tool MCP REA tidak muncul pada inventory tool sesi aktif. | Inventory sesi / tinggi | Tidak menyimpulkan bahwa server tidak terpasang di mesin; sesi mungkin perlu dimulai ulang setelah instalasi. |
| ENV-03 | Brave yang sedang berjalan tidak mempunyai flag remote-debugging port/pipe; file DevToolsActivePort pada lokasi profil default juga tidak tersedia. | Pemeriksaan lokal terbatas / tinggi untuk proses yang diperiksa | Belum ada endpoint yang dapat dipakai untuk `list-browser-targets`. Pemeriksaan ini tidak mencakup seluruh kemungkinan browser/profile lain. |
| ENV-04 | Diagnostik `rea-agents@latest` memakai 6.5.0 dan menandai Node 25.8.0 tidak didukung, skill versi 24 berbeda dari versi 42 yang diharapkan, serta registrasi Codex menunjuk 4.0.1. | Diagnostik langsung / tinggi untuk perbedaan versi | Ini hasil audit terhadap versi terbaru, bukan bukti bahwa setiap perintah 4.0.1 gagal. CLI 4.0.1 tetap berhasil menampilkan help. |

## Hal yang dapat menjadi acuan implementasi

Observasi UI mendukung pemisahan konsep percakapan, goal jangka panjang, dan hasil pekerjaan. Ketiganya dapat saling terhubung tanpa menyimpan seluruh state sebagai pesan chat. Ini adalah **pilihan desain yang diusulkan untuk aplikasi kita**, bukan klaim tentang skema database Muse.

Library menunjukkan bahwa pengalaman V1 perlu mempertimbangkan hasil yang dapat ditemukan dan dibuka kembali. V2 dapat menambahkan Course/Practice sebagai jenis artefak yang memiliki renderer dan perilaku domain tersendiri. Progress, attempts, dan nilai perlu tetap dimiliki domain pembelajaran; observasi Muse saat ini tidak memverifikasi domain tersebut.

Dokumentasi resmi juga dapat menjadi bukti terpisah dari UI: [pengenalan Muse](https://introducing.muse.ai/) dan [penjelasan arsitektur/keamanan Muse](https://security.muse.ai/). Pernyataan vendor harus ditandai sebagai dokumentasi vendor, bukan hasil dekompilasi atau pengujian runtime kita.

## Tahap investigasi berikutnya

1. Siapkan akses capture yang terbatas pada target Muse. Untuk jalur browser REA, gunakan endpoint CDP browser yang memang tersedia, kemudian `list-browser-targets` dengan filter origin `https://muse.ai`. Jangan menyamakan koneksi ekstensi browser dengan endpoint CDP.
2. Inventarisasi fitur dengan pertanyaan per subsistem: chat/side chat, goals, memory/persona, pekerjaan background/jadwal, workspace/computer view, integrasi/approval, dan hasil/library.
3. Capture bundle dan source map yang memang tersedia. Trace satu fitur dari entry UI, perubahan state, batas request yang terlihat, hingga hasil. Simpan Evidence ID asli, identitas/digest artefak, dan cakupan capture.
4. Jalankan skenario terkontrol untuk pertanyaan dinamis: pesan saat agent masih bekerja, reconnect, approval tertunda, pekerjaan terjadwal, kegagalan, pembukaan/revisi artefak, serta takeover jika tersedia. Perubahan nyata pada layanan eksternal bukan prasyarat untuk pengujian awal.
5. Susun matriks fitur: bukti, perilaku yang perlu ditiru, desain implementasi yang diusulkan, biaya/risiko teknis, dan acceptance criteria. Perilaku backend yang tidak dapat diamati tetap dicatat sebagai unknown atau inferensi.
6. Gunakan matriks tersebut untuk merevisi scope dan dependensi backlog V1. Implementasi Course/player/Practice tetap dipetakan ke V2 sesuai arah yang sedang dibahas.

Jika memilih menyelaraskan instalasi REA, mulai dengan rencana yang dapat direview: `npx -y rea-agents@latest setup --client codex --dry-run`. Skill mewajibkan persetujuan sebelum setup menulis konfigurasi atau menginstal Hopper. Tidak ada setup, perubahan konfigurasi browser, instalasi provider, atau perubahan backlog Notion pada pemeriksaan ini.

## Deliverable yang diharapkan dari investigasi lengkap

- Peta fitur dan alur pengguna beserta state loading, pending, running, waiting-for-approval, success, dan failure yang benar-benar diamati.
- Catatan frontend, batas API, dan rendering artefak dengan Evidence ID serta batas cakupan.
- Pemisahan observasi, inferensi, unknown, dan pilihan implementasi aplikasi kita.
- Blueprint V1 dan perubahan backlog yang dapat direview berdasarkan perilaku produk, termasuk jalur pilot pelanggan pertama.

Belum ada bukti yang cukup untuk menyatakan internal Muse telah direkonstruksi atau implementasi aplikasi kita sudah setara.
