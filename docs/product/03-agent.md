# 03 · Agent

Sumber: [Notion](https://app.notion.com/p/3f8abdd6187381658b61f4283ee83428)

<!-- notion-content:start -->
## Visi agent dan batas v1

Visi jangka panjang adalah agent belajar personal yang proaktif dengan pola kerja yang terinspirasi Muse AI, Grok Bot, Hermes Agent, dan OpenClaw: memahami tujuan, menjaga konteks, mengambil inisiatif yang relevan, dan melanjutkan pekerjaan di background dengan kontrol pengguna. Arah produk dijelaskan pada [01 · Produk & Paket](01-produk-dan-paket.md).

Spesifikasi di halaman ini menetapkan fondasi dan kemampuan v1 sesuai backlog. Proaktivitas v1 dibatasi pada konteks belajar, tools domain, budget, timing, dan approval yang dijelaskan di bawah. Kesetaraan keluasan kemampuan dengan produk referensi bukan kriteria kelulusan v1; kemampuan lebih luas dikembangkan bertahap setelah fondasi ini terbukti.

## Satu agent, soul dan memory berbeda tanggung jawab

```mermaid
flowchart LR
  A["Agent personal"] --> B["Soul: karakter dan gaya"]
  A --> C["Memory: profil dan pengamatan"]
  A --> D["Thread: konteks percakapan"]
  E["Domain belajar"] --> F["Nilai, progress, reward, streak"]
  F --> C

```

Soul dan memory berlaku lintas thread milik pengguna. Fakta belajar tetap dimiliki domain aplikasi. Catatan berarti history, event, progress dan percakapan penting.

## Percakapan dan tools dinamis

Percakapan memakai LangChain `create_agent` dengan runtime LangGraph. Model menentukan kapan menjawab, mencari konteks, atau memanggil tool berikutnya berdasarkan hasil yang diperoleh. Percakapan dapat berjalan tanpa tool; urutan pemanggilan tool tidak ditentukan per topik.

```mermaid
flowchart TD
  A["Pesan dan konteks pengguna"] --> B["Model menentukan langkah"]
  B -->|Cukup| C["Respons pengguna"]
  B -->|Perlu tool| D["Pilih tool dan argumen"]
  D --> E{"Perlu approval?"}
  E -->|Tidak| F["Eksekusi dengan validasi backend"]
  E -->|Ya| H["Proposal dan HITL"]
  H -->|Setujui| F
  H -->|Tolak| I["Feedback penolakan"]
  F --> J["Hasil tool menjadi konteks"]
  J --> B
  I --> B
```

Recall memory, membaca progress, dan pencarian sumber dapat berjalan otomatis dalam budget. Memory diperbarui melalui tool domain; perubahan soul dan Course mengikuti HITL. Tools tersedia sesuai konteks dan izin pengguna, dengan batas iterasi dan biaya.

Workflow yang panjang memakai execution ID tersendiri dan job background; chat menyimpan thread dan konteksnya sendiri. Proposal tertunda tidak menahan worker atau mengunci seluruh agent personal. Backend tetap memiliki approval, revision, kuota, dan otorisasi.

## Soul: pasif dengan HITL

```mermaid
flowchart TD
  A["Pengguna meminta perubahan"] --> B["Agent mengusulkan edit soul.md"]
  B --> C{"Review HITL"}
  C -->|Setujui| D["Validasi pemilik dan revisi"]
  D --> E["Simpan soul baru"]
  C -->|Tolak| F["Soul tetap"]

```

Soul memakai Markdown dan revisi tersimpan di PostgreSQL. Backend menerapkan tepat isi yang disetujui. Memory atau job proaktif tidak mengubah soul; usulan persona yang ditolak tidak menjadi instruksi memory.

## Memory: aktif dan berbukti

```mermaid
flowchart TD
  A["Percakapan dan event tersimpan"] --> B["Pilih fakta atau pengamatan relevan"]
  B --> C["Validasi bukti, scope dan duplikat"]
  C --> D["Simpan atau supersede memory"]
  D --> E["Recall sesuai topik dan Course"]
  E --> F["Interaksi berikutnya"]
  D --> G["Kandidat proaktivitas"]

```

Simpan profil ringkas, pengamatan belajar dengan evidence, serta history terpisah. Ambil konteks sesuai kebutuhan. Koreksi dan forgetting pengguna harus bertahan terhadap pengambilan ulang dari sumber yang sama. Detail UI dan budget memory berada pada tiket terkait.

## Proaktivitas dinamis per thread

```mermaid
flowchart TD
  A["Pembahasan terbaru, informasi baru, goal, event belajar"] --> B["Kandidat dengan evidence dan thread asal"]
  B --> C["Filter duplikasi, mute dan saran yang sudah ditangani"]
  C --> D["Rerank: relevansi, manfaat, kebaruan, urgensi"]
  D --> E{"Ada kandidat bernilai?"}
  E -->|Ya| F["Pilih kandidat"]
  E -->|Tidak| G["Fallback pembahasan terakhir pengguna"]
  F --> H{"Timing, mute, dedup dan budget mengizinkan?"}
  G --> H
  H -->|Belum| I["Tunda dan evaluasi ulang"]
  I --> D
  H -->|Ya| J["Compose sesuai soul, satu CTA utama"]
  J --> K["Assistant message di thread terkait"]
  K --> L["Respons pengguna memperbarui seleksi"]

```

- Maksimum **dua pesan proaktif per hari per pengguna, total lintas thread**.
- Quiet hours **21.00–07.00**; tidak mengirim saat pengguna fokus.
- Follow-up side chat masuk ke side chat itu; konteks Course masuk ke thread terkait. Pengingat umum dapat memakai main chat.
- Fallback memakai pembahasan terakhir pengguna dan tetap tunduk pada timing, mute, serta pencegahan pengulangan.
- Kandidat tidak dibroadcast ke beberapa thread. Informasi baru memiliki sumber yang dapat diperiksa.
- Pesan memiliki badge dan mute. Aktivitas atau perubahan Course ditawarkan melalui HITL.

Pemicu belajar tetap mencakup streak terancam, node selesai, dua hari absen, H-7 ujian jika jadwal diketahui, dan kondisi mentok. Timezone, focus detection, cooldown, ranking, serta jadwal evaluasi diselesaikan pada tiket proaktivitas.
<!-- notion-content:end -->
