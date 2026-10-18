# Ngertiin

## Register

product

## Platform

web

## Users and purpose

Asisten personal umum bagi orang yang ingin menyampaikan ide, meminta bantuan berpikir/menulis, mengolah file, menjalankan kode/browser, dan menjadwalkan pekerjaan tanpa mengoperasikan CLI/VPS sendiri. [Spesifikasi aktif](docs/product/01-produk-dan-paket.md) menetapkan scope; Notion adalah sumber keputusan/status.

## Product direction

V1 wajib mencakup main/side chat, task background, approval umum, file/results persisten, Daytona sandbox, browser, VNC/live desktop/takeover pada sesi yang sama, scheduler offline, persona, memory, goals, proaktivitas terkontrol, Library/search, usage dan pembayaran. Baseline chat telah dipertahankan; fitur berikutnya adalah gap bertiket, bukan kemampuan yang dianggap tersedia. Course/Lesson/Practice hanya arah berikutnya, tanpa kode/fixture/tiket pembelajaran sebagai dependency aktif.

Cleanup NG-026–030 menjadi gerbang pertama sebelum trial Daytona. Workspace/hasil persisten; proses/RAM hanya dijanjikan sesudah verifikasi provider. Harga/allowance komersial mengikuti telemetry dan benchmark, dengan batas chat development sementara.

## Design

Reuse Soft Matcha semantic tokens dan komponen yang ada. Pen walkthrough lama menyimpan riwayat pembelajaran; shell/onboarding/walkthrough asisten umum mengikuti NG-032. Pertahankan draft, history, replay serta kontrol stop/retry saat koneksi pulih. Panel komputer memakai session yang sama bagi agent/user; backend mengatur exclusive control dan agent membaca keadaan baru sebelum lanjut.

## Accessibility

Semantic HTML, label input, keyboard navigation, visible focus, reduced motion, responsive layout dan user controls yang tetap tersedia saat allowance habis. Acceptance memakai browser nyata, static/build, targeted probes dan fault injection sesuai risiko modul.
