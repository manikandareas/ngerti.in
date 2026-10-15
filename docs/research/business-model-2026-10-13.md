# Rancangan bisnis Ngertiin — 13 Oktober 2026

Status: baseline sementara disepakati pengguna pada 13 Oktober 2026: Free 1 Course/30 hari dan Plus Rp49.000/30 hari untuk 5 Course, dengan model Luna/Sol serta kualitas yang sama. Baseline paket telah dicatat pada [Produk & Paket](../product/01-produk-dan-paket.md); dokumen ini menyimpan riset dan perhitungan pendukung. Normalisasi halaman, biaya, conversion, dan kelayakan paket tetap perlu diuji dengan transaksi dan telemetry production; persetujuan arah bisnis bukan bukti bahwa target biaya sudah tercapai. Riset menggunakan halaman resmi vendor, sumber benchmark lokal, dan perhitungan ulang tarif API; tidak menggunakan survei willingness to pay.

## Rekomendasi utama

Mulai sebagai **SaaS B2C freemium dengan langganan kapasitas belajar**, memakai Free dan satu paket berbayar Plus saat peluncuran. Usulan harga awal yang direvisi: **Rp49.000 untuk 30 hari**, dengan target lima Course lengkap, dengan pembayaran rupiah dan perpanjangan yang jelas. Pro dapat ditambahkan setelah ada kebutuhan kapasitas lebih besar dan data biaya yang mendukungnya.

Yang dibeli pengguna adalah kapasitas untuk terus belajar bersama agent personal: membuat Course dari materi atau tujuan mereka, mendapat penjelasan, menyelesaikan Lesson dan Practice, menerima pengayaan, dan mengulang flashcard. Kepribadian, memory, kualitas pengajaran, dan mekanisme persetujuan tersedia pada semua paket; perbedaannya kuota.

Usulan positioning: **“Agent belajar personal yang mengubah materimu menjadi Course dan menemanimu sampai selesai.”** Ini janji produk yang harus dibuktikan melalui pengalaman pengguna, bukan klaim bahwa kompetitor tidak memiliki fitur serupa.

## Batas produk yang sudah disepakati

- Pengguna utama adalah pelajar SMA dan mahasiswa dengan materi serta tujuan belajar sendiri. Akuisisi awal dapat difokuskan pada mahasiswa yang membawa PDF/slide untuk tujuan dekat seperti UTS/UAS, tanpa mengubah cakupan produk.
- Satu agent menemani pengguna lintas topik. Soul berubah atas permintaan eksplisit dengan HITL; memory diperbarui aktif dari percakapan penting dan aktivitas belajar. Tidak ada fitur Notes tersendiri.
- Course tidak terikat Study Space. Pencarian materi pengguna dan internet berjalan otomatis; pengguna memilih sumber dan menyetujui outline.
- Node terdiri dari beberapa Lesson dan Practice. Practice wajib selesai, termasuk putaran menjawab ulang soal salah; nilai rendah tetap membuka node inti berikutnya. Pengayaan opsional tidak mengubah progress Course inti.
- Practice mandiri dan Exam belum masuk v1. Flashcard tersimpan; streak berasal dari aktivitas belajar valid.
- Outline disetujui, node pertama diprioritaskan, lalu node berikutnya disiapkan di background. Peluncuran memakai akun/data baru, dengan Free dan pembayaran sejak awal.

## Kondisi pasar yang memengaruhi keputusan

