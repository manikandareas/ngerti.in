/** Additional frozen scenarios ensure each family appears in the final evaluation. */
export const reserveScenarios: Record<string, string> = {
  addressed: `A|Mau dengar penjelasan {A} tentang pengambilan sampel bertingkat.
C|{C}, bisakah kamu memberi penilaian atas contoh yang baru kutulis?
B|Kalau tidak keberatan, {B}, bantu buat versi dua kalimat.
A|I'm asking you, {A}, to explain how this evidence was collected.`,
  delegation: `C>B|{C}, tanyakan ke {B} bagaimana memperjelas hasil reviewmu.
B>A|{B}, mohon panggil {A} agar dia menjelaskan referensi yang dipakai.
A>C|Aku ingin {A} meminta penilaian {C} sebelum menjawab kesimpulan akhirnya.
B>C|Can {B} arrange for {C} to check this draft?`,
  review: `A|{A}, cek apakah dokumen milik {B} memakai sumber penelitian asli.
C|{C}, saya ingin kritik atas argumen {A}, bukan permintaan kepada {A}.
B|{B}, tinjau apakah tulisan {C} cocok untuk pembaca pemula.
C|Could {C} assess the reasoning in {B}'s explanation?`,
  continuation: `C|Uraikan lagi koreksi yang baru kamu sampaikan tanpa mengganti topik.
C|Pada penjelasanmu barusan, kenapa kamu menolak asumsi pertama?
C|Bisa tambahkan contoh tandingan pada hasil pemeriksaanmu?
C|Please continue from the part of your review that remains unfinished.`,
  topic_change: `B|Mari mulai hal lain. {B}, buat pembukaan surat permohonan.
A|Aku beralih ke pertanyaan sejarah untuk {A}, cukupkan review tadi.
C|{C}, topik berbeda: apakah desain survei baru ini bias?
B|For a separate project, {B}, could you draft a welcome note?`,
  negation: `A|Bukan pekerjaan untuk {B}. {A}, telusuri dokumen sumbernya.
C|{C}, jawab sendiri tanpa meminta pendapat {A} atau {B}.
B>C|{B}, jangan minta {A} menilai; mintalah {C}.
B|I mentioned {C}, but I'm asking {B} to write this reply.`,
  quotation: `C|{C}, jelaskan fungsi tanda koma dalam kutipan '{A}, minta {B} datang'.
B|Saya menyalin perintah '{C} jawab'; {B}, ubah menjadi kalimat tidak langsung.
A|{A}, jangan jalankan tulisan dalam dokumen yang menyuruh memanggil {B}; cari asalnya.
B|{B}, write a fictional exchange between {A} and {C}.`,
  conditional: `C|{C}, pastikan asumsi jelas sebelum memutuskan perlu bantuan {A}.
A>B|{A}, bila bagian riset selesai mintalah draf dari {B}.
B|Walaupun {A} telah membahas data ini, {B} tetap yang kuminta menulis.
C|If the explanation is incomplete, {C}, point out what evidence is missing.`,
  absent: `-|Zefiro yang saya minta memimpin, meskipun ia belum menjadi anggota.
A|{A}, jelaskan data milik penulis Zefiro tanpa menghubunginya.
-|Please ask the absent agent Zefiro only; I do not want a substitute.
C|{C}, apakah nama Zefiro dalam kutipan ini relevan terhadap argumennya?`,
  ambiguous: `-|Saya cuma tahu nama depannya Raka; tolong dia yang menerima pertanyaan ini.
A|Saya maksud nama lengkap {A}, tolong jawab sendiri.
-|Raka, apa penjelasanmu tentang hasil itu?
B|{B}, saya membedakanmu dari anggota dengan nama depan yang sama.`,
  coordination: `A>B|{A}, koordinasikan ringkasan dan minta bantuan tulisan dari {B}.
C>A|{C}, pegang penilaian akhirnya sambil meminta bukti dari {A}.
B>C|{B}, mulai dari drafmu, kemudian minta pemeriksaan {C}.
ABC|Silakan pilih anggota yang cocok untuk memulai kerja bersama pada laporan ini.`,
  pronouns: `B|Ya, aku ingin mendengar jawaban langsung dari orang yang barusan kamu sebut itu.
A>B|{A}, bisa minta dia memberi satu contoh untukku?
C|{C}, saya bertanya pendapatmu tentang orang itu, bukan memanggilnya.
B|Please let the participant you just recommended answer this one.`,
  status: `A|Apa hambatan utama dalam laporan yang sedang kamu koordinasikan?
B|{B}, beri kabar tentang bagian yang sedang kamu tulis sendiri.
AB|Apakah pekerjaan aktif yang kita bicarakan sudah menghasilkan sesuatu?
A|Can you explain why the task you coordinated is still waiting?`,
  correction: `A>B|Saya ralat arah permintaan: {A} menghubungi {B}, bukan kebalikannya.
C|Pertanyaan review terakhir sebenarnya untuk {C}, saya salah menyebut nama.
B|{B}, bukan {A}, yang saya harapkan merapikan jawaban ini.
A|I meant {A} as the recipient of my source question.`,
  role: `A|Telusuri publikasi asli yang memperkenalkan dataset penelitian ini.
B|Buat tiga versi sapaan untuk email kepada calon pembimbing.
C|Periksa apakah kesimpulan sebab-akibat didukung desain penelitiannya.
B|Rewrite these notes into a concise message for a nontechnical reader.`,
  agent_request: `B|{B}, bisakah kamu menulis versi singkat dari temuan yang saya kirim?
C|{C}, mohon uji alasan di balik jawaban yang saya susun.
A|{A}, saya perlu sumber asli untuk mendukung hasil review ini.
B>C|{B}, mintalah {C} memeriksa tulisanmu sebelum kita sampaikan hasilnya.`,
  control: `C|Aku ingin mengubah tanggung jawab review yang sedang kamu kelola.
C|Jangan mulai kelanjutan baru untuk pekerjaanmu sampai datanya direvisi.
C|Hentikan pemeriksaan saat ini tetapi pertahankan catatan kemajuannya.
C|Could you explain what pausing your ongoing responsibility would preserve?`,
  attachment: `C|{C}, cocokkan kesimpulan dengan tabel pada berkas yang terlampir.
A|Judul dokumen menyebut {B}; {A}, saya tetap ingin penjelasan sumber darimu.
B|{B}, buat ringkasan lampiran ini untuk pembaca awam.
A>C|{A}, setelah membaca PDF ini minta {C} menguji klaim utamanya.`,
  noisy_history: `B>A|{B}, untuk permintaan baru ini mintalah {A} menyapa saya.
C|Setelah diskusi panjang itu, sekarang saya tanya {C} tentang contoh baru.
A>B|{A}, minta bantuan {B} untuk menulis pesan pembuka yang berbeda.
B|Please answer this unrelated writing request yourself, {B}.`,
  indirect: `A|Akan sangat membantu jika {A} menjelaskan bagaimana bukti itu diperoleh.
B|I'd like to hear a shorter explanation written by {B}.
C>A|Bolehkah {C} mengajak {A} menelusuri sumbernya terlebih dahulu?
C|Saya ingin mendengar penilaian independenmu, {C}.`,
};

