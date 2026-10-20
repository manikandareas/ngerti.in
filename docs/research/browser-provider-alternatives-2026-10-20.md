# Alternatif provider browser privat

Tanggal verifikasi: **20 Oktober 2026**. Riset memakai dokumentasi, harga publik, dan source resmi provider. **Belum ada uji runtime provider**, pembuatan akun, pemakaian kredit, perubahan kredensial, atau perubahan aplikasi/Notion. Kemampuan yang dinyatakan dokumentasi dibedakan dari inferensi integrasi dan hasil yang masih perlu diuji.

Tindak lanjut setelah riset: pengguna mengotorisasi penggantian Daytona dan menyediakan API key. [Implementasi dan uji live E2B](../engineering/e2b-migration-2026-10-20.md) mencatat hasil berikut batasnya; isi riset di bawah tetap merupakan snapshot sebelum implementasi.

## Rekomendasi untuk Ngertiin

**Uji E2B Desktop terlebih dahulu; Hopx sebagai pembanding desktop.** Keduanya mendokumentasikan desktop Linux, VNC, akses internet dan lifecycle persisten, serta mengiklankan kredit awal tanpa kartu. Kernel layak bila capability difokuskan pada browser dengan viewer interaktif vendor. Kesesuaian ini adalah penilaian dari dokumentasi dan kode, belum bukti bahwa akun trial dapat membuka seluruh situs sasaran.

| Provider | Trial/kredit publik | Internet menurut dokumentasi | Viewer | Penilaian untuk aplikasi saat ini |
| --- | --- | --- | --- | --- |
| E2B Desktop | US$100 sekali; tanpa kartu | Outbound aktif secara default | Desktop VNC/noVNC | Kandidat pertama; sesi Hobby satu jam memadai untuk Task 20 menit. Pause/reconnect worker dan gateway perlu diuji. |
| Hopx | US$200 awal; tanpa kartu | Parameter `internet_access` tersedia; akses trial spesifik belum diuji | Desktop VNC; native URL `vnc://...:5901` didokumentasikan | Kandidat kedua; jalur WebSocket untuk embed dan retensi/billing setelah stop perlu verifikasi. |
| Kernel | US$5 per bulan; tanpa kartu | Browser web dan managed egress; configurable proxies dibatasi paket | Live View interaktif, berorientasi browser | Menarik untuk browser privat dan profil lintas sesi; gateway viewer memerlukan penyesuaian lebih besar. |
| Browserbase | Paket Free satu browser-hour; 15 menit/sesi | Browser untuk situs web | Live View interaktif, berorientasi browser | Trial singkat; batas 15 menit lebih pendek daripada maksimum Task Ngertiin 20 menit. |

