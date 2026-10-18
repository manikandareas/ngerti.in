# Mesin privat agent: live view dan kendali pengguna

Tanggal verifikasi: 18 Oktober 2026. Sumber: dokumentasi dan repositori resmi. Ini riset kemampuan vendor, bukan hasil uji runtime; belum membuat akun, memakai kredensial, membeli layanan, atau mengubah aplikasi/Notion.

## Rekomendasi sementara

Pertahankan core aplikasi dan workflow. Tambahkan lingkungan eksekusi sebagai adapter kecil yang dapat diuji terpisah. Untuk kebutuhan **terminal, menjalankan kode, browser, dan desktop yang dapat dilihat serta dikendalikan pengguna**, bandingkan **E2B Desktop dengan Daytona** lewat satu PoC. Browserbase menjadi pembanding bila pekerjaan ternyata cukup dilakukan di browser. Belum ada dasar memilih provider permanen sebelum menguji latensi dari Indonesia, sesi yang sama, pergantian kendali, pemulihan, dan biaya nyata.

Untuk klien pertama yang mengerjakan kode dan pekerjaan terjadwal, usulan ekonomisnya: buat mesin saat diperlukan; simpan workspace/hasil dan identitas sandbox; hentikan atau pause saat idle. Jadwal berikutnya membangunkan atau membuat lingkungan saat job berjalan. Mesin yang hidup 24 jam belum perlu menjadi syarat produk.

## Fakta terverifikasi

### Kesesuaian dengan stack Ngertiin

