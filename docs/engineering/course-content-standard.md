> Catatan historis sebelum reset V1 asisten umum pada 18 Oktober 2026. Kontrak/command pembelajaran, migration head dan hasil acceptance lama di bawah tidak menjadi persyaratan aktif. Lihat [spesifikasi V1](../product/01-produk-dan-paket.md) dan [baseline baru](baseline-v1-acceptance.md).

# Standar konten Course v1

Deliverable [backlog #003](../backlog/tasks/03-port-standar-lesson-dan-soal-dari-prototipe.md). Implementasi berada di `apps/backend/src/ngertiin/content/`. Modul ini murni: tidak membuka database, memanggil provider, menjalankan queue, atau menentukan progress pengguna.

## Dasar dan audit

Standar baru diturunkan dari [riset pengajaran dan engine](../research/course-generation-engine-2026-10-15.md), keputusan produk, dan audit kontrak prototipe. Tidak ada kode generation prototipe yang disalin. Panduan soal yang diberikan sebelumnya merupakan kebijakan editorial, bukan publikasi ilmiah yang telah diverifikasi.

| Sumber audit di ../ngerti.in | Keputusan untuk proyek baru |
| --- | --- |
| `docs/engineering/journey-generation-v5.md`, `packages/shared/src/journey-generation.ts` | Pertahankan intent kemampuan teramati, evidence, kontribusi berbeda, dan pemeriksaan paket soal. Bentuk Python baru memakai standard_version=1; tidak membawa nomor pipeline/player lama atau pembaca legacy. |
| `docs/research/journey-v5/README.md`, `standar-penulisan-soal-per-tipe.json`, `journey-editorial.ts` policy 2 | Adopsi lima interaksi dan aturan editorial yang relevan. Rentang jumlah adalah kebijakan produk yang diberi versi. |
| `docs/engineering/journey-v5-audit.md` | Bedakan defect, suggestion, resolved; verifikasi kutipan; jangan menyamakan preferensi redaksi dengan kesalahan material. |
| `definitive-answer.ts` dan evaluator jawaban | Tetapkan key definitif dengan alias unit eksplisit dan toleransi absolut; jangan menolak jawaban panjang hanya karena panjangnya. Formula skor/mastery tetap #012. |
| `docs/engineering/journey-v5-benchmark-evidence.md` | Pertahankan perbedaan antara struktur lolos, review otomatis, review manusia, hasil belajar, dan benchmark waktu/biaya. |

## Kontrak dan pemilik data

| Modul | Tanggung jawab |
| --- | --- |
| `contracts.py` | Course/Node blueprint, criterion, evidence, Lesson draft, envelope revisi, snapshot Practice dan fingerprint kanonis. |
| `questions.py` | Lima bentuk soal, key privat, dan proyeksi publik berbasis allowlist. |
| `answer_keys.py` | Validasi key definitif dan shortcut penerimaan exact/numerik. |
| `validation.py` | Pemeriksaan struktur, referensi, dependency, slot, dan snapshot. |
| `provider_schema.py` | Compile slot soal dengan tipe/ID yang dikunci host, lalu ekspor schema melalui adapter LangChain terpasang. |
| `review.py` | Instruksi review v1, input terikat hash, temuan/coverage, dan keputusan repair/hold. |
| `handoff.py` | Work envelope, receipt publikasi dari host, readiness dan proyeksi konten terbit. |
| `__main__.py` | Inspeksi corpus dan ekspor schema secara manual oleh operator. |

Course blueprint mempertahankan tujuan asli, revisi outline, dan prerequisite node. Node blueprint memuat kemampuan akhir, scope, prasyarat, criterion ID, alasan jumlah Lesson, shared context, kontribusi setiap Lesson, evidence ID, dependency Lesson sebelumnya, serta intent/format/demand setiap soal.

Backend #008/#009 memiliki ID, ownership, revision envelope, dan hash. Model menulis draft. Evidence menyertakan source ID, revisi, lokasi dan kutipan. Domain ingestion #006 harus memvalidasi otorisasi dan bahwa kutipan benar-benar berasal dari sumber; keberadaan ID saja tidak membuktikan grounding. NodePacket adalah input internal, bukan response API.

## Kebijakan editorial v1

- Node berisi 2–6 Lesson saling melengkapi, kemudian 4–6 soal dengan minimal tiga format dan maksimal satu true/false.
- Setiap criterion dipetakan pada pengajaran dan asesmen. Paket mencakup relationship serta application. ID mapping bukan bukti bahwa isi benar-benar mengajarkan/menilai kemampuan tersebut.
- Lesson Markdown mengajarkan kontribusi yang utuh; kualitas dinilai melalui penjelasan, contoh, kondisi, dan miskonsepsi yang diperlukan, bukan minimum kata. Contoh tidak wajib diulang di setiap Lesson.
- Jumlah node mengikuti tujuan. Billing tidak memangkas scope/aktivitas. Bila tiga format tidak feasible, #008 merevisi subskill atau batas node sebelum approval; jangan menambahkan filler.
- V1 ini text-first: tidak menerima raw HTML atau gambar Markdown yang belum diregistrasikan. Matematika/code dapat ditulis dalam Markdown. Integrasi asset/visual wajib kemudian harus memperluas kontrak secara eksplisit dan memeriksa readiness asset sebelum publish.

| Format | Struktur/key | Pemeriksaan semantik |
| --- | --- | --- |
| Multiple choice | 3–5 opsi unik, satu ID key, alasan privat per distractor. Larangan meta all/none tidak melarang jawaban domain seperti tidak ada solusi. | Satu jawaban terbaik; pengecoh masuk akal, tidak tumpang tindih atau membocorkan key. |
| True/false | Satu pernyataan ≤25 kata, boolean key dan penjelasan koreksi. | Satu klaim berkonteks, tidak majemuk atau ambigu. |
| Short answer | Satu canonical target dan variasi eksplisit ≤10 kata per target; optional numeric value/unit/tolerance memakai null. | Satu target definitif; variasi setara, bukan esai atau beberapa subjawaban tersembunyi. |
| Ordering | 4–6 item, key merupakan permutasi lengkap, tampilan diacak. | Kriteria/dependency menghasilkan satu urutan yang sah; code tidak membuktikan keunikan semantik. |
| Word bank | Satu `{{blank}}` per slot, 2–3 pengecoh, key bijektif terhadap blank, token terpilih maksimal sekali. | Tepat satu kecocokan makna per blank; sinonim dan grammar-only clues diperiksa. |

`match_definitive_answer` hanya mengembalikan True atau None. None berarti perlu evaluasi ekuivalensi pada #012, bukan jawaban salah. Normalisasi unit tidak mengonversi besaran dan menjaga mW/MW berbeda. Bare numeric hanya diterima bila eksplisit terdapat pada accepted_variants. Nilai ekstrem yang tidak didukung kembali ke None tanpa operasi Decimal yang tak terbatas. Panjang jawaban pengguna tidak menjadi alasan penolakan.

## Schema provider

Schema authoring terpisah dari runtime reader. `practice_output_model` menghasilkan `question_1` dan seterusnya dengan type serta ID yang dikunci per slot. `parse_practice_output` membentuk PracticeDraft setelah output tervalidasi; jumlah/diversity/criteria tetap diperiksa terhadap blueprint. Union diskriminatif runtime tidak diekspor sebagai provider oneOf.

Inspeksi memakai `convert_to_openai_function(..., strict=True)` dari LangChain terpasang, termasuk objects tertutup, semua field required, nullable eksplisit, deskripsi field, dan larangan composition yang tidak didukung. Envelope hash/revisi dibuat host agar model tidak mengarang metadata publikasi.

```sh
uv run --project apps/backend python -m ngertiin.content schemas --output .dev/content-schemas
```

## Review dan repair

`review_input` menyusun konteks original evidence + blueprint + artifact yang relevan. Review Lesson hanya meminta criterion milik target dan tidak mengisi question_ids dari rencana soal. Review Practice meminta cakupan seluruh node terhadap versi Lesson final. Input hash mencakup instruksi, konteks, scope dan target.

`decide_review(packet, request, review, repair_round=...)` memvalidasi host request, versi input, coverage, referensi, kutipan dan struktur. Model tidak mempunyai field approval yang langsung dieksekusi. Kutipan temuan harus hadir pada input aktual; ini tetap tidak membuktikan klaim semantik reviewer benar.

| Outcome | Arti |
| --- | --- |
| ready | Struktur/review contract sah, sumber dinilai memadai, tanpa defect material aktif. Host masih harus memeriksa ownership/revisi dan melakukan transaksi publikasi. |
| repair | Defect aktif terlokasi dan budget tersedia; rewrite hanya target, dengan dependency Lesson yang terdampak. |
| needs_context | Pengetahuan esensial untuk tujuan tidak tersedia; missing_evidence menyatakan kekurangannya. |
| hold | Kontrak/input tidak sah/kedaluwarsa atau defect masih ada setelah dua repair; bagian siap dipertahankan. |

Satu hasil awal + maksimal dua repair per artifact/run. Counter dimiliki host dan dibagi lintas worker, bukan di-reset tiap job. Retry transport terpisah. Worker #009 harus memeriksa errors struktural sebelum memanggil reviewer; hasil hold akibat struktur memerlukan koreksi output/kontrak sebelum review diulang.

Repair pengajaran menyertakan Lesson dependennya dan meminta review kembali soal lama. Perubahan Lesson tidak otomatis meregenerasi semua soal. Assessment gap memperbaiki paket soal sambil mempertahankan Lesson valid. Temuan suggestion/resolved tidak memicu repair. Koreksi pada Lesson terbit membuat revisi baru dengan penanganan pembaca, bukan write in-place.

## Publikasi bertahap

Receipt berisi ID, revision dan fingerprint konten yang telah diterbitkan host. `node_readiness` hanya mengakui receipt yang cocok dengan artifact dan prerequisite-nya. Practice memerlukan seluruh snapshot Lesson yang tepat. Proyeksi publik terikat packet_hash sehingga readiness dari packet lama tidak dapat dipakai untuk menampilkan packet baru.

`lesson_ready_ids`, `practice_ready`, dan `node_content_ready` adalah readiness konten. Penyelesaian belajar `node_completed`, attempt, skor/mastery, reward dan unlock dimiliki domain #012. Fungsi proyeksi adalah fungsi internal; API #011 tetap wajib menjalankan otorisasi, membaca receipt tersimpan, dan menghitung readiness server-side. Jangan menerima readiness/receipt buatan browser atau model.

## Fixture dan verifikasi

Corpus historis (fixture dihapus pada reset; tersedia melalui riwayat Git) menyertakan enam sumber sintetis dan label editorial, termasuk struktur lolos tetapi semantik gagal. Operator menjalankan `make content-inspect`; output tidak mengklaim reviewer AI atau siswa pasti menghasilkan label yang sama. [Bukti penerimaan](content-03-manual-acceptance.md) mencatat pemeriksaan lokal/provider dan batasnya. Tidak ada suite unit/integration/E2E baru atau pemanggilan provider di CI.
