# Ringkasan M-RAG untuk Kajian Pustaka

Sumber: Zheng Wang, Shu Xian Teo, Jieer Ouyang, Yongjun Xu, dan Wei Shi (2024), *M-RAG: Reinforcing Large Language Model Performance through Retrieval-Augmented Generation with Multiple Partitions*, arXiv:2405.16420v1, 26 Mei 2024.

Berkas sumber: [M-RAG- Reinforcing Large Language Model Performance through Retrieval-Augmented Generation with Multiple Partitions.pdf](ngertiin://file/ca74bf24-a900-46b3-8529-3d0a541fefcc). Semua nomor halaman di bawah memakai urutan halaman PDF (1–13). Ringkasan disusun dari ekstraksi teks seluruh PDF; tidak ada eksperimen atau kode yang dijalankan dalam pekerjaan ini.

## Metode

M-RAG menjadikan **partisi basis data** sebagai unit retrieval, dengan tujuan memusatkan pencarian pada memori yang membantu kualitas generasi. Memori dalam eksperimen berupa pasangan contoh input–output, seperti dokumen–ringkasan atau konteks–respons, yang digunakan sebagai demonstrasi untuk LLM. Karena itu, bentuk memorinya perlu dibedakan dari RAG tutor sederhana yang mengambil potongan buku sebagai bukti faktual (hlm. 3–4, 12).

1. **Membagi basis data.** Paper mengevaluasi Randomization berbasis LSH, Clustering dengan K-means, Indexing melalui partisi graf navigabel menggunakan spectral clustering, serta Category berdasarkan label data. Strategi dan jumlah partisi dipilih secara empiris pada development set. Pilihan yang dilaporkan pada §3.1 adalah Indexing/4 partisi untuk peringkasan, Randomization/3 untuk penerjemahan, dan Category/10 untuk dialog. Top-1 menjadi default karena kinerja sebanding dengan Top-3 dalam studi awal, dengan runtime lebih rendah (hlm. 4; Gambar 1 hlm. 2 dan pembahasan hlm. 7–8).
2. **Agent-S memilih satu partisi.** State saat pelatihan memakai skor kemiripan maksimum antara pasangan input–referensi dan memori di setiap partisi. Aksinya adalah memilih indeks partisi. Penyusunan state tetap memerlukan pencarian pada tiap partisi; ini bukan router yang sepenuhnya menghindari akses ke partisi lain (hlm. 5–6).
3. **Agent-R memperbaiki memori pada partisi terpilih.** LLM menghasilkan sejumlah kandidat output untuk input memori yang diambil. Agent-R memilih kandidat, kemudian sistem memakai pasangan memori kandidat itu untuk menghasilkan hipotesis bagi input pelatihan. Jika skor hipotesis terhadap jawaban referensi meningkat, output memori diganti dengan kandidat tersebut. Proses diulang; Algorithm 1 memberi reward nol bila tidak ada peningkatan (hlm. 5–6).
4. **Melatih kedua agen dengan DQN.** Agent-R menerima reward berdasarkan peningkatan metrik tugas, misalnya ROUGE atau BLEU. Akumulasi reward dibagikan kepada Agent-S sehingga keduanya mengejar kualitas generasi. LLM tetap beku; parameter kebijakan kedua agen yang dilatih menggunakan Deep Q-Networks dengan replay memory (hlm. 5–6, 9).
5. **Inferensi lebih ringkas daripada pelatihan.** Agent-S terlatih memilih partisi dari basis data yang memorinya sudah diperbaiki, lalu LLM menghasilkan output menggunakan memori dari partisi itu. Jawaban referensi yang tidak tersedia saat inferensi, dan output memori, dihilangkan dari konstruksi state Agent-S sesuai §3.4. Loop perbaikan Agent-R bukan langkah yang wajib dijalankan ulang untuk setiap pertanyaan pengguna (hlm. 4, 6).

## Dua hasil utama

### 1. M-RAG meningkatkan beberapa skor generasi dibanding Selfmem

Pada Mixtral 8×7B, Tabel 1–3 menunjukkan perbaikan berikut (hlm. 8):

| Tugas dan ukuran | Selfmem | M-RAG | Selisih absolut | Kenaikan relatif* |
|---|---:|---:|---:|---:|
| XSum, ROUGE-1 | 44,67 | 48,13 | +3,46 poin | sekitar 7,75% |
| BigPatent, ROUGE-1 | 64,12 | 71,34 | +7,22 poin | sekitar 11,26% |
| Es→En, BLEU test | 37,11 | 39,98 | +2,87 poin | sekitar 7,73% |
| DailyDialog, BLEU-1 | 38,16 | 42,61 | +4,45 poin | sekitar 11,66% |

*Dihitung dari angka tabel: (M-RAG − Selfmem) / Selfmem × 100%; bukan kenaikan dalam poin persentase. Ini menjelaskan pembulatan klaim paper sekitar 8%, 11%, 8%, dan 12% untuk contoh-contoh tersebut. Angka 11% peringkasan tidak berlaku merata untuk setiap dataset atau metrik. M-RAG juga tidak mengungguli semua baseline pada setiap ukuran: DailyDialog Distinct-1 standar adalah 88,82, di bawah Selfmem 89,23 dan Naive RAG 89,42. Varian M-RAG(D) yang mengoptimalkan Distinct menghasilkan keberagaman lebih tinggi, dengan trade-off terhadap BLEU (hlm. 8).

### 2. Ablasi mendukung kontribusi kedua agen

Pada XSum, M-RAG penuh mencapai ROUGE-1 48,13. Tanpa Agent-S, dengan satu basis data, skor turun ke 44,20; penggantian Agent-R dengan pemilihan greedy menurunkannya ke 45,75; tanpa keduanya menjadi 43,82 (Tabel 5, hlm. 9). Temuan ini mendukung kombinasi pengaturan partisi dan kebijakan perbaikan memori. Namun, ablasi Agent-S sekaligus mengubah pengaturan menjadi satu basis data, sehingga tidak mengisolasi pengaruh kebijakan pemilihan dari seluruh pengaruh partisi.

## Batasan dan implikasi untuk agent pembelajaran

**Batasan eksplisit penulis:**

- Eksperimen memakai model terkuantisasi karena keterbatasan komputasi; rincian implementasi menyebut kuantisasi 4-bit. Dugaan penulis bahwa tren bertahan pada ukuran model lain merupakan ekspektasi, bukan bukti pengujian semua konfigurasi (hlm. 7, 9).
- Pelatihan masih mahal walaupun LLM beku, karena membutuhkan panggilan LLM berulang untuk kandidat dan evaluasi hipotesis. Kompleksitas Agent-R mendominasi pelatihan; caching pasangan hasil generasi dipakai untuk efisiensi (hlm. 6–7, 9).

**Catatan kritis untuk penggunaan dalam skripsi (interpretasi dari desain dan cakupan eksperimen):**

- Kualitas partisi dan jumlahnya harus divalidasi; lebih banyak partisi tidak otomatis lebih baik. Pada studi XSum, ROUGE-1 mencapai 48,13 pada M=4 lalu turun menjadi 47,21 pada M=5. Waktu retrieval naik dari 0,61 detik pada M=1 menjadi 2,19 detik pada M=4 dalam pengaturan yang dilaporkan; hasil ini bukan jaminan percepatan retrieval (Tabel 6, hlm. 9; diskusi ketergantungan partisi hlm. 13).
- Reward memerlukan output referensi dan metrik tugas pada pelatihan. Skor kemiripan teks seperti ROUGE/BLEU serta keberagaman Distinct tidak langsung membuktikan ketepatan fakta, kualitas pedagogis, atau peningkatan pemahaman siswa (definisi reward hlm. 5–6; metrik dan dataset hlm. 7).
- Dataset mencakup peringkasan berita/paten, penerjemahan teks legislatif, dan percakapan sehari-hari. Tidak dilaporkan evaluasi tutor belajar atau hasil belajar siswa. Penerapan pada agent pembelajaran adalah adaptasi yang masih perlu diuji, misalnya melalui ketepatan jawaban berbasis sumber, kualitas petunjuk, dan capaian belajar (hlm. 7–9).
- Ada ketidakselarasan pelaporan parameter: §3.1 menyebut jumlah partisi berbeda per tugas (4/3/10), sedangkan detail implementasi menyatakan M=4 dan K=3 secara umum. Replikasi perlu memperjelas konfigurasi tiap tugas (hlm. 4, 7).

## Paragraf awal untuk kajian pustaka

Wang dkk. (2024) memperkenalkan M-RAG, yaitu kerangka retrieval-augmented generation yang menggunakan beberapa partisi basis data dan dua agen reinforcement learning. Agent-S mempelajari pemilihan partisi, sedangkan Agent-R mempelajari pemilihan kandidat untuk memperbaiki memori demonstrasi. Kedua agen dilatih menggunakan DQN dengan reward berbasis peningkatan kualitas generasi, sementara parameter LLM tetap beku (hlm. 4–6). Evaluasi menunjukkan peningkatan beberapa skor peringkasan, penerjemahan, dan dialog dibandingkan baseline, serta penurunan skor ketika komponen agen dihapus atau diganti (hlm. 8–9). Akan tetapi, biaya pelatihan, ketergantungan pada pemilihan partisi dan metrik referensi, serta belum adanya evaluasi pembelajaran membatasi penarikan kesimpulan langsung untuk tutor pendidikan (hlm. 5–7, 9, 13).
