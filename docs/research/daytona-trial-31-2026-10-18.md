# NG-031 · Research dan rancangan trial Daytona

Tindak lanjut: [trial NG-031 telah diterima](../engineering/daytona-31-acceptance.md). Isi riset berikut merupakan snapshot sebelum eksekusi.

Tanggal verifikasi: **18 Oktober 2026**. Status bukti: **riset dokumentasi dan source SDK; trial belum dijalankan**. Tidak ada instalasi SDK, sandbox baru, top-up, perubahan aplikasi, atau pengujian berbayar pada riset ini.

## Keputusan yang disarankan

Implementasikan **harness diagnostik terbatas** untuk membuktikan kemampuan Daytona sebelum membangun adapter produk. Gunakan Computer Use untuk jalur GUI pertama: dokumentasi menghubungkannya secara eksplisit dengan sesi VNC yang dilihat manusia. Pilihan provider tetap bersyarat pada hasil ownership, pergantian kendali, latency, lifecycle dan biaya nyata. [VNC Access](https://www.daytona.io/docs/en/vnc-access/).

Ada tiga temuan yang mengubah rancangan trial:

1. Daytona sekarang mendokumentasikan **wall-clock TTL**, sehingga cleanup tidak cukup mengandalkan idle timer atau proses lokal.
2. **Standard preview token adalah credential sandbox**, sedangkan signed preview URL terbatas satu port serta dapat kedaluwarsa/dicabut. URL viewer tetap memerlukan kontrol akses aplikasi.
3. **Tier 1/2 membatasi outbound network**; trial gratis belum otomatis membuktikan browser dapat mengakses sembarang situs. Uji GUI lokal dan situs essential dahulu; jangan melakukan upgrade/top-up otomatis. [Sandbox TTL](https://www.daytona.io/docs/en/sandboxes/#wall-clock-ttl), [Preview](https://www.daytona.io/docs/en/preview/), [Network Limits](https://www.daytona.io/docs/en/network-limits/).

## Kesesuaian dengan repository

Kontrak proyek sudah menetapkan owned `SandboxSession`, lease/version, workspace durable, viewer berizin dan pemisahan disk dari RAM. [Arsitektur V1](../product/04-arsitektur-dan-delivery.md), [REA-6](muse-ai-v1/evidence/computer.md), [tiket NG-031](../backlog/tasks/31-validasi-daytona-dengan-trial-terbatas.md).

Pembacaan source saat riset menemukan Python backend `>=3.12,<3.14`, belum mempunyai dependency Daytona; konfigurasi belum memiliki parameter provider dan model inti belum memiliki `SandboxSession`. Ini mendukung harness kecil dahulu. [pyproject.toml](../../apps/backend/pyproject.toml), [config.py](../../apps/backend/src/ngertiin/config.py), [models.py](../../apps/backend/src/ngertiin/models.py).

Task/approval produk, File/Result, eksekusi kode produk dan viewer/takeover penuh tetap mengikuti NG-033/034/035/036. NG-031 hanya membuat sarana minimum untuk menguji kontrak tersebut; hasilnya boleh menyatakan gap atau menolak kelayakan provider. Riset vendor lama merupakan konteks, bukan acceptance baru. [Urutan backlog](../backlog/README.md), [riset mesin privat sebelumnya](agent-private-machine-options-2026-10-18.md).

## Matriks kemampuan dan batas bukti

| Kebutuhan | Terverifikasi pada sumber primer | Yang masih harus dibuktikan |
| --- | --- | --- |
| Shell dan kode | `process.exec` menjalankan command; `code_run` stateless; interpreter terpisah menyediakan state antarpanggilan. | Exit/error/timeout, child process tersisa, batas output dan penghentian workload nyata. [Process & Code](https://www.daytona.io/docs/en/process-code-execution/) |
| File workspace | SDK menyediakan upload/download filesystem. | Hash sama setelah reconnect/stop/start; output diekspor sebelum resource dihapus. [AsyncFileSystem](https://www.daytona.io/docs/en/python-sdk/async/async-file-system/) |
| Desktop dan browser terlihat | Default snapshot menyertakan stack VNC; custom image/snapshot perlu paket desktop. Computer Use melakukan mouse/keyboard/screenshot dalam sesi VNC. | Browser/window/profile yang sama, keyboard/scroll, embed, reconnect dan latency pengguna. [VNC](https://www.daytona.io/docs/en/vnc-access/) |
| Desktop readiness | Guide resmi menunggu `get_status().status == "active"`, lalu membuka Chromium pada `DISPLAY=:0`. | Readiness end-to-end, command browser aktual dan ketahanan saat desktop restart. [Guide desktop](https://www.daytona.io/docs/en/guides/openai/openai-computer-use-helpers/) |
| Takeover eksklusif | API GUI tersedia; dokumen yang diperiksa belum membuktikan lease eksklusif human/agent bawaan. | Fencing, drain aksi, revocation input manusia dan observasi baru sebelum agent melanjutkan. **Kewajiban Ngertiin.** |
| Isolasi | Vendor membedakan container dengan kernel bersama dari VM dengan kernel terpisah. | Tenant produk, credential hygiene, policy jaringan dan pengujian owner aplikasi. [Isolation](https://www.daytona.io/docs/en/isolation/) |
| Batas usia resource | TTL menghancurkan sandbox pada deadline dalam state apa pun. | Deadline benar-benar dipenuhi saat harness/worker mati dan cleanup dapat direkonsiliasi. [TTL](https://www.daytona.io/docs/en/sandboxes/#wall-clock-ttl) |

**Computer Use dahulu, Playwright opsional:** bukti browser automation yang membuka browser/context baru tidak membuktikan sesi yang ditampilkan VNC. Bila kelak memakai Playwright, tambahkan pengujian attachment ke browser/page/profile existing; jangan menciptakan context baru ketika tujuannya meneruskan sesi pengguna. Dokumen Daytona yang diperiksa tidak menetapkan jaminan bridge Playwright/CDP tersebut. Ini batas pembuktian dan rancangan pengujian, bukan klaim keterbatasan absolut provider. Computer Use merupakan jalur yang didokumentasikan untuk desktop yang sama. [Computer Use](https://www.daytona.io/docs/en/computer-use/).

## SDK Python yang disarankan

Pin trial ke **`daytona==0.225.0`**, versi latest PyPI saat diperiksa, diunggah **16 Oktober 2026 18:24 UTC**; Python requirement `>=3.10,<4.0` sesuai rentang backend. Dokumentasi utama menampilkan v0.225, sedangkan guide desktop masih mem-pin 0.224.1; gunakan guide untuk pola readiness, bukan memilih versi secara implisit. [PyPI 0.225.0](https://pypi.org/project/daytona/0.225.0/), [metadata registry](https://pypi.org/pypi/daytona/json), [Python SDK](https://www.daytona.io/docs/en/python-sdk/).

Source distribution dibaca tanpa instalasi; SHA-256: `7fd2e9422360ca2d3b393af137231f4fd9d9a128c9a4070d231f8c776e446dc8`. Source `common/daytona.py`, `_async/daytona.py`, `_async/sandbox.py`, `_async/process.py` dan `_async/computer_use.py` mengonfirmasi signature berikut. [Artifact resmi PyPI](https://files.pythonhosted.org/packages/01/3c/acc6d1d67d6543983d61c408922a699a1314bfe99c28275bf257796adaa4/daytona-0.225.0.tar.gz).

| Tujuan | API 0.225.0 yang disarankan |
| --- | --- |
| Client async | `AsyncDaytona(DaytonaConfig(...))`; context manager atau `close()` |
| Provision | `create(CreateSandboxFromSnapshotParams(...), timeout=...)` |
| Reconnect | `get(sandbox_id_or_name, request_timeout=...)` |
| Shell/kode | `sandbox.process.exec(command, cwd=None, env=None, timeout=None)`; `code_run(code, params=None, timeout=None)` |
| File | `sandbox.fs.upload_file(...)`; `download_file(...)` |
| Desktop | `sandbox.computer_use.start()`; `get_status()`; `.mouse.click(...)`; `.keyboard.type(...)`; `.screenshot.take_full_screen(...)` |
| URL terbatas | `create_signed_preview_url(port, expires_in_seconds=...)` |
| Revoke URL | `expire_signed_preview_url(port, token)` |
| Lifecycle | `sandbox.stop(...)`; `start(...)`; `archive(...)`; `daytona.delete(sandbox, wait=True)` |
| Deadline | `ttl_minutes` pada create; `sandbox.set_ttl(...)` mengubah deadline |

Gunakan async untuk jalur FastAPI dan worker async; CLI diagnostik boleh sync. Ini rekomendasi integrasi, belum hasil dependency resolution. Signature, timeout dan lifecycle harus diperiksa kembali bila versi diganti. [AsyncSandbox](https://www.daytona.io/docs/en/python-sdk/async/async-sandbox/), [AsyncProcess](https://www.daytona.io/docs/en/python-sdk/async/async-process/).

Source membedakan `request_timeout` sisi client dari pembatalan operasi server: menunggu HTTP habis tidak membuktikan command/provision berhenti. Catat unknown outcome dan cari resource berdasarkan identitas trial sebelum retry create; jangan mengulang side effect hanya karena koneksi putus. [AsyncSandbox](https://www.daytona.io/docs/en/python-sdk/async/async-sandbox/).

## Viewer, ownership dan control lease

Untuk private sandbox, standard preview menggunakan token terpisah yang berlaku lintas port, termasuk terminal/toolbox, dan tidak dapat direvoke selama sandbox terus berjalan. Jangan kirim token tersebut atau API key ke frontend. Signed URL mempunyai token di URL, terikat satu port, default 60 detik, rentang 1–86400 detik; revoke tersedia dan URL dapat bertahan melewati restart sampai expiry/revoke. [Preview](https://www.daytona.io/docs/en/preview/).

Vendor mempunyai contoh noVNC melalui signed preview dalam iframe, tetapi source yang dibaca belum menetapkan port/path noVNC sebagai kontrak SDK. Temukan dari image aktual dan rekam; jangan menganggap `6080` atau helper `get_vnc_url` tersedia tanpa bukti. [Contoh resmi live desktop](https://www.daytona.io/dotfiles/real-computers-for-computer-use).

**Hipotesis yang harus diuji:** expiry/revoke mungkin menolak handshake baru tetapi tidak langsung menutup WebSocket existing. Dokumen tidak memberikan bukti terminasi socket aktif. Uji keduanya; keberhasilan HTTP 401/403 sesudah expiry belum membuktikan viewer lama berhenti menerima layar/input.

Usulan harness minimal:

- Backend memetakan account terverifikasi → trial session → sandbox; ID owner dari client tidak dipercaya. Owner B ditolak pada resolve/control/viewer/file owner A.
- Gunakan gateway HTTP/WebSocket dengan owner check dan handle viewer opaque. Gateway harus dapat menutup koneksi dan menolak input ketika grant/control version dicabut. Direct signed URL adalah bearer capability; gate saat penerbitan URL saja belum mengikat setiap koneksi kepada account pemegangnya.
- State kendali: `agent → handoff → human → resuming → agent`, dengan `control_version` meningkat. Satu dispatcher mengikat grant/lease ke aksi; transaksi pendek lalu dispatch serial, tanpa DB lock selama network call.
- Saat takeover: fence aksi queued dan worker lama, tunggu/drain aksi in-flight dengan timeout, baru nyatakan manusia memegang kendali. Jika outcome belum pasti, tampilkan handoff pending dan reconcile; jangan memberi kesan kendali sudah eksklusif.
- Saat kembali: tutup/larang jalur input manusia, ambil screenshot/URL/window baru, baru lanjut agent. Menyembunyikan tombol atau noVNC client `viewOnly` saja tidak menjadi bukti enforcement backend.

Butir di atas adalah kontrak implementasi Ngertiin dan skenario acceptance, bukan fitur otomatis Daytona. Trial perlu mencakup aksi GUI **dan** shell/kode yang dapat mengubah desktop; semua jalur harus melewati lease yang sama. [Kontrak proyek](../product/04-arsitektur-dan-delivery.md).

## Lifecycle, persistence dan biaya idle

| Operasi/state | Klaim vendor yang harus dibedakan |
| --- | --- |
| Container stop/start | Filesystem bertahan; RAM/proses hilang; tidak mendukung pause/resume. |
| VM stop/start | Filesystem bertahan, RAM hilang. |
| VM pause/resume | Filesystem dan RAM tersimpan; ini kelas resource berbeda dari container default. |
| Archive container | Filesystem dipindahkan ke object storage; restore perlu start. |
| Delete/ephemeral stop | State sandbox dihapus; output yang belum diekspor tidak menjadi hasil produk durable. |

Sumber tabel: [Persistence](https://www.daytona.io/docs/en/persistence/). Cookie/profile berbasis disk mungkin dapat dipulihkan, tetapi validitas auth situs, TCP/WebSocket, browser live state dan reconnect tetap hasil pengujian tersendiri.

Auto-stop container default 15 menit inactivity; background process bukan jaminan timer diperpanjang. Auto-archive default 7 hari stopped; auto-delete hanya menghitung waktu stopped (`-1` nonaktif, `0` hapus segera). TTL terpisah menghitung wall-clock dari create/reset dan berlaku juga saat running/paused/archived; jangan memperpanjang TTL otomatis ketika reconnect. [Lifecycle](https://www.daytona.io/docs/en/sandboxes/#automated-lifecycle-management).

Billing dihitung dari resource **reserved**: running dan transisi masih menagih CPU/RAM/disk; stopped/paused masih menagih disk; archived tidak ditagih. Penghapusan sandbox tidak menghapus biaya snapshot yang dibuat terpisah. Disk quota berbeda dari disk billing. [Billing](https://www.daytona.io/docs/en/billing/).

## Anggaran, jaringan dan latency

Snapshot harga publik Linux: **$0.0504/vCPU/jam + $0.0162/GiB RAM/jam**, storage **$0.000108/GiB/jam setelah 5 GiB pertama**, billing per detik. Promosi $200 compute credit bukan anggaran yang sudah diterima account ini. [Pricing, diperiksa 18 Oktober 2026](https://www.daytona.io/pricing).

Contoh kalkulasi, **bukan budget disetujui atau invoice**: 2 vCPU/4 GiB selama 30 menit adalah sekitar **$0.0828** CPU+RAM. Dua sesi sequential berdurasi itu sekitar **$0.1656**, sebelum storage/transisi/model/network/pajak yang relevan. Harga dan alokasi harus dibaca lagi sebelum trial; jangan menyimpulkan resource GUI minimum dari contoh ini.

Halaman limits menyatakan Tier 3 melalui $500 top-up; itu informasi dokumentasi, **bukan instruksi pembelian** atau kepastian upgrade dibutuhkan account ini. Dua tabel halaman yang sama berbeda untuk RAM Tier 1 (10 versus 20 GiB), sehingga baca actual quota/feature/snapshot dari organisasi, bukan menganggap angka publik sebagai konfigurasi nyata. [Limits](https://www.daytona.io/docs/en/limits/).

Tier 1/2 mempunyai pembatasan jaringan organisasi yang tidak dapat dibuka dengan allowlist sandbox; Tier 3/4 menyediakan default internet penuh dengan policy per sandbox. Catat situs required dan hasilnya. Jika situs diblok trial, laporkan **open-web belum teruji** dan hentikan perluasan jaringan berbiaya. [Network Limits](https://www.daytona.io/docs/en/network-limits/).

Shared region yang didokumentasikan adalah **`us` dan `eu`**, bukan jaminan Asia tersedia. Uji sequential dari koneksi pengguna di Makassar; catat ISP/network, region aktual dan timestamp. Pisahkan create→ready, ready→desktop active, command RTT, screenshot RTT, first viewer frame, input→visible update, reconnect dan stop/delete confirmed. Bandingkan median serta rentang; p95 memerlukan sampel cukup dan tidak boleh diklaim dari satu-dua run. [Regions](https://www.daytona.io/docs/en/regions/).

Belum ditemukan bukti pada sumber yang diperiksa bahwa parameter SDK menyediakan hard dollar cap. Wallet/usage adalah telemetry, bukan bukti pengeluaran berhenti tepat pada angka tertentu. Local watchdog saja tidak membuktikan hard cap ketika proses mati. [Billing](https://www.daytona.io/docs/en/billing/).

## Usulan satu putaran PoC yang dibatasi

Semua nilai berikut **proposal untuk disepakati sebelum eksekusi**, bukan konfigurasi yang telah aktif:

| Batas | Proposal awal |
| --- | --- |
| Peserta | Dua owner uji; satu sandbox aktif pada satu waktu. Concurrency race memakai satu sandbox; tambah sandbox hanya bila skenario isolation membutuhkannya. |
| Runtime | Provider TTL maksimal 30 menit per sandbox; per-command deadline eksplisit; idle-stop pendek dan auto-delete safety net. |
| Ukuran | Default snapshot paling kecil yang terbukti cukup untuk desktop; cek alokasi fixed dari snapshot. Jangan resize otomatis. |
| Panggilan | Skenario deterministik tanpa loop LLM; screenshot/action/output/download count serta bytes dibatasi. |
| Anggaran | Nominal USD trial/account **TBD**; reserve worst-case sebelum create, hitung seluruh resource/transisi/stopped disk, tolak create berikutnya bila ceiling terpakai. |
| Resource tambahan | Tidak membuat snapshot/volume/warm pool/GPU/VM tambahan kecuali skenario yang disepakati membutuhkannya. Tidak top-up/upgrade otomatis. |
| Cleanup | Simpan ID sesegera diketahui; reconcile unknown create; delete+wait/poll, daftar ulang resource berlabel trial, dan periksa billing final. |

Urutan implementasi yang diusulkan:

1. **Preflight tanpa create:** SDK pin/lock, config secret server, actual org/tier/region/snapshot/price, anggaran dan account admission cap. Bila batas biaya/resource belum dapat ditegakkan, trial belum boleh dinyatakan siap.
2. **Harness CLI dan evidence:** create/get/exec/code/upload/download/start/stop/delete; catat ID nonsecret, timings, size/hash, expected/actual dan biaya. Buat cleanup yang dapat dijalankan ulang dari proses terpisah.
3. **Satu desktop nyata:** fixture HTML lokal dalam sandbox; shell/kode menulis hasil, Chromium pada display yang sama membukanya, Computer Use mengubah field, manusia melihat dan mengubah field yang sama melalui VNC. Periksa screenshot dan marker session unik, bukan hanya URL yang kebetulan sama.
4. **Gate owner/viewer/control minimum:** dua account, renewal/expiry/revoke link, koneksi WebSocket existing dan baru, takeover saat aksi queued/in-flight, stale worker, dua tab manusia, resume dengan fresh observation. Gunakan gateway yang benar-benar dapat mencabut channel input.
5. **Lifecycle/recovery:** disconnect viewer tanpa membunuh worker; matikan harness lalu reconnect dengan sandbox ID; stop/start dan archive/start container; bandingkan file hash, PID/in-memory counter serta cookie/profile sintetis. Uji auto-stop dengan background process, TTL saat activity terus ada, dan cleanup setelah proses lokal mati.
6. **Keputusan provider:** laporan pass/fail/gap per AC, latency, total resource cost dan residual resource; putuskan batas adapter NG-035/036 berdasarkan hasil, termasuk apakah RAM/session auth boleh dijanjikan.

Dokumen evidence disarankan di `docs/engineering/evidence/daytona-31/` setelah trial benar-benar dijalankan. Manifest minimum: tanggal, OS/SDK/snapshot/provider version bila tersedia, org/tier/region nonsecret, owner uji, config caps, sandbox/action/control IDs, input, expected/actual, timestamp, screenshot/trace, hash file, biaya estimasi/aktual dan cleanup readback. Redaksi token, signed URL, API key dan cookie.

## Gap yang wajib tetap terbuka

- Belum ada angka latency, biaya aktual, resource cleanup atau konfigurasi organisasi yang terverifikasi runtime.
- Belum terbukti sesi browser/profile yang sama, embed noVNC, reconnect atau minimum resource GUI.
- Belum terbukti owner isolation pada gateway/viewer, URL expiry/revoke terhadap socket aktif, atau input manusia benar-benar dapat dicabut.
- Belum terbukti dispatch fencing/drain saat takeover/stop, termasuk aksi shell/kode dan worker lama.
- Belum terbukti file persistence/recovery; RAM container tidak dijanjikan, auth situs dan VM pause tidak diambil sebagai acceptance dari dokumen.
- Belum ada hard runtime/cost/account cap yang diterima lewat fault injection. Provider TTL tersedia secara dokumentasi/source; efektivitas cleanup dan bill reconciliation harus dibuktikan.
- Browser internet umum dapat tetap gap bila tier organisasi membatasi tujuan; jangan menutupnya dengan keberhasilan halaman localhost.

NG-031 baru layak diterima setelah evidence aktual menutup AC atau keputusan kontrak/provider ditinjau secara eksplisit. Riset ini menyiapkan scope implementasi, tidak mengubah kriteria menjadi centang lulus.