Halaman [Arsitektur & Delivery di Notion](https://app.notion.com/p/3f8abdd6187381198256f4ee69db1e78) dibaca kembali; isi terakhir masih memakai arah pembelajaran. Manifest dependency `apps/backend/pyproject.toml`, `apps/web/package.json`, serta panduan development lokal diperiksa pada tanggal riset.

| Bagian | Keputusan yang disarankan |
| --- | --- |
| TanStack Start/React, FastAPI, Clerk | Pertahankan UI, API, auth dan ownership yang sudah ada. |
| LangChain + LangGraph | Pertahankan pemilihan tools, agent loop dan checkpoint; tambahkan tools sandbox melalui boundary domain. |
| Procrastinate | Pertahankan job delivery/retry dan dispatch jadwal; task tidak bergantung viewer terbuka. |
| PostgreSQL + object storage | Simpan state tugas, izin, kepemilikan mesin dan hasil; MinIO lokal sudah dipakai, R2 production tetap perlu verifikasi. |
| LlamaIndex, LiteLLM, LangSmith pada dokumen acuan | Nilai kebutuhan integrasinya tersendiri; penyebutan pada diagram tidak menjadi bukti layanan/tracing sudah aktif. LlamaIndex dan LiteLLM tidak ada pada direct dependency backend yang diperiksa. |
| Sandbox, live desktop dan takeover | Capability produk baru; memerlukan adapter runtime, viewer, lifecycle resource serta pengaturan kendali di backend. |

Chat/progress yang memakai SSE dapat dipertahankan. Live desktop memiliki jalur stream/input tersendiri. Browser yang terlihat pengguna harus merupakan instance dan session yang sama dengan yang dikendalikan agent. Untuk browser, Playwright dapat mengakses Chromium melalui CDP; pilihan koneksi harus diuji karena dokumentasi menyebut fidelity CDP lebih rendah daripada protokol Playwright. Desktop umum dapat memakai API screenshot/mouse/keyboard provider. [Playwright BrowserType](https://playwright.dev/python/docs/api/class-browsertype).

### Pilihan layanan

| Pilihan | Tampilan dan input manusia | Lingkungan agent | Persistensi yang perlu dibedakan |
| --- | --- | --- | --- |
| E2B Desktop | Stream desktop atau satu jendela; URL mendukung `viewOnly`, sehingga tersedia juga interaksi pengguna; `requireAuth` menyediakan kunci akses. Satu stream aktif pada satu waktu. | Linux/XFCE, API mouse, keyboard, screenshot, filesystem, dan shell dalam sandbox yang sama. | E2B mendokumentasikan pause/resume yang menyimpan filesystem dan RAM, termasuk proses. Reconnect browser/jaringan sesudah resume tetap harus diuji. |
| Daytona | VNC dalam browser memberikan mouse/keyboard; dokumentasi secara eksplisit menghubungkannya dengan Computer Use pada **sesi VNC yang sama**, sehingga pengguna melihat agent bekerja. | Computer Use mengendalikan GUI; snapshot default memiliki desktop/VNC. Custom image perlu paket desktop sendiri. | Container: stop/start mempertahankan disk tetapi membuang RAM. **Linux VM/Windows VM**: pause/resume mempertahankan RAM. Jangan menyamakan dua kelas ini. |
| Browserbase Live View | Pengguna dapat melihat, klik, mengetik, dan scroll pada sesi browser yang berjalan; dapat di-embed sebagai iframe. | Browser dengan koneksi automation, bukan full desktop untuk menjalankan aplikasi native sembarang. | `keepAlive` mempertahankan sesi untuk reconnect, hanya pada paket berbayar dan masih tunduk timeout; ini bukan VM yang dipause. |

Sumber kemampuan: [E2B Desktop README](https://github.com/e2b-dev/desktop), [E2B Computer Use](https://docs.e2b.dev/use-cases/computer-use), [E2B persistence](https://docs.e2b.dev/sandbox/persistence), [Daytona VNC](https://www.daytona.io/docs/en/vnc-access/), [Daytona persistence](https://www.daytona.io/docs/en/persistence/), [Browserbase Live View](https://docs.browserbase.com/platform/browser/observability/session-live-view), [Browserbase keep alive](https://docs.browserbase.com/platform/browser/long-sessions/keep-alive).

**Isolasi:** E2B Runtime menjelaskan satu Firecracker microVM per sandbox. Daytona membedakan container dengan namespaces/resource limits dari VM yang memiliki kernel sendiri. “Privat per pengguna” tetap memerlukan mapping kepemilikan dan otorisasi aplikasi; memilih vendor tidak otomatis menetapkan aturan tenant produk. [E2B Runtime](https://github.com/e2b-dev/runtime), [Daytona isolation](https://www.daytona.io/docs/en/isolation/).

## Lifecycle dan biaya

- **E2B:** Hobby $0 biaya dasar + pemakaian, kredit awal $100 sekali, maksimal satu jam runtime kontinu dan 20 sandbox bersamaan. Pro $150/bulan + pemakaian, runtime kontinu 24 jam. Dokumentasi membedakan runtime kontinu dari umur sandbox: paused state dipertahankan tanpa TTL; pause/resume mengulang batas runtime kontinu. Billing menyatakan compute dihitung per detik saat berjalan dan berhenti saat paused. Ini tidak berarti produksi gratis setelah kredit habis. [Billing & limits](https://docs.e2b.dev/billing), [pricing](https://e2b.dev/pricing).
- **Daytona:** harga publik Linux menampilkan $0.0504/vCPU/jam + $0.0162/GiB RAM/jam, serta disk $0.000108/GiB/jam setelah 5 GiB pertama; dihitung per detik. Stopped/paused masih menagih disk, sedangkan paused VM tidak menagih RAM yang disimpan. Kredit trial yang dipromosikan bukan anggaran operasi berulang. Ketersediaan/kuota dan pembatasan jaringan bergantung tier; periksa kebutuhan situs klien pada PoC. [Pricing](https://www.daytona.io/pricing), [billing](https://www.daytona.io/docs/en/billing/), [limits](https://www.daytona.io/docs/en/limits/).
- **Browserbase:** paket Free untuk prototipe mencantumkan satu browser hour dan 15 menit per sesi; Developer $20/bulan mencakup 100 browser hours, lalu $0.12/jam. `keepAlive` berbayar dan browser tetap berjalan sampai dilepas/timeout. Dokumentasi timeout menyebut maksimum enam jam; jangan menganggap Free mendapatkan batas tersebut. [Pricing](https://www.browserbase.com/pricing), [timeouts](https://docs.browserbase.com/platform/browser/long-sessions/timeouts).

Angka di atas adalah snapshot halaman publik, bukan penawaran kontrak atau total biaya produk. Estimasi akhir harus menambahkan model, penyimpanan/artefak, dan pemakaian jaringan/proxy yang relevan.

## Managed, self-hosted, dan VNC

E2B menyediakan cloud managed; repositori Runtime dan Desktop berlisensi Apache-2.0, dan Runtime mendokumentasikan penggunaan di hardware sendiri. Itu pilihan deployment, bukan komputasi gratis: pengoperasian host, jaringan, kapasitas, dan recovery menjadi pekerjaan sendiri. [E2B Runtime](https://github.com/e2b-dev/runtime).

Daytona BYOC menjalankan workload di infrastruktur sendiri **dengan control plane Daytona**. Jangan menyamakannya dengan self-host penuh. Repositori lama `daytonaio/daytona` kini diarsipkan; README menyatakan core pindah ke codebase privat sejak Juni 2026 dan repositori lama tidak menerima pemeliharaan. Klaim bahwa cloud terbaru bisa direplikasi gratis dari repositori lama tidak terverifikasi. [BYOC](https://www.daytona.io/docs/en/bring-your-own-compute/), [status repositori](https://github.com/daytonaio/daytona).

Browserbase adalah layanan cloud; FAQ pricing menyatakan tidak menawarkan deployment on-prem. Stagehand yang open source tidak sama dengan platform browser managed tersebut. [Browserbase pricing/FAQ](https://www.browserbase.com/pricing).

VNC/RFB adalah jalur tampilan dan input jarak jauh; ia bukan VM, sandbox, scheduler, atau agent framework. noVNC adalah client browser yang berkomunikasi melalui WebSocket; backend lingkungan tetap harus ada. Flag `viewOnly` menghentikan input client, bukan bukti otorisasi backend. [noVNC](https://novnc.com/noVNC/), [API RFB](https://novnc.com/noVNC/docs/API.html).

Jika menjalankan sendiri, susunan PoC dapat berupa Linux terisolasi + desktop/Chromium + TigerVNC Xvnc + noVNC, dengan websockify bila server memerlukan jembatan WebSocket–TCP. Xvnc menyediakan layar X virtual sekaligus server VNC. Memakai managed desktop yang sudah menyediakan viewer tidak mewajibkan membangun susunan ini lagi. [TigerVNC Xvnc](https://tigervnc.org/doc/Xvnc.html), [websockify](https://github.com/novnc/websockify).

**Usulan produk, belum jaminan vendor:** tombol “Ambil alih” memperoleh lease kendali di backend, menghentikan penerbitan aksi agent dan menunggu aksi berjalan selesai, lalu membuka input manusia. Saat “Kembalikan ke agent”, cabut kendali manusia dan ambil observasi baru sebelum agent melanjutkan. Dokumentasi yang diperiksa menunjukkan channel interaktif, tetapi belum membuktikan API pergantian kendali eksklusif yang otomatis mem-pause agent aplikasi.

## Checklist PoC sebelum memilih

1. Satu user, satu sandbox; agent membuat file, menjalankan kode, dan membuka hasil pada browser. Pengguna melihat perubahan **di lingkungan yang sama**.
2. Embed viewer dalam aplikasi; uji scroll, keyboard, clipboard, multi-tab/window, dan latensi pada koneksi pengguna sebenarnya.
3. Agent berhenti ketika lease manusia aktif, termasuk aksi tertunda; pengguna mengubah halaman; agent mengambil screenshot/state baru saat melanjutkan.
4. Putuskan viewer/worker, reconnect memakai identitas sandbox tersimpan; uji sesi web dan file sesudah idle, pause/resume, serta restart. Bedakan RAM, disk, dan autentikasi website.
5. Dua pengguna tidak dapat mengakses sandbox/URL viewer satu sama lain; uji URL kadaluarsa dan pencabutan akses.
6. Jalankan job terjadwal saat mesin idle; ukur waktu siap, pemulihan setelah kegagalan, dan pemakaian terukur per tugas. Batasi waktu hidup dan anggaran sebelum uji berbayar.

Luluskan provider yang memenuhi alur di atas dengan biaya operasional yang dapat ditanggung. Tunda BYOC/Kubernetes dan pembangunan platform sandbox sendiri sampai ada kebutuhan serta pendapatan yang membenarkannya.
