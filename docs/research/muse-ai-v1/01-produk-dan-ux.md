# 01 · Peta Produk, UX & Interaksi

Sumber: [Notion](https://app.notion.com/p/3fdabdd6187381fd93a0e4ff81a00437) · Readback: 2026-10-18T06:04:56.780944+00:00

<!-- notion-content:start -->
<table_of_contents/>
Pemeriksaan langsung: 18 Oktober 2026, browser web desktop yang sudah login. Nama, isi chat, goal, isi memori, kredensial, dan dokumen pribadi tidak dimasukkan dalam laporan. `UI-*` adalah indeks observasi penulis, bukan Evidence ID REA. Kontrol yang terlihat belum berarti seluruh jalur submit/failure telah diuji.

## 1. Information architecture

| Permukaan | Fungsi yang terlihat | Detail interaksi | Batas bukti |
| --- | --- | --- | --- |
| Chat | Percakapan utama dan side chats | Rail navigasi; panel Chats; main chat, messaging channel, side chats; search daftar; unread; composer Message dan Attach file; avatar agent | Create side chat dan pengiriman dua pesan audit dicoba; attachment belum diunggah |
| Search | Pencarian aplikasi | Dialog Search Muse dan combobox hasil | Dialog dibuka; ranking, scope indeks, dan fresh indexing belum diuji |
| Feed | Update yang dikurasi | Kartu update dengan judul/ringkasan; reaksi Love | Feed berhasil dimuat; algoritme pemilihan, frekuensi dan redelivery belum diketahui |
| Ideas | Penemuan pekerjaan yang dapat dibantu | Featured ideas, kelompok kategori, kartu judul/deskripsi, menu per ide, side-by-side chat | Ide personal dan contoh komunitas ditampilkan; tidak mengeksekusi kartu |
| Goals | Pelacakan tujuan | Tracking, ringkasan/status, checkbox, menu, kategori pembuatan dan side-by-side chat | Struktur dibaca pada investigasi awal; tidak mengubah tujuan |
| Library | Hasil di luar percakapan | All artifacts, Documents, Web artifacts, Images, Videos, Podcasts, System files; search, sort, selection, create dan menu per item | Kategori dan item dibaca; tidak semua generator/format diuji |
| Assistant panel | Status dan kontrol agent | Avatar membuka Activity, Upcoming, Identity | Ketiga tab dibuka; Activity tidak diaudit menyeluruh |
| Identity | Karakter dan memori | Tautan SOUL dan MEMORY dengan penanda ACCESS WITH CARE | SOUL membuka editor Markdown; tidak ada perubahan konten |
| Settings | Kontrol akun dan kewenangan | General, Connectors, Wallet, Secure store, Permissions, Messaging channels, Devices, Data controls, Help, Legal | Struktur dibaca; tidak melakukan checkout, grant baru, reset atau logout |

Kategori Library adalah kontrak navigasi; tidak otomatis membuktikan video/podcast generation tersedia pada semua paket. Nama channel, perangkat, dan koneksi dapat berubah berdasarkan akun, platform, wilayah dan rollout.

## 2. Chat: detail yang perlu ditiru

Main chat berperan sebagai hubungan berkelanjutan dengan satu agent personal. Side chat memisahkan konteks tugas/topik tanpa membuat identitas agent baru. Dokumen desain resmi menyatakan pengguna dapat menyela dan memberi beberapa pekerjaan; hubungan antara topik terpisah dan memory global belum dijelaskan sebagai boundary privasi. [Desain Muse](https://introducing.muse.ai/).
Observasi UI memperlihatkan bubble pesan, timestamp, Copy response, Reply, reaction dan More options. Unread menjadi bagian navigasi daftar chat. Hasil dapat muncul sebagai kartu artifact dengan preview dan kontrol pembukaan. Avatar menjadi entry status/aktivitas; contohnya status Building artifact pada uji terkontrol.
Composer tetap menerima pesan kedua ketika pekerjaan pertama masih berjalan pada side chat audit. Respons aritmetika muncul sementara status pembangunan artifact masih berjalan. Ini membuktikan penerimaan beberapa instruksi pada kondisi uji tersebut; belum membuktikan fairness, jumlah concurrency maksimum, interrupt latency, atau isolasi dua task yang sama-sama menulis satu file.
**Kontrak Ngertiin yang diusulkan:** pisahkan chat turn, task execution dan delivery. Hasil task lama harus punya causal reference, bukan ditambahkan sebagai token milik respons terbaru. Pengguna tetap dapat berbicara ketika task berjalan atau menunggu izin. Draft dan request identity harus bertahan saat refresh/reconnect.

## 3. Goals, Ideas dan Feed

Goals merepresentasikan outcome berumur panjang; task adalah pekerjaan konkret yang mendukungnya. Ideas menawarkan pekerjaan berikutnya sebelum pengguna mengetahui prompt yang tepat. Feed menyampaikan update yang dapat dinikmati tanpa memulai task baru. Ketiga konsep saling mendukung, tetapi tidak perlu menjadi tiga salinan tabel task.
Ideas yang teramati terdiri dari featured cards dan kelompok seperti Productivity, Financial Management, Health & Fitness, Relationships dan Shopping. Label kategori adalah observasi snapshot, bukan taxonomy stabil yang dijanjikan vendor. Konten personal pada kartu tidak disalin ke laporan.
**Usulan V1:** goal memiliki success criteria, status, next action dan referensi evidence; ide memiliki proposed intent serta alasan relevansi; feed item memiliki sumber, waktu, dedup identity, feedback dan status read. Menekan ide boleh mengisi/menjelaskan permintaan; jangan otomatis memberi semua kewenangan yang diperlukan task. Feedback Love tidak boleh dianggap izin mengirim pesan eksternal atau melakukan pembelian.

## 4. Library, artefak dan editor sistem

Library mengangkat hasil menjadi objek yang dapat ditemukan ulang, terlepas dari posisi pesan asal. Kartu artifact menghubungkan percakapan dengan viewer. System files memperlihatkan bahwa sebagian state agent juga dapat diinspeksi sebagai berkas.
SOUL dibuka melalui Identity → SOUL. UI menampilkan `SOUL.md`, text entry/editor serta toolbar Bold, Italic, Heading 1–3, Bullet list dan Numbered list; ada More actions, Close dan Open side-by-side chat. Tidak ada pengetikan, penyimpanan atau pengujian rollback pada file sistem. Karena itu, autosave, konflik edit lintas client dan waktu penerapan perubahan masih unknown.
**Usulan V1:** berkas input/output dan hasil HTML/dokumen perlu persistent identity serta revision. Viewer menampilkan tipe, status, timestamp, sumber task dan tindakan sesuai capability. Hasil HTML/JS dijalankan pada boundary yang terpisah dari session aplikasi; manifest menyatakan entrypoint dan asset references. Learning artifact V2 menambahkan renderer bertipe tanpa mengambil alih data progress/attempt milik domain pembelajaran.

## 5. Settings dan kontrol akses

### General

General menampilkan Meta Account, Usage, Language, Mode Light/Dark/System dan Theme color. Usage memisahkan Free plan dengan weekly reset dan additional tokens yang tidak kedaluwarsa, disertai progress bar serta Upgrade. Angka saldo/pemakaian pribadi tidak ditulis. Label dan unit pada akun ini tidak menjadi bukti harga, paket, atau limit global Muse.
**Usulan Ngertiin:** tampilkan allowance, reset, pekerjaan yang menahan reservasi dan hasil settlement. Navigasi usage tetap bisa diakses ketika kuota membuat task baru ditolak. Jangan menganggap kuota tiga meter #05 langsung cocok untuk compute/browser/background.

### Connectors

Katalog memiliki Search connectors, filter Available/Connected, Featured dan kategori. Contoh yang terlihat: Google Drive, Gmail, Calendar, Sheets/Docs, Outlook, Facebook/Instagram/Threads/Messenger, Spotify, Withings, GitHub, Canva, Dropbox dan Zoom. Tombol membedakan View dan Connect. Daftar ini contoh snapshot UI, bukan inventaris lengkap ataupun bukti OAuth/read/write setiap integrasi berhasil.
**Usulan V1:** connection record terpisah dari grant tindakan. UI menunjukkan status, akun tujuan, scope read/write, expiry/reconnect, disconnect dan affected schedules. Membangun semua connector sekaligus bukan prasyarat code+schedule pilot; catalog adapter boleh tumbuh setelah workflow inti terbukti.

### Permissions

Default connector dan web masing-masing menawarkan Ask for some actions atau Always ask. Pengelolaan izin dipisah menjadi Connectors, Websites, Artifacts, Scheduled tasks dan Direct network protocols. Ada Reset approvals to defaults. Subhalaman Scheduled tasks menampilkan daftar jadwal; nama dan waktu pribadi tidak dimasukkan.
**Usulan V1:** kontrol default, capability grant dan exact approval adalah konsep berbeda. Approval card menyatakan tindakan, target, ringkasan data yang akan dikirim, scope, masa berlaku dan keputusan. Mutasi izin memakai revision check; resume mengecek ulang kewenangan. Mencabut grant harus menghentikan penggunaan berikutnya pada task, bukan hanya mengubah ikon UI.

### Secure store, channels dan perangkat

Secure credentials store menyatakan penyimpanan password untuk agent, kategori Passwords dan tombol Add. Kredensial tidak dibuka atau diekstrak. Messaging channels menyatakan interaksi melalui aplikasi lain dan menampilkan WhatsApp pada akun ini. Devices menampilkan Other devices dan last seen. Wallet tersedia sebagai menu; transaksi, nominal dan payment flow tidak diperiksa.
**Usulan V1:** secret capture dan credential use berada di luar prompt/model, owner-scoped, dapat dicabut, dan terlihat jejak penggunaannya. Web menjadi channel utama; mobile/channel tambahan memakai task dan identity yang sama. Koneksi channel bukan pengganti pengelolaan runtime.

### Data controls

Terlihat pilihan Help improve our AI models, Import memory, Download your agent data dan Reset agent. Penjelasan reset menyebut penghapusan permanen chat, files dan active tasks. Tidak ada pengubahan switch, impor, ekspor, reset atau penghapusan pada audit ini.
**Usulan V1:** bedakan hapus chat, hapus file, lupakan memory, disconnect, cancel task dan reset account. Tentukan efek pada embeddings, derived outputs, schedules, backups dan jobs yang sudah queued. Memory import memerlukan preview/source/type, bukan memasukkan teks eksternal sebagai system instruction.

## 6. State visual dan failure contract

| Kondisi | Bukti Muse | Target implementasi Ngertiin |
| --- | --- | --- |
| Loading | Loading ideas/account details/permission defaults teramati | Skeleton scoped; error/retry terpisah; hindari state kosong yang disangka tanpa data |
| Running | Stop tersedia setelah submit; avatar Building artifact | Task card + activity faktual, stop/cancel, elapsed/budget; chat tetap hidup |
| Partial response | Jawaban kedua datang sebelum artifact selesai | Pesan causal dan progress tidak saling menimpa |
| Ready | Kartu/entry artifact dapat dibuka | Durable manifest + viewer; hasil tidak bergantung sandbox masih hidup |
| Waiting permission | Struktur permission didokumentasikan vendor dan frontend | Proposal exact, safe resume, deny/expiry/revoke, task tidak menahan worker aktif |
| Reconnect | Kontrak cursor terlihat pada frontend; crash runtime tidak diuji | Replay + snapshot, dedup, stale-session fencing, clear recovery state |
| Failure/cancel | Status tersedia di kode; failure injection belum dilakukan pada Muse | Jangan mengklaim sukses; retain partial results; settlement dan cleanup terukur |

## 7. Register observasi

| ID | Permukaan dan temuan | Kedalaman |
| --- | --- | --- |
| UI-01–05 | Chat, goal, Library dan kategori pada penilaian awal | Struktur read-only; lihat laporan assessment lokal |
| UI-06 | General: usage, reset, tokens tambahan, appearance | Struktur dibaca setelah loading |
| UI-07 | Connectors: search/filter/categories/View vs Connect | Katalog; tidak connect/disconnect |
| UI-08 | Permissions: dua default dan lima kelompok grant | Default dibaca; tidak diubah |
| UI-09 | Secure store: password category/Add | Metadata struktur saja; tidak membuka entries |
| UI-10 | Messaging/Devices/Data controls | Struktur saja; tidak ada settings diubah |
| UI-11 | Ideas: featured/category/card/menu | Render; tidak submit ide |
| UI-12 | Feed: kartu update dan Love | Render; tidak memberi reaction |
| UI-13 | Search Muse combobox | Dialog saja; retrieval belum diuji |
| UI-14 | Avatar: Activity/Upcoming/Identity | Tab dinavigasi; konten personal dihilangkan |
| UI-15 | [SOUL.md](http://SOUL.md) editor + toolbar | Viewer/editor dibuka tanpa perubahan |
| UI-16 | Side chat audit: dua pesan diterima saat task berjalan | Uji terkontrol; detail hasil pada halaman bukti |

## 8. Cakupan yang belum dipastikan

Audit web desktop ini belum menguji onboarding akun baru, mobile/Mac/native permissions, WhatsApp roundtrip, multi-device conflict, reconnect saat stream putus, grant/revoke sesudah efek eksternal, CAPTCHA/MFA, checkout, schedule firing setelah downtime, connector events, seluruh generator media dan seluruh failure branch. Kontrak serta skenario penerimaan untuk bagian tersebut disertakan pada roadmap; statusnya tidak dinaikkan menjadi berhasil hanya karena menunya tersedia.
<!-- notion-content:end -->