Sumber trial: [E2B pricing](https://e2b.dev/pricing), [Hopx pricing](https://www.hopx.ai/pricing/), [Kernel pricing](https://www.kernel.sh/pricing), [Browserbase pricing](https://www.browserbase.com/pricing). Sumber kemampuan dan batas tersedia pada bagian masing-masing. Kredit model, proxy, serta aplikasi di luar provider perlu dihitung tersendiri bila dipakai.

## E2B Desktop

**Rekomendasi:** kandidat kuat untuk PoC pengganti Daytona karena menyediakan desktop Linux, internet, shell/filesystem, GUI automation, dan VNC pada sandbox yang sama. Kredit Hobby memungkinkan evaluasi tanpa kartu. Pilihan permanen menunggu pengujian reconnect antar-worker, login lintas Task, proxy/CDP, dan fencing input manusia. Ini penilaian kesesuaian terhadap kontrak Ngertiin, bukan penerimaan runtime. [Computer use](https://docs.e2b.dev/use-cases/computer-use), [pricing](https://e2b.dev/pricing).

### Trial, internet, dan batas sesi

| Hal | Bukti publik saat diperiksa | Implikasi untuk Ngertiin |
| --- | --- | --- |
| Kredit awal | Hobby $0/bulan, **$100 sekali**, **tanpa kartu kredit**. | Cukup untuk PoC; bukan kredit bulanan berulang. |
| Batas Hobby | Maksimum **1 jam berjalan kontinu**, **20 sandbox running** bersamaan. | Task 20 menit berada dalam batas; batas 24 langkah tetap ditegakkan aplikasi. |
| Kredit habis | Workspace tanpa metode pembayaran diblokir tidak lama setelah kredit habis. | Tidak otomatis menjadi layanan gratis permanen. |
| Internet | Outbound internet aktif secara default; Python menerima `allow_internet_access` dan aturan `network`. | Mendukung browser yang mengakses situs umum secara dokumentasi. |

Sumber: [pricing](https://e2b.dev/pricing), [billing dan batas](https://docs.e2b.dev/billing), [internet access](https://docs.e2b.dev/network/internet-access).

Dokumen jaringan tidak mencantumkan allowlist domain khusus Hobby/trial. **Tidak ditemukan pembatasan trial semacam itu pada sumber yang diperiksa; akses akun trial ke situs sasaran belum diuji.** Outbound ke rentang private/link-local diblokir di luar guest. Egress IP bersifat sementara dan berotasi. Default region US tersedia semua paket; EU/APAC memerlukan Pro dan permintaan akses, sehingga latensi Indonesia pada trial harus diukur. [Restricting public access](https://docs.e2b.dev/network/restrict-public-access), [egress IP dan region](https://docs.e2b.dev/faq/egress-ip-ranges).

### Desktop, stream, dan kontrol pengguna

- Python memakai `e2b-desktop`; `Sandbox` menyediakan screenshot, mouse, keyboard, shell `commands`, dan `files`. Desktop dan stream berada pada lingkungan yang dikendalikan agent. [Computer use](https://docs.e2b.dev/use-cases/computer-use).
- Source saat diperiksa menjalankan **x11vnc port 5900**, **noVNC/websockify port 6080**, dan menghasilkan URL `/vnc.html`. Fork noVNC memakai path WebSocket default `/websockify`, sehingga bentuk upstream yang diturunkan dari source adalah `wss://<sandbox.get_host(6080)>/websockify`. **URL/protokol tersebut belum diuji melalui gateway Ngertiin.** [Python stream implementation](https://github.com/e2b-dev/E2B/blob/dc625eb2e95447648e631fd56f76bc1f58ab9da9/packages/desktop-python/e2b_desktop/main.py#L89), [noVNC WebSocket path](https://github.com/e2b-dev/noVNC/blob/461b7f1ccb20755037d8995612e5fb08ed16f9e4/app/ui.js#L188), [RFB connection](https://github.com/e2b-dev/noVNC/blob/461b7f1ccb20755037d8995612e5fb08ed16f9e4/app/ui.js#L1068).
- `stream.start(require_auth=True)` membuat password VNC; `get_url(auth_key=...)` memasukkannya ke query URL. Default `require_auth=False`. `view_only=True` mengatur client noVNC. Ini **bukan** lease kendali eksklusif aplikasi. Server memakai `-shared`; jangan memberikan upstream URL/kunci langsung sebagai pengganti owner gateway dan penyaringan RFB. [Stream source](https://github.com/e2b-dev/E2B/blob/dc625eb2e95447648e631fd56f76bc1f58ab9da9/packages/desktop-python/e2b_desktop/main.py#L122), [client view-only setting](https://github.com/e2b-dev/noVNC/blob/461b7f1ccb20755037d8995612e5fb08ed16f9e4/app/ui.js#L1732).
- Public port URL dapat diakses siapa pun yang mengetahuinya secara default. `network={"allow_public_traffic": False}` mewajibkan header `e2b-traffic-access-token`. **Usulan integrasi:** gateway server menyimpan token dan meneruskannya saat membuka upstream WebSocket; viewer tetap memakai grant owner aplikasi. Kombinasi restricted ingress + VNC + gateway masih perlu uji. [Public access restriction](https://docs.e2b.dev/network/restrict-public-access).
- Hanya satu stream desktop/aplikasi aktif pada satu waktu; stream satu jendela berakhir jika aplikasi ditutup. Gunakan full-desktop stream untuk perpindahan jendela bila alur membutuhkannya. [Desktop README](https://github.com/e2b-dev/desktop#streaming-specific-application).

### Persistensi profil dan lifecycle

E2B mendokumentasikan pause penuh yang menyimpan disk dan RAM, termasuk proses. `connect()` membangunkan sandbox yang dipause. Paused sandbox disimpan tanpa TTL, tidak dihitung sebagai concurrency running, dan tidak ditagih selama paused. Karena itu, **retensi profil tujuh hari memungkinkan secara dokumentasi dengan reuse sandbox yang sama**, tetapi aplikasi perlu menjadwalkan `kill()` saat retensi berakhir; E2B tidak menyediakan auto-kill setelah N hari. Login website sendiri tetap dapat kedaluwarsa atau dicabut oleh situs. [Persistence](https://docs.e2b.dev/sandbox/persistence), [paused concurrency dan billing](https://docs.e2b.dev/faq/paused-sandboxes-concurrency).

Timeout default **lima menit** dan aksi default **kill**, yang menghapus state permanen. Untuk profil lintas Task, pilih `lifecycle={"on_timeout": "pause", "auto_resume": False}` serta timeout eksplisit sesuai budget Task; aktifkan kembali melalui backend yang memeriksa owner dan budget. `connect(timeout=...)` hanya memperpanjang expiry, sedangkan `set_timeout()` dapat menetapkan expiry yang lebih pendek. Semua client network terputus saat pause dan harus reconnect. [Sandbox lifetime](https://docs.e2b.dev/faq/sandbox-lifetime), [timeout dan network pada persistence](https://docs.e2b.dev/sandbox/persistence).

Pause dapat ditolak ketika snapshot sebelumnya belum selesai; selama penolakan sandbox tetap running. Auto-pause dapat fallback ke **filesystem-only** setelah retry sekitar dua menit, sehingga resume melakukan reboot dan kehilangan proses/RAM. Aplikasi perlu memeriksa `pause_mode` dan memulai ulang desktop/browser bila perlu. Ini batas dokumentasi, belum diamati langsung. [Pause refusal dan auto-pause](https://docs.e2b.dev/sandbox/persistence#when-a-pause-is-refused).

**Caveat Python Desktop antar-worker, berdasarkan source:**

1. Desktop `Sandbox` mewarisi generic `Sandbox`; `pause()` dan `connect()` tersedia lewat inheritance. `create()` meneruskan `lifecycle` ke base dan menginisialisasi `_display` serta private `__vnc_server`. [Desktop create](https://github.com/e2b-dev/E2B/blob/dc625eb2e95447648e631fd56f76bc1f58ab9da9/packages/desktop-python/e2b_desktop/main.py#L209).
2. Instance `desktop.pause(); desktop.connect()` mempertahankan object Python yang sama. Ini berbeda dari worker baru yang memanggil `Desktop.connect(id)`. [Generic instance connect](https://github.com/e2b-dev/E2B/blob/dc625eb2e95447648e631fd56f76bc1f58ab9da9/packages/python-sdk/e2b/sandbox_sync/main.py#L341).
3. Class-level connect membangun `cls(...)` tanpa menjalankan Desktop `create()`, sementara property `stream` hanya mengembalikan `__vnc_server`; Desktop tidak mendefinisikan constructor/override connect untuk mengisinya kembali. **Inferensi source:** helper `stream` pada object hasil fresh reconnect belum terinisialisasi dan tidak boleh diasumsikan bekerja langsung. Ini gap wrapper/rehydration, bukan bukti VM tidak bisa resume. [Generic class connect](https://github.com/e2b-dev/E2B/blob/dc625eb2e95447648e631fd56f76bc1f58ab9da9/packages/python-sdk/e2b/sandbox_sync/main.py#L1067), [Desktop stream property](https://github.com/e2b-dev/E2B/blob/dc625eb2e95447648e631fd56f76bc1f58ab9da9/packages/desktop-python/e2b_desktop/main.py#L342).

Source tersebut dipin ke commit `dc625eb2e95447648e631fd56f76bc1f58ab9da9`; manifest Desktop di commit itu menyatakan **2.7.0**, Python >=3.11, dan dependency `e2b>=2.44.0,<3`. Referensi Desktop yang ditautkan indeks docs masih **2.4.2**. Ini bukti source publik saat diperiksa, **bukan verifikasi wheel yang terpasang atau versi release yang akan dipilih**. [Manifest](https://github.com/e2b-dev/E2B/blob/dc625eb2e95447648e631fd56f76bc1f58ab9da9/packages/desktop-python/pyproject.toml), [Desktop reference](https://docs.e2b.dev/sdk-reference/desktop-python-sdk/v2.4.2/desktop).

### Biaya dan batas penyimpanan

Harga publik: **$0.000014/vCPU/detik + $0.0000045/GiB RAM/detik**, berdasarkan alokasi. Disk 10 GiB Hobby atau 20 GiB Pro termasuk. Paused sandbox tidak ditagih; tidak ditemukan biaya retensi paused tersendiri pada sumber tersebut. Contoh hitungan sendiri: alokasi **2 vCPU + 4 GiB** selama 20 menit sekitar **$0.0552**, sehingga $100 setara sekitar 1.811 sesi semacam itu sebelum overhead. Ini ilustrasi compute saja, bukan ukuran default Desktop yang telah diverifikasi atau total biaya produk. [Pricing](https://e2b.dev/pricing), [formula dan current rates](https://docs.e2b.dev/faq/calculate-sandbox-price).

Jangan menyamakan disk paused dengan **Volumes**. Volumes masih private beta dan memiliki keterbatasan file locking/SQLite, metadata, permission, serta belum tersedia APAC. Untuk PoC profil browser, local disk sandbox yang dipause lebih sederhana daripada menaruh profil Chromium aktif di volume jaringan; rekomendasi ini diturunkan dari batas locking tersebut. [Volumes](https://docs.e2b.dev/volumes), [beta limitations](https://docs.e2b.dev/faq/volumes-beta-limitations).

### Pemetaan kontrak Ngertiin dan uji penentu

| Kontrak | Penilaian berbasis sumber | Yang belum terbukti |
| --- | --- | --- |
| Desktop yang sama untuk agent/manusia; screenshot/input/shell/files | Tersedia di Desktop SDK. | Integrasi viewer dan action receipt aplikasi. |
| Owner gateway + RFB control fencing | Transport noVNC/websockify cocok secara struktur. | Handshake VNC auth, header ingress, framing RFB, reconnect, dan penolakan input stale melalui gateway. |
| Profil/login lintas Task, retensi tujuh hari | Pause menyimpan disk/RAM tanpa TTL; cleanup perlu aplikasi. | Fresh worker reconnect, Chromium profile setelah pause/reboot, dan validitas sesi situs. |
| Local HTTP egress proxy | Shell memungkinkan menjalankan proses proxy; provider juga memiliki kontrol egress. | Pemaksaan seluruh trafik Chromium lewat proxy dan pelestarian kontrol envd. Kernel tidak menyediakan `xt_owner`; rule owner-based iptables perlu adaptasi, misalnya nftables. |
| Local Chromium CDP untuk fingerprint aksi | Template resmi memasang `google-chrome-stable`; shell tersedia. | Peluncuran Chrome dengan CDP/profile/proxy yang sesuai, CDP reconnect, dan kesamaan instance yang terlihat pengguna. |
| Task 20 menit / 24 langkah | Batas kontinu Hobby satu jam memadai. | Budget langkah/deadline, lease, fencing dan retention cleanup tetap tanggung jawab aplikasi. |

Sumber tambahan tabel: [template Chrome](https://github.com/e2b-dev/desktop/blob/9fe5f55fabe3bd9f0277661a830e1d228b463b44/template/template.py#L66), [xt_owner limitation](https://docs.e2b.dev/faq/iptables-xt-owner), [preserving SDK control connectivity](https://docs.e2b.dev/network/restrict-public-access#running-a-firewall-inside-the-sandbox).

PoC paling menentukan: buat satu Desktop restricted-ingress, jalankan Chrome dengan profil lokal dan proxy/CDP, login manual lewat gateway, pause, buang object worker, lalu connect dari worker baru. Verifikasi profil/login, stream/input, pemulihan CDP, ownership, dan fencing sebelum menerima provider. Uji akun dua owner, URL/grant kedaluwarsa, serta cleanup tujuh hari secara simulasi waktu; hasil tersebut belum tersedia dalam riset ini.

## Hopx

[Harga publik](https://www.hopx.ai/pricing/) menawarkan **US$200 kredit awal**, tanpa kartu, dengan biaya berdasarkan pemakaian. Ini kredit promosi, bukan jatah US$200 setiap bulan. [Terms](https://hopx.ai/terms/) menyatakan kredit promosi sekali, tidak dapat dipindahtangankan, dan dapat kedaluwarsa sesuai aturan program; tanggal kedaluwarsa aktual trial belum terkonfirmasi.

[Dokumentasi create](https://docs.hopx.ai/core-concepts/sandboxes/creating) menyediakan parameter `internet_access`. [Dokumentasi VNC](https://docs.hopx.ai/core-concepts/desktop/vnc-server) menyediakan template desktop, mouse/keyboard/screenshot, password VNC dan URL native port 5901. [Halaman produk](https://www.hopx.ai/features/desktop-automation/) juga menyebut noVNC. **Belum terbukti dari sumber yang diperiksa:** authenticated WebSocket URL dan revocation yang bisa langsung dipakai gateway Ngertiin, serta tidak adanya pembatasan akun trial pada tujuan web tertentu.

[Lifecycle](https://docs.hopx.ai/core-concepts/sandboxes/managing-state) membedakan pause yang mempertahankan RAM/proses dari stop yang mempertahankan filesystem. Ini sesuai kebutuhan profil lintas Task secara struktur, tetapi durasi retensi setelah stop/pause, biaya retained state, dan pemulihan Chromium/VNC belum diuji. Klaim pemasaran tanpa idle charges belum cukup untuk menghitung seluruh penyimpanan profil tujuh hari.

Penilaian: pembanding desktop yang relevan. Prioritas uji adalah akses Google/sumber riset dari akun trial, koneksi viewer melalui WebSocket, stop/start profil login, serta billing retained disk. Jumlah kredit yang lebih besar tidak sendirinya membuktikan biaya atau integrasi lebih baik.

## Kernel

[Pricing](https://www.kernel.sh/pricing) menampilkan paket Free dengan **US$5 kredit per bulan**, lima browser bersamaan, dan tanpa kartu. [Rincian billing](https://www.kernel.sh/docs/info/pricing) menampilkan headful browser US$0.0001333336/detik, sekitar **US$0.48/jam aktif**. Dengan asumsi hanya headful browser, US$5 sekitar 10,4 jam; biaya app invocation atau layanan lain mengurangi jumlah ini. Idle masuk standby tanpa biaya aktif, tetapi viewer/CDP aktif memengaruhi idle.

[Live View](https://www.kernel.sh/docs/browsers/live-view) mendukung input manusia dan iframe. Dokumentasi menjelaskan signaling, ICE/peer dan event playback; tidak menyediakan jaminan endpoint RFB/noVNC yang kompatibel dengan parser aplikasi. `readOnly` dan pesan iframe mengubah interaktivitas client; itu belum membuktikan fencing backend. [Profiles](https://www.kernel.sh/docs/browsers/profiles) menyimpan cookies, site data, tabs dan preferences; state disimpan saat browser dihapus/timeout jika `save_changes=true`. Menutup koneksi CDP saja tidak menyimpan profil. Profil bekerja tanpa Managed Auth; fitur reauthentication otomatis vendor bukan syarat untuk login manusia melalui takeover.

[Produk Kernel](https://www.kernel.sh/) menyediakan cloud browser, CDP/BiDi, computer controls, Python SDK dan eksekusi dekat browser. Paket gratis mendukung live view/computer controls; configurable proxies dan regional browser memerlukan paket yang sesuai. Tidak ada klaim dalam riset ini bahwa semua situs akan menerima IP browser trial.

Penilaian: cocok untuk fungsi browser privat, namun gateway RFB dan kontrol viewer perlu dirancang ulang atau diadaptasi. Retensi/hapus profil tujuh hari, revocation viewer aktif, target fingerprint dan antrean tetap perlu dipetakan ke kontrak aplikasi. Jangan menyamakan browser runtime ini dengan adapter Python offline yang sudah ada.

## Browserbase dan kandidat yang tidak diprioritaskan

[Browserbase Free](https://www.browserbase.com/pricing) menyediakan satu browser-hour dan 15 menit per sesi. [Live View](https://docs.browserbase.com/platform/browser/observability/session-live-view) mendukung lihat/klik/ketik/scroll serta embed desktop/mobile. Sesi 15 menit tidak memenuhi maksimum Task 20 menit tanpa perubahan policy; persistensi dan otorisasi viewer bukan otomatis sama dengan implementasi sekarang. Karena dua kandidat desktop mempunyai kredit trial lebih luas dan transport lebih dekat, Browserbase ditempatkan sebagai pembanding browser.

**Scrapybara:** [situs utama saat diperiksa](https://scrapybara.com/) menyatakan produk beralih ke Capy. Dokumentasi lama Ubuntu, stream dan pause/resume masih tersedia, tetapi ketersediaan signup/trial sandbox baru tidak terkonfirmasi. Karena itu tidak direkomendasikan sebagai pilihan trial utama.

## Batas integrasi aplikasi dan langkah berikutnya

Kode saat audit menyediakan protocol [ComputerRuntime](../../apps/backend/src/ngertiin/computer/contracts.py), tetapi [policy](../../apps/backend/src/ngertiin/computer/policy.py) masih memilih `daytona` secara eksplisit. [Gateway](../../apps/backend/src/ngertiin/computer/viewer.py) menambahkan `/websockify` ke preview URL dan menyaring input RFB; [launcher](../../apps/backend/src/ngertiin/computer/desktop.py) juga mengasumsikan binary `chromium`, home Daytona dan display `:0`. **Perpindahan memerlukan adapter dan penyesuaian transport/lifecycle; mengganti API key saja belum cukup.**

PoC awal sebaiknya hanya capability browser. Workflow Task, owner, approval, lease/version, hasil dan budget adalah kontrak aplikasi yang sudah ada. Rate/provider-specific policy serta settlement harus disnapshot kembali. Profil login browser tetap terpisah dari sandbox eksekusi Python offline.

Gerbang keputusan untuk kandidat pertama:

1. Akun trial membuka Google, example.com dan sumber riset melalui browser/proxy sebenarnya, dengan pesan kegagalan yang spesifik.
2. Viewer aplikasi melihat browser yang sama; human takeover menghentikan aksi agent, mencabut input lama, dan mengambil observasi baru saat kembali.
3. Login manual Task A bertahan pada Task B setelah pause/resume dan pergantian proses worker; template/display/CDP terinisialisasi kembali dengan benar.
4. Task berhenti pada deadline meski worker mati, viewer dapat dicabut, profil dapat dihapus setelah retensi, dan penggunaan dapat direkonsiliasi.

Belum ada hasil pengujian tersebut untuk alternatif dalam laporan ini. Rekomendasi adalah urutan PoC, bukan keputusan migrasi permanen.