| Pembanding | Harga publik yang diamati | Implikasi dan batas bukti |
| --- | --- | --- |
| Google AI Plus | Rp75.000/bulan; tersedia paket gratis | Acuan lokal untuk AI umum yang juga menyediakan kemampuan belajar. Harga halaman publik, bukan checkout akun tertentu. [Paket resmi Indonesia](https://gemini.google/id/subscriptions/?hl=id). |
| Promo mahasiswa Google | AI Plus gratis 12 bulan bagi mahasiswa Indonesia yang memenuhi syarat; klaim sampai 31 Desember 2026 | Hambatan besar bagi akuisisi mahasiswa. Memerlukan metode pembayaran valid dan memiliki ketentuan perpanjangan berbayar. [Pengumuman resmi](https://blog.google/intl/id-id/products/explore-get-answers/back-to-school-sambut-tahun-ajaran-baru-2026/). |
| StudyFetch Premium | iOS Indonesia: Rp349.000/bulan, Rp499.000/kuartal, Rp1.699.000/tahun | Pembanding produk belajar, tetapi ini SKU App Store, bukan harga web yang terverifikasi. Harga tahunan/kuartalan dibayar untuk seluruh periode. [App Store Indonesia](https://apps.apple.com/id/app/studyfetch-ai-tutor/id6663574866). |
| Knowt Ultra | US$24,99/bulan atau US$149,99/tahun di muka | Ada Free. Halaman menampilkan ekuivalen tahunan yang tidak konsisten dengan total; gunakan total tahunannya. Checkout Indonesia belum diverifikasi. [Paket resmi](https://knowt.com/plans). |
| Quizlet | Plus US$35,99/tahun; Unlimited US$44,99/tahun | Harga ekuivalen bulanan bukan pilihan pembayaran bulanan. Harga checkout rupiah belum diverifikasi. [Upgrade resmi](https://quizlet.com/upgrade?source=footer). |
| Ruangguru AiRIS | Basic gratis, Stellar premium dengan Stellar Energy | Harga resmi terkini belum terverifikasi. Sudah mengusung tutor/companion dengan karakter, sehingga persona saja belum membuktikan diferensiasi. [AiRIS resmi](https://www.ruangguru.com/airis). |

ChatGPT Go juga memiliki acuan Rp75.000/bulan dalam pengumuman resmi Telkomsel November 2025. Angka ini **bukan hasil verifikasi checkout terkini**; promo bundling di halaman partner berakhir 31 Mei 2026. Karena itu, promo Rp50.000 tidak dipakai sebagai penawaran aktif. [Pengumuman partner](https://www.telkomsel.com/about-us/news/telkomsel-openai-hadirkan-promo-bundel-chatgpt-go-yang-lebih-terjangkau-mulai-rp50000), [ketentuan partner](https://www.telkomsel.com/vas/chatgpt).

Google juga telah mengumumkan notebook belajar dari materi unggahan, rencana belajar terstruktur, kuis diagnostik, ringkasan/kuis yang disesuaikan, progress, dan flashcard. Maka fitur “upload materi lalu buat rangkuman/soal” sudah berhadapan dengan kompetisi langsung. [Pengumuman fitur belajar](https://blog.google/intl/id-id/products/explore-get-answers/awali-semester-baru-dengan-gemini-gratis-selama-1-tahun/).

Inferensi untuk Ngertiin: harga di bawah Rp75.000 bisa menjadi hipotesis awal, tetapi tidak membuktikan orang akan membayar. Diferensiasi yang perlu diuji adalah kualitas Course, kesinambungan pendampingan, tindak lanjut kesalahan, dan kemudahan menyelesaikan tujuan belajar. Soul/memory adalah cara mewujudkan pengalaman itu, bukan istilah utama dalam penawaran kepada pelajar.

## Audit biaya: kuota prototipe lama tidak dapat langsung dipakai

Proposal pricing prototipe 8 Oktober menggunakan cadangan sekitar Rp140/node dan paket Plus Rp59.000 dengan 50 node. Proposal tersebut berasal dari scope/model sebelumnya. Benchmark v5 lokal terbaru memakai campuran `gpt-6-luna` dan `gpt-6.1-sol`, sehingga asumsi itu perlu diperbarui.

Sumber lokal: [ringkasan benchmark v5 Sol](../../../ngerti.in/output/journey-v5-sol/summary.json), [bukti dan batas benchmark](../../../ngerti.in/docs/engineering/journey-v5-benchmark-evidence.md), [proposal pricing lama](../../../ngerti.in/docs/research/subscription-pricing-v2-2026-10-08.md). Artefak benchmark ini tersedia di checkout saudara pada tanggal audit; keberadaan file tidak membuktikan deployment production maupun penerimaan kualitas manusia.

Perhitungan memakai tarif **Standard, short context, input uncached**, per satu juta token: Luna US$0,10 input / US$0,50 output; Sol US$2 input / US$10 output. Diskon batch/flex, cache hits, cache writes, dan pilihan service tier belum direkonsiliasi dengan invoice. Kurs **Rp17.000/USD adalah asumsi perencanaan**, bukan kurs spot. [Tarif API resmi](https://developers.openai.com/api/docs/pricing).

Rumus: `biaya USD = Σ(input token × tarif input + output token × tarif output) / 1.000.000`. Total setiap fixture dibagi jumlah node outline yang disetujui untuk membuat proxy biaya per node.

| Fixture | Node | Luna input / output | Sol input / output | Estimasi total rupiah | Proxy per node |
| --- | ---: | ---: | ---: | ---: | ---: |
| Konsep sederhana | 1 | 31.765 / 4.797 | 27.472 / 4.596 | Rp1.810 | Rp1.810 |
| Mekanisme kompleks | 2 | 49.266 / 7.523 | 71.305 / 11.158 | Rp4.469 | Rp2.234 |
| Prosedur matematis | 1 | 32.155 / 4.754 | 53.899 / 8.624 | Rp3.394 | Rp3.394 |
| Keterampilan praktis | 2 | 48.647 / 7.563 | 65.122 / 10.362 | Rp4.123 | Rp2.061 |
| Materi multibab | 3 | 70.719 / 9.795 | 75.588 / 9.845 | Rp4.447 | Rp1.482 |

Lima fixture selesai dengan review otomatis lolos; human review masih diperlukan. Fixture sumber tidak memadai tidak menghasilkan node, tetapi tetap menghabiskan token senilai estimasi Rp559.

Rentang sekitar **Rp1.500–Rp3.400/node hanya indikasi biaya teks dari sembilan node**. Total benchmark mencakup overhead outline dan review tambahan benchmark, sehingga bukan biaya marginal node production. Sebaliknya, OCR, embedding, pencarian, gambar, grading selama pengguna belajar, memory, proaktivitas, kegagalan/retry transport, queue, storage, dan publikasi database belum seluruhnya termasuk. Sampel kecil ini tidak menyediakan P90/P95 biaya pengguna.

## Revisi arah: kuota Course dan harga di bawah Rp50.000

Arahan terbaru pengguna menggantikan usulan kuota node: kuota Free dan Plus perlu lebih generous, dihitung per Course, serta mempertahankan jumlah node/aktivitas yang dibutuhkan untuk memenuhi standar belajar. Pengguna menetapkan GPT-6 Luna sebagai model utama dan GPT-6.1 Sol sebagai model pintar, dengan strategi harga di bawah Rp50.000 untuk menjangkau banyak pengguna.

Angka benchmark sebelumnya sudah memakai kedua model itu. Pemilihan Luna/Sol tidak otomatis menurunkan estimasi lama; efisiensi pipeline perlu dibuktikan secara terpisah. Keputusan paket terbaru tercatat pada [Produk & Paket](../product/01-produk-dan-paket.md).

## Baseline paket sementara dan validasi

| Kapasitas | Free | Plus — usulan Rp49.000/30 hari |
| --- | --- | --- |
| Course baru | 1 Course per 30 hari | 5 Course per periode |
| Chat agent | 100 pesan pengguna per 30 hari | 300 pesan pengguna per periode |
| Materi baru | Kandidat 100 halaman ekuivalen per 30 hari | Kandidat 200 halaman ekuivalen per periode |
| Agent, soul, memory, HITL, Course, Practice dalam node, flashcard, streak | Sama, dalam kuota | Sama, dalam kuota |

Ini **target paket untuk pengujian**, bukan entitlement yang sudah aman untuk dijanjikan berdasarkan biaya sekarang. Usulan Rp39.000 diuji sebagai sensitivitas harga lebih rendah; Rp49.000 memberi ruang kontribusi lebih besar sambil memenuhi batas harga pengguna. Harga lama Rp69.000 dan kuota berbasis node tidak lagi menjadi rekomendasi aktif.

Kuota node internal untuk billing dihapus dari rancangan. Jumlah node, Lesson, dan Practice ditentukan oleh tujuan belajar, konteks materi, dan standar pedagogi. Perkiraan ukuran Course dalam simulasi biaya tidak menjadi hard cap produk.

Satu Course adalah rangkaian belajar dengan tujuan dan outline yang disetujui pengguna. Untuk cakupan sangat luas, agent dapat menawarkan beberapa Course yang koheren secara pedagogi sebelum approval; pengguna memilih. Sistem tidak membelah Course hanya untuk menambah penagihan, memotong outline agar sesuai budget, atau meminta membeli Course lagi untuk menyelesaikan outline yang telah disetujui.

Pembuatan Course inti mencakup seluruh node yang disetujui. Penyelesaian Lesson, Practice, putaran mengulang soal salah, flashcard, serta pengayaan yang direkomendasikan untuk tujuan Course itu tidak dihitung sebagai Course baru. Biaya pengayaan dan aktivitas belajar harus masuk telemetry biaya Course; jumlah node pengayaan bukan meter penagihan tersembunyi.

Batas file/halaman lintas PDF, dokumen lain dan web tetap perlu dinormalisasi. Kandidat halaman di tabel harus diuji khususnya pada dokumen scan, bukan diasumsikan setara dengan PDF digital yang dapat diekstrak teksnya.

## Aturan konsumsi Course

1. Memilih sumber dan meninjau outline belum memakai satu slot Course. Pesan chat tetap mengikuti kuota chat yang jelas.
2. Approval pembuatan mereservasi satu Course. Node pertama diprioritaskan dan node berikutnya tetap dibuat di background; seluruh outline memakai slot yang sama.
3. Slot dicatat sekali ketika Course mulai disediakan untuk belajar. Resume, repair kegagalan sistem, dan node berikutnya tidak menagih Course lagi. Kegagalan sistem yang membuat outline disetujui tidak dapat dipenuhi harus mengembalikan slot sesuai kebijakan yang jelas.
4. Course yang sudah dibuat tetap dapat dipelajari setelah kuota pembuatan habis. Perpanjangan atau downgrade tidak memecah Course yang sudah dibeli menjadi entitlement node terpisah.
5. Tujuan belajar baru yang menghasilkan Course baru memakai slot baru setelah HITL. Pengayaan tujuan Course yang sama tetap bagian Course tersebut.
6. Review konten dan standar kualitas sama pada semua paket. Rate limit, batas repair, dan pengelolaan konteks menjaga operasi; batas tersebut tidak digunakan untuk menerbitkan konten yang gagal standar.

## Biaya Course dengan pipeline sekarang

Benchmark lokal berisi sembilan node dari lima fixture pendek. Tidak tersedia usage per panggilan/tahap yang cukup untuk menghapus tepat lima review independen tambahan benchmark dari total biaya. Karena itu, biaya production tanpa review ekstra belum dapat diklaim sebagai angka terukur.

Sebagai sensitivitas, kalikan rentang proxy teks Rp1.500–Rp3.500/node dengan beberapa ukuran Course:

| Ukuran Course dalam simulasi | Rentang estimasi teks/Course |
| --- | ---: |
| 4 node | Rp6.000–Rp14.000 |
| 6 node | Rp9.000–Rp21.000 |
| 10 node | Rp15.000–Rp35.000 |

Angka ini bukan benchmark Course besar maupun aturan ukuran Course; overhead outline tidak linear dan ukuran/konteks/repair dapat berubah. Namun, lima Course dengan masing-masing enam node sudah mengindikasikan Rp45.000–Rp105.000 untuk teks saja. **Dengan pipeline biaya saat ini, paket lima Course di bawah Rp50.000 belum terbukti layak.**

Pada lima fixture yang berhasil, sekitar 96% estimasi biaya teks berasal dari Sol meskipun Luna menangani banyak panggilan. Ini alasan untuk mengaudit input/output serta repair Sol, bukan sekadar menghitung persentase jumlah panggilan atau mengganti label model.

## Rancangan routing Luna dan Sol

| Pekerjaan | Model awal yang diusulkan |
| --- | --- |
| Interaksi rutin, penjelasan, klasifikasi event dan kandidat memory | GPT-6 Luna |
| Analisis materi, draf Lesson dan draf soal | GPT-6 Luna |
| Perencanaan Course dan validasi tujuan/cakupan | GPT-6.1 Sol |
| Review semantik konten, key soal, ambiguitas dan konsistensi setiap node | GPT-6.1 Sol |
| Repair semantik sulit serta tutoring yang memerlukan penalaran lebih kuat | GPT-6.1 Sol |

Ini rancangan routing untuk diuji, dengan jalur kualitas yang sama bagi Free dan Plus. Checks deterministik tetap berjalan sebelum review semantik. Review node tetap dilakukan sebelum pengguna mempelajarinya.

Peluang efisiensi: berikan evidence relevan dan konten node yang sedang diperiksa, hilangkan payload/history/schema yang berulang, gunakan output review terstruktur yang ringkas, pisahkan temuan material dari saran, dan pertahankan konten valid ketika memperbaiki bagian yang salah. Embedding/parsing materi yang sama direuse lintas Course. Memory diringkas dan diambil sesuai relevansi, bukan seluruh history dimasukkan pada setiap respons.

Cache dan layanan background dapat dievaluasi setelah kualitas/latensi dasar terukur; simulasi tidak mengasumsikan diskon otomatis hanya karena node dibuat di background. Perubahan pipeline harus dinilai pada sumber serta standar yang sama, melalui review otomatis dan review manusia.

## Simulasi target biaya setelah optimasi

Untuk menguji paket lima Course, gunakan asumsi non-Course: 300 chat × Rp15, 200 halaman × Rp10, pencarian Rp1.000, dan memory/operasi Rp1.500 per akun/periode. Total Rp9.000. Tambahkan reserve 20% atas biaya Course dan subtotal tersebut. **Semua angka ini adalah target anggaran, bukan konsumsi atau tarif OCR yang terukur.**

Khususnya, Rp15/chat mengasumsikan interaksi mayoritas Luna dengan konteks relevan dan sebagian escalation yang masih muat budget; Rp10/halaman mengasumsikan pemrosesan dominan dokumen digital. Kedua asumsi perlu diuji pada chat panjang, soal sulit, dokumen scan, web, dan aktivitas agent proaktif.

Biaya normal grading, retry sistem, pengayaan, dan aktivitas background sementara diwakili reserve. Reserve bukan bukti bahwa biaya tersebut pasti cukup. Telemetry Course harus mengukur semuanya agar harga mengikuti biaya pengalaman lengkap.

Fee QRIS publik Duitku 0,7% menghasilkan Rp343 untuk harga Rp49.000 dan Rp273 untuk harga Rp39.000. Ketentuan merchant, pajak fee, refund, dan payout belum direkonsiliasi. [Tarif resmi Duitku](https://www.duitku.com/harga/).

| Asumsi generasi/Course | Biaya variabel plus reserve, lima Course | Kontribusi Rp49.000 | Kontribusi Rp39.000 |
| --- | ---: | ---: | ---: |
| Rp1.500 | Rp19.800 | Rp28.857 / 58,9% | Rp18.927 / 48,5% |
| Rp2.000 | Rp22.800 | Rp25.857 / 52,8% | Rp15.927 / 40,8% |
| Rp2.500 | Rp25.800 | Rp22.857 / 46,6% | Rp12.927 / 33,1% |
| Rp5.000 | Rp40.800 | Rp7.857 / 16,0% | -Rp2.073 / -5,3% |
| Rp9.000 | Rp64.800 | -Rp16.143 / -32,9% | -Rp26.073 / -66,9% |

Kontribusi belum mencakup biaya tetap, subsidi Free, akuisisi, support, pajak, refund, dan gaji. Dalam skenario ini, untuk kontribusi 50% saat seluruh kuota dipakai, biaya generasi rata-rata perlu sekitar maksimum Rp2.226/Course pada Rp49.000, atau Rp1.404/Course pada Rp39.000.

**Target awal audit: sekitar Rp2.000/Course, dengan kualitas diterima dan aktivitas tambahan benar-benar terukur. Target ini belum tercapai.** Contoh envelope token hipotetis adalah Luna 60.000 input / 12.000 output dan Sol 30.000 input / 2.000 output per Course. Pada tarif Standard dan kurs perencanaan yang sama, teksnya Rp1.564 sebelum repair dan biaya lain. Envelope tersebut hanya menunjukkan kebutuhan efisiensi; tidak membuktikan token sebanyak itu cukup untuk Course besar atau memenuhi standar review.

Pada enam node, target Rp2.000/Course jauh di bawah rentang proxy benchmark sekarang. Karena itu, kuota lima Course belum boleh dipublikasikan sebagai janji production hanya berdasarkan tabel target. Bila biaya nyata lebih tinggi, sesuaikan eksperimen kapasitas dalam batas harga di bawah Rp50.000, dengan Course tetap lengkap.

## Quantity pengguna dan subsidi Free

Strategi volume membutuhkan kontribusi positif dari pelanggan berbayar dan anggaran Free yang terkendali. Jumlah signup yang lebih besar tidak mengubah biaya per Course menjadi lebih murah secara otomatis.

Contoh Free yang memakai seluruh kuota dalam satu periode: generasi Rp2.000, 100 chat × Rp15, 100 halaman × Rp10, search Rp300, memory/operasi Rp300, lalu reserve 20%. Estimasinya **Rp6.120/akun/periode**, memakai biaya optimasi yang belum terbukti.

Dengan kontribusi Plus Rp25.857 dan paid share 5% dari akun aktif, biaya rata-rata Free harus di bawah sekitar **Rp1.361/akun/periode** hanya untuk menutup subsidi Free, sebelum biaya tetap dan akuisisi baru. Paid share akun aktif berbeda dari trial-to-paid conversion.

| Asumsi biaya Free rata-rata/periode | Kontribusi 50 Plus pada skenario Rp2.000/Course | Subsidi 950 Free | Sisa sebelum biaya tetap/akuisisi |
| --- | ---: | ---: | ---: |
| Rp500 | Rp1.292.850 | Rp475.000 | Rp817.850 |
| Rp1.000 | Rp1.292.850 | Rp950.000 | Rp342.850 |
| Rp6.120, seluruh allowance terpakai | Rp1.292.850 | Rp5.814.000 | -Rp4.521.150 |

Tabel menggunakan 1.000 akun aktif dengan 5% paid sebagai asumsi, bukan forecast atau data Ngertiin. Free rata-rata rendah belum terbukti. Pengguna yang baru onboarding juga perlu dipisahkan karena biaya Course pertama dapat terkonsentrasi saat akuisisi.

Mulai dengan cohort yang ukuran/budget-nya ditetapkan, ukur biaya Course pertama, biaya Free berulang, paid share, dan renewal. Keberhasilan bisnis harus terlihat pada pengguna yang belajar dan membayar, bukan hanya signup atau allowance yang tidak digunakan. Tidak ada model lebih rendah atau standar Course yang diturunkan khusus Free.

## Pembayaran, distribusi dan validasi

Usulan peluncuran: Free dan Plus, transaksi rupiah, periode 30 hari. QRIS dan perpanjangan manual dapat dipakai bila provider belum mendukung billing otomatis yang diperlukan; QRIS sendiri bukan bukti autodebit. Tanggal berakhir dan cara memperpanjang terlihat sebelum pembayaran. Paket tahunan serta Pro belum menjadi fokus pengujian.

Akuisisi awal: komunitas kampus, pembuat konten belajar, dan referral pengguna yang membawa PDF/slide serta tujuan belajar nyata. Demo onboarding mengikuti Course pertama pengguna, hingga Lesson/Practice dan hasil belajar awal. Distribusi institusi bisa diteliti setelah pola penggunaan individu terbukti.

Catat signup → outline disetujui → node pertama siap → Lesson/Practice selesai → kembali belajar → pembayaran → renewal. Ukuran utama adalah pengguna yang menyelesaikan aktivitas belajar valid setiap minggu. Ukuran pendamping: kualitas hasil human review, waktu siap node pertama, biaya generation dan keseluruhan lifecycle Course, biaya per akun P50/P90, proaktivitas, subsidi Free, conversion, serta renewal periode kedua/ketiga.

Tahap berikutnya adalah benchmark ulang Course pendek, sedang, besar dan materi tidak memadai dengan routing Luna/Sol yang dioptimalkan. Jangan mengunci jumlah node atau menghilangkan review demi memenuhi target biaya. Harga Rp39.000 dan Rp49.000 boleh diuji dengan allowance sama setelah kualitas serta budget cukup terbukti; cohort kecil tidak otomatis menghasilkan A/B yang meyakinkan.

## Rerun inputs

```yaml
workflow: firecrawl-market-research
query: Indonesian B2C personal AI learning SaaS pricing and unit economics
verification_date: 2026-10-13
companies: [Google Gemini, StudyFetch, Knowt, Quizlet, Ruangguru AiRIS, OpenAI]
data_points: [public localized pricing, billing period, student offers, feature overlap, API tariffs, payment fees]
output: markdown
local_benchmark: ../ngerti.in/output/journey-v5-sol/summary.json
fx_assumption_idr_per_usd: 17000
```
