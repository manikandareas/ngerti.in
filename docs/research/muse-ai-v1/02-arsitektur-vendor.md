# 02 · Arsitektur, Runtime & Keamanan Muse

Sumber: [Notion](https://app.notion.com/p/3fdabdd6187381deaf1ad55aa8508cba) · Readback: 2026-10-18T06:04:56.780944+00:00

<!-- notion-content:start -->
<table_of_contents/>
Tanggal investigasi: 18 Oktober 2026. Bagian ini memisahkan dokumentasi vendor, observasi terhadap halaman publik, inferensi desain, dan hal yang belum diketahui. Tidak ada login, akun pengguna, atau eksekusi tugas Muse yang digunakan. Karena itu, klaim fungsi di bawah adalah **terdokumentasi vendor**, bukan hasil uji keberhasilan runtime.

## Dasar bukti dan batas verifikasi

Artikel desain bertanggal September 2026; artikel keamanan bertanggal 8 September 2026 dan secara eksplisit membahas arsitektur saat peluncuran. Help Center yang ditelusuri menampilkan pembaruan relatif “5 weeks ago”. Kebijakan privasi berlaku 17 September 2026. Pembacaan dilakukan kembali pada tanggal investigasi. Sebagian hasil Firecrawl memakai cache 17–18 Oktober 2026; metadata asal dipertahankan di berkas JSON, sehingga waktu pengambilan tidak disamakan dengan waktu deployment produk.
`https://muse.ai/` mengarah ke halaman autentikasi. Reader web untuk `/privacy` dan `/terms` memberikan halaman belum login, sedangkan Firecrawl memperoleh isi publik `/privacy` dengan status 200. Isi kebijakan diperlakukan sebagai dokumen resmi yang berhasil diekstrak, bukan bukti akses akun. Video tur resmi tidak menghasilkan transkrip melalui reader; tidak ada klaim detail yang diturunkan dari video tersebut.

## Kontrak pengalaman yang dijanjikan

### Percakapan, proaktivitas, dan hasil kerja

Fakta dari [How We Designed Muse](https://introducing.muse.ai/):
- Percakapan utama berlangsung terus; pengguna dapat menyela atau mengirim beberapa tugas tanpa menunggu balasan sebelumnya. Side chats memberi pemisahan konteks topik. Memori bertahan antarpercakapan.
- Setelah diberi tujuan, pekerjaan dapat berjalan berdasarkan jadwal maupun kejadian relevan, termasuk ketika aplikasi ditutup. Sesudah pekerjaan latar selesai, Muse menilai apakah hasil layak diberitahukan.
- Pesan proaktif ditujukan untuk informasi baru yang berarti atau kebutuhan masukan pengguna. Intensitas dapat dinaikkan, diturunkan, atau dimatikan melalui percakapan.
- Nama, avatar, dan gaya agent dapat dipersonalisasi. Gelembung percakapan dipilih untuk membuat pesan yang datang tidak berurutan tetap terbaca.
- Goals menampilkan tujuan, rencana, dan pelacakan; pengguna dapat berinteraksi dari tab maupun chat. Ideas dan tip onboarding membantu menemukan kegunaan berdasarkan tujuan, pola, dan percakapan.
- Artifacts merupakan keluaran interaktif yang dapat dikirim dalam chat sekaligus hidup di luar chat; contoh mencakup dokumen, PDF, laman, panduan belajar, pelacak pengeluaran, dan dashboard.
- Persetujuan terstruktur dan penyimpanan kredensial menjadi kontrol UI eksplisit. Default membolehkan browsing umum dan meminta keterlibatan untuk tindakan sulit dibatalkan.

### Permukaan produk dan kapasitas komputasi

Menurut [landing resmi Muse](https://ai.meta.com/muse/), Secure VM adalah komputer Linux persisten dan terisolasi dengan browser, penyimpanan, CPU, serta memori untuk bekerja. Pengguna dapat mengambil alih browser. Halaman menyebut penggunaan melalui mobile, Mac, dan WhatsApp; aplikasi Mac dapat berinteraksi dengan berkas, aplikasi, dan tab desktop. Klaim Mac ini belum menjelaskan batas akses lokal atau implementasinya.
Halaman menawarkan paket gratis dengan batas penggunaan, kemudian pilihan berlangganan atau menunggu reset. Besaran limit, interval reset, harga, dan kapasitas VM tidak dijelaskan dalam bukti ini. Muse for Small Business disebut sebagai kumpulan skills dan connectors tambahan. Integrasi 1Password masih disebut akan datang. Proteksi pembelian Link berlaku bagi pembelian yang memenuhi ketentuan; itu bukan jaminan untuk semua tindakan agent. [Sumber](https://ai.meta.com/muse/).

## Mekanisme runtime dan pemisahan kepercayaan

### Komponen pada diagram resmi

Diagram arsitektur resmi memperlihatkan pemisahan UI, runtime cell, host services dan Sentinel. Gambar vendor dipertahankan sebagai referensi, bukan konfigurasi produksi yang diaudit. [Sumber diagram](https://research.meta.ai/articles/security-and-safety-for-ai-agents-our-approach-with-hatch/system-architecture-v3.png).
![Diagram arsitektur resmi Muse](https://research.meta.ai/articles/security-and-safety-for-ai-agents-our-approach-with-hatch/system-architecture-v3.png)

### Detail teknis dari artikel keamanan

Fakta teknis vendor dari [How We Built Safety Into Muse](https://research.meta.ai/blog/security-and-safety-for-ai-agents-our-approach-with-muse):

| Area | Mekanisme terdokumentasi |
| --- | --- |
| Runtime | `systemd-nspawn`/Debian; root→host-unprivileged; syscall/capabilities dibatasi: tanpa `io_uring`, `CAP_SYS_PTRACE`, `CAP_NET_ADMIN` |
| State | VM/user; PostgreSQL terpisah dari runtime/credentials; backup berkelanjutan |
| Agent | CLI, skills, concurrent subagents, cron; pelatihan tool-calling/konteks/koordinasi |
| Egress | Sentinel memeriksa hostname, IP resolved/final, port, protokol, method, path, decoded request; pembatasan SSRF |
| Secrets | `authd` menerbitkan surrogate; kredensial asli disisipkan sesudah otorisasi di batas jaringan |
| Taint | Pembacaan data pengguna menandai proses; tainted/unverifiable kehilangan auto-allow; eBPF cgroup/LSM melacak propagasi |
| Connector | CLI→typed arguments/file descriptors; worker host: ACL, credential allowlist/cgroup |
| Approval | Pending menghentikan eksekusi; client↔Sentinel langsung; grant terikat destination/use-case, sekali/session/task/waktu/perpetual |
| Browser agent | Subagent khusus; broker CDP; accessibility snapshot, tanpa raw DOM/page-JS/devtools; pause ketika takeover/credential-fill |
| Pertahanan | Input eksternal untrusted; classifiers independen memeriksa inference, tools/files, DOM/media/download, kebocoran, form berisiko |
| Email | OTP, reset-password, magic-link difilter deterministik dan classifier |
| Pembayaran | Persetujuan tiap checkout; kartu sekali pakai terikat merchant, nominal, masa berlaku |

Dokumentasi tersebut menjelaskan batas yang dirancang vendor; audit independen dan implementasi deployed tidak diperiksa.

## Kredensial, permissions, dan pengawasan

### Apa yang dapat pengguna atur

[Panduan approval resmi](https://www.meta.com/help/artificial-intelligence/1385290430137537/) menjabarkan:

| Kontrol | Perilaku yang didokumentasikan |
| --- | --- |
| Connector defaults | Ask for some actions: setiap write dan read penting; Always ask: setiap tindakan |
| Web defaults | Ask for some actions: ketika informasi mungkin dibagikan atau situs belum dikenal; Always ask: setiap situs |
| Grant UI | Allow once; untuk task; untuk site; Always allow untuk connector; Deny |
| Detail permintaan | See task details sebelum memutuskan |
| Pengelolaan | Permissions per connector, artifact/scheduled task, dan situs yang diizinkan; izin situs dapat dicabut |
| Status | Avatar memperlihatkan status langsung; Activity log mencatat tindakan dan izin secara kronologis |
| Jadwal | Upcoming menampilkan task dan pengingat |
| Penghentian | Sebagian pekerjaan bisa dihentikan/diminta undo lewat chat; email yang sudah terkirim tidak dapat ditarik oleh janji umum ini |

Panduan mengingatkan bahwa agent dapat salah, pengguna perlu mengawasi, memperbaiki kesalahan, dan meninjau izin. Ini memperjelas pembagian tanggung jawab produk; tidak membuktikan mekanisme rollback universal. [Sumber](https://www.meta.com/help/artificial-intelligence/1385290430137537/).

### Browser yang berbagi kendali

[Panduan browser resmi](https://www.meta.com/help/artificial-intelligence/2124746764949121/) menyebut browser di dalam chat yang dapat dikendalikan pengguna maupun Muse. Contohnya appointment, pembelian, formulir, dan pemantauan harga. Open browser membuka tampilan observasi; Take control menjeda Muse; Stop the task mengakhiri pekerjaan browser.
Username/password disimpan di Secure Credentials Store, memungkinkan tindakan yang diotorisasi tanpa model melihat password. Muse dapat menerima essential cookies. Pengguna dapat meminta daftar URL yang dikunjungi atau cookie yang diterima melalui chat. Default persetujuan browser tersedia di Settings → Permissions → Web access default. Ini mendokumentasikan kontrol dan janji visibilitas; kemampuan ekspor riwayat, retensi cookie, pemisahan profil browser, dan pemulihan sesi tidak ditentukan oleh panduan ini. [Sumber](https://www.meta.com/help/artificial-intelligence/2124746764949121/).

### Apa arti klaim keamanan pada UI bantuan

[Panduan privacy/safety/security](https://www.meta.com/help/artificial-intelligence/1047255454427887/) menjelaskan bahwa sebelum memakai kredensial, pemeriksaan menilai layanan tujuan, apakah layanan dihubungkan/diotorisasi, serta izin untuk jenis tindakan. Sebagian pemeriksaan penting berjalan terpisah dari model. VM antar pengguna terisolasi dan memiliki backup; Confidential VM masih digambarkan sebagai pilihan masa depan. Standar keselamatan juga mencakup konten/tindakan berbahaya dan ilegal.
Pengguna web dapat melaporkan masalah melalui Settings → Report an issue; aplikasi menyediakan pelaporan melalui pengaturan atau menggoyangkan ponsel. Panduan tetap menyatakan sistem otomatis tidak sempurna. Klaim ini merupakan penjelasan vendor tentang desain dan jalur pelaporan, bukan ukuran tingkat kegagalan aktual. [Sumber](https://www.meta.com/help/artificial-intelligence/1047255454427887/).

## Connectors dan skills

### Built-in dan custom connector

[Panduan connectors](https://www.meta.com/help/artificial-intelligence/1687253048996149/) mendokumentasikan penghubungan lewat chat atau Settings → Connectors → Connect → Continue → otorisasi penyedia. Data dipertukarkan sesuai tugas; koneksi email memberi pencarian, tanpa otomatis mengunduh seluruh inbox. Beberapa connector dapat mengirim perubahan secara proaktif, misalnya kalender, dan perilaku tersebut dijelaskan sebelum koneksi.
Read-only dapat dipilih pada banyak connector. Disconnect menghentikan pertukaran berikutnya, namun informasi lama dapat tertinggal di chat/memory. Facebook, Instagram, dan Threads tersambung otomatis apabila akun berada dalam Accounts Center yang sama. Apple Health dan Android SMS dikelola melalui izin perangkat setelah setup.
Pengguna dapat meminta custom connector untuk layanan lain; proses dapat memerlukan informasi API dan menggunakan Secure Credentials Store. **Meta tidak mereview custom connector atau cara connector menggunakan informasi.** Penghubung bawaan dan buatan agent karena itu tidak boleh dianggap memiliki tingkat review yang sama. Informasi Workspace APIs tunduk pada Google User Data Policy beserta Limited Use. [Sumber](https://www.meta.com/help/artificial-intelligence/1687253048996149/).

### Pemilihan dan penggunaan skills

[Panduan skills](https://www.meta.com/help/artificial-intelligence/2797651547267109/) menyebut skills bawaan Meta, otomatis tersedia tanpa instalasi terpisah. Agent memilih kemampuan sesuai permintaan dan dapat menggabungkannya; podcast sejarah mengombinasikan audio generation dan web browsing, sementara PDF menggunakan document creation.
Contoh lain meliputi riset, gambar, dashboard, digest, dan jadwal. Kebutuhan akses mengikuti pekerjaan: lokasi untuk pengingat berbasis tempat, berkas untuk tugas berbasis file, internet untuk browsing. Ideas membantu menemukan kegunaan dan Activity log memperlihatkan skills yang dipakai. Panduan ini tidak membuka format skill, registry, dependency resolver, proses versioning, atau cara skills buatan agent diuji. [Sumber](https://www.meta.com/help/artificial-intelligence/2797651547267109/).

## Memory, identity, artifacts, jadwal, dan penghapusan

[Panduan pengelolaan data](https://www.meta.com/help/artificial-intelligence/2225571704857152/) memberi peta kontrol berikut:

| Informasi | Permukaan pengguna |
| --- | --- |
| Chat | Chats; pesan dan side chat dapat dihapus; keseluruhan main chat dihapus melalui reset |
| Goals | Goals; tiap goal dapat dihapus |
| Artifact | Library; dokumen, gambar, video, podcast, dan berkas dapat dibuka/edit/hapus |
| Berkas sistem | Library → System Files |
| Pengingat/jadwal | Assistant → Upcoming; update/hapus melalui chat |
| Memori pengguna | Assistant → Identity → Memory; `Memory.md` dapat diedit/dihapus langsung |
| Karakter agent | Identity → Soul; `Soul.md` menyimpan karakter, batas, prinsip |
| Identitas agent | Identity; `Identity.md` mencakup nama, creature, vibe, tagline |

Hapus pesan/file tidak otomatis menghapus informasi yang sudah dipelajari. Forget mencari topik/orang dalam memory dan supporting files lalu menghapus sebisanya. Reset permanen menghapus chat, berkas, dan active tasks. Data controls menyediakan unduhan chats/files/agent information; ekspor account information tersedia terpisah di Accounts Center. Opsi pelatihan AI aktif awalnya dan dapat dimatikan, termasuk untuk interaksi sebelumnya. [Sumber](https://www.meta.com/help/artificial-intelligence/2225571704857152/).

### Batas penggunaan data menurut kebijakan

[Muse Privacy Policy](https://muse.ai/privacy) menyatakan kebijakan khusus Muse mengungguli kebijakan Meta apabila bertentangan. Akun dapat dibuat terpisah dari Accounts Center produk Meta lain; akun terpisah tidak membagikan interaksi/data VM ke produk Meta lain. Percakapan dan data VM tidak dibagikan ke sistem iklan Meta, termasuk ketika berada dalam Accounts Center bersama.
Pengaturan pelatihan mencakup informasi yang diperoleh dari services/connectors saat mengerjakan tugas. Bila diizinkan, kategori PII tertentu dihapus dan interaksi dilepaskan dari identitas akun. Kebijakan juga mencakup pengumpulan aktivitas/metadata: fitur, situs, tindakan/transaksi, waktu, dan frekuensi. Penyedia connector memiliki aturan privasinya sendiri. Pemutusan connector tidak menjanjikan penghapusan memori yang sudah terbentuk. Di luar pengecualian khusus, penggabungan akun memungkinkan penggunaan lintas profil/perangkat di Accounts Center. [Sumber](https://muse.ai/privacy).

## Batas interpretasi

Artikel arsitektur menjelaskan desain saat peluncuran. Frontend snapshot yang diteliti juga memuat enrollment confidential-VM; keberadaan branch tersebut tidak menetapkan rollout, paket, atau keberhasilan TEE pada akun ini. Rincian yang belum diketahui dan rancangan Ngertiin dibahas pada halaman bukti serta blueprint. Tidak ada klaim keamanan vendor yang dianggap sebagai audit independen.
<!-- notion-content:end -->