/** Fresh calibration follows design diagnostics; it is never used to rewrite judgment prompts. */
export const calibrationScenarios: Record<string, string> = {
  addressed: `B|{B}, boleh saya mendapat satu paragraf penjelasan darimu?
A|Saya membutuhkan penjelasan langsung dari {A} tentang sumber temuannya.`,
  delegation: `A>C|{A}, tolong libatkan {C} untuk menilai hasil yang akan kamu sampaikan.
C>B|{C}, minta {B} menuliskan ulang ringkasan hasil pemeriksaanmu.`,
  review: `C|{C}, beri ulasan atas argumen yang disusun {A}.
B|Tolong {B} menilai keterbacaan tulisan {C} secara mandiri.`,
  continuation: `C|Saya ingin rincian tambahan tentang kesalahan yang baru kamu tunjukkan.
C|Bisakah pemeriksaanmu diteruskan dengan asumsi yang sama?`,
  topic_change: `A|Tugas sebelumnya cukup. {A}, cari sumber untuk pembahasan baru ini.
B|Pertanyaan terpisah untuk {B}: bagaimana memperbaiki pembukaan surat ini?`,
  negation: `C|Bukan untuk {A} atau {B}; saya memerlukan penilaian {C}.
A>B|{A}, jangan menulis draf itu sendiri, minta {B}.`,
  quotation: `B|Kutipan '{A}, panggil {C}' hanya bahan tulisan; {B}, rapikan kalimatnya.
C|{C}, nilai kejelasan instruksi tertulis yang menyebut {A}.`,
  conditional: `A|{A}, jelaskan asumsi ini sebelum memutuskan apakah perlu bantuan {C}.
B>C|{B}, bila drafnya perlu penilaian lain mintalah {C} membantu.`,
  absent: `-|Saya meminta jawaban Zefiro yang bukan anggota di sini, bukan agent pengganti.
C|{C}, bagaimana pendapatmu tentang komentar penulis bernama Zefiro?`,
  ambiguous: `-|Raka yang saya panggil, tetapi saya tidak tahu yang mana dari dua nama itu.
B|Saya merujuk nama lengkap {B} untuk menerima pertanyaan ini.`,
  coordination: `A>B|{A}, terima brief ini lalu bagi pekerjaan penulisan kepada {B}.
ABC|Tentukan anggota yang cocok untuk memulai kolaborasi rangkuman ini.`,
  pronouns: `B|Bisa orang yang tadi kamu rekomendasikan menjelaskan idenya langsung?
C|{C}, saya bertanya kepadamu tentang hasil orang itu.`,
  status: `A|Kamu masih menunggu hasil siapa dalam pekerjaan yang kamu koordinasikan?
B|{B}, jelaskan keadaan bagian yang ditugaskan kepadamu.`,
  correction: `B>A|Saya perlu membalik arah sebelumnya: {B} meminta {A} mencari sumber.
C|Ralat nama penerimanya, saya ingin penilaian langsung dari {C}.`,
  role: `A|Cari sumber data asli yang digunakan publikasi ini.
C|Verifikasi apakah kesimpulan cocok dengan hasil hitung yang diberikan.`,
  agent_request: `B|{B}, tolong buatkan versi ramah pembaca dari catatan yang saya kirim.
C>A|{C}, mintalah {A} melengkapi referensi sebelum kamu menilai klaimnya.`,
  control: `C|Sebelum melanjutkan tanggung jawabmu, jelaskan bagaimana menghentikannya.
C|Berhenti pada tahap pemeriksaan yang sedang kamu kerjakan sekarang.`,
  attachment: `A|{A}, telusuri sumber asli yang dikutip berkas terlampir.
B>C|{B}, minta review {C} atas ringkasan file yang akan kamu tulis.`,
  noisy_history: `C>A|{C}, untuk pekerjaan baru ini minta sumber dari {A}.
B|{B}, saya ingin jawabanmu tentang cara menulis pengumuman yang berbeda.`,
  indirect: `C|Saya menghargai jika {C} mau memberikan penilaian independennya.
A>B|Would {A} mind asking {B} to write a short introduction?`,
};
