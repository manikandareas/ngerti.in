# Evaluasi Mem0 untuk memory Ngertiin

Tanggal: 19 Oktober 2026. Status: **audit source dan dokumentasi; belum dipasang atau diuji runtime**. Tidak mengubah kode produk atau Notion.

Keputusan setelah audit: pengguna memilih Mem0 OSS sebagai library. Pembagian tanggung jawab dan delivery ditetapkan pada [rencana integrasi Mem0](./memory-mem0-plan-2026-10-19.md); rekomendasi pembanding di bawah mencatat posisi audit sebelum keputusan tersebut.

## Rekomendasi

**Mem0 layak menjadi kandidat proof of concept NG-017**, terutama untuk mempercepat ekstraksi fakta, integrasi provider, dan retrieval melalui PostgreSQL. Namun, evidence/revisi, authorization, koreksi, suppression setelah forget, serta durable background capture tetap tanggung jawab aplikasi.

Bandingkan baseline PostgreSQL FTS + pgvector dengan Mem0 OSS yang dipin. Jika diperlukan, masukkan Hindsight sebagai pembanding ketiga. Angka benchmark managed platform tidak mewakili OSS: README menyatakan ada optimasi proprietary yang tidak tersedia di SDK. [README stabil](https://github.com/mem0ai/mem0/blob/94c3fe9f238f3dbf29c9ce98643bd71eb13077cd/README.md).

## Snapshot versi

- PyPI terbaru saat pemeriksaan: **`mem0ai==2.2.1`**, terbit 25 September 2026. [PyPI](https://pypi.org/project/mem0ai/2.2.1/)
- Tag `v2.2.1`: **`94c3fe9f238f3dbf29c9ce98643bd71eb13077cd`**. Semua tautan implementasi berikut memakai commit tersebut. [pyproject](https://github.com/mem0ai/mem0/blob/94c3fe9f238f3dbf29c9ce98643bd71eb13077cd/pyproject.toml)
- Default branch: `0724291bd864cf807e88ee8981c8226644e8fb42`, 14 Oktober 2026. Diff terhadap tag tidak mengubah core memory, prompts, PGVector, SQLite storage, telemetry, NLP, atau scoring yang diaudit; client hosted/proxy dan provider lain memiliki perubahan. [commit](https://github.com/mem0ai/mem0/commit/0724291bd864cf807e88ee8981c8226644e8fb42)

OSS berlisensi Apache-2.0 dan dapat berjalan sebagai library tanpa Mem0 Cloud. Nama migrasi **OSS v2→v3** tidak identik dengan nomor paket Python. [Lisensi](https://github.com/mem0ai/mem0/blob/94c3fe9f238f3dbf29c9ce98643bd71eb13077cd/LICENSE), [migration guide](https://docs.mem0.ai/migration/oss-v2-to-v3).

## Capture yang sebenarnya

`Memory.add(infer=True)`:

1. Membaca 10 pesan terakhir dari SQLite.
2. Embed pesan baru dan mengambil 10 memory terdekat menurut user/agent/run.
3. Memanggil LLM sekali dengan `ADDITIVE_EXTRACTION_PROMPT`.
4. Batch embedding, dedup hash teks, insert fakta baru, history, dan entity linking.

**Operasi otomatisnya ADD-only**, bukan `ADD/UPDATE/DELETE/NOOP` dari paper lama. Update/delete eksplisit berdasarkan ID masih tersedia. Docstring add masih menyebut update/delete; executable pipeline dan migration guide lebih tepat. [Pipeline](https://github.com/mem0ai/mem0/blob/94c3fe9f238f3dbf29c9ce98643bd71eb13077cd/mem0/memory/main.py#L918-L1098), [prompt](https://github.com/mem0ai/mem0/blob/94c3fe9f238f3dbf29c9ce98643bd71eb13077cd/mem0/configs/prompts.py#L468), [operasi eksplisit](https://github.com/mem0ai/mem0/blob/94c3fe9f238f3dbf29c9ce98643bd71eb13077cd/mem0/memory/main.py#L1829-L1902).

Implikasinya: “tinggal di Bandung” dan “sekarang pindah ke Bali” dapat tersimpan bersamaan. Aplikasi perlu menetapkan keadaan terkini, historical validity, dan koreksi. Ini inferensi desain, belum pengujian runtime.

Hash dedup diperiksa terhadap 10 kandidat tadi dan batch sekarang; bukan constraint global per owner/evidence. `infer=False` menulis langsung. Replay/concurrency membutuhkan idempotency aplikasi. Prompt mengekstrak user **dan assistant** messages; hasil rekomendasi assistant tidak otomatis menjadi fakta pengguna yang terkonfirmasi. Metadata tersedia, tetapi schema fact/preference/observation, evidence/revision/confidence/status tidak ditegakkan pipeline ini. [Dedup/payload](https://github.com/mem0ai/mem0/blob/94c3fe9f238f3dbf29c9ce98643bd71eb13077cd/mem0/memory/main.py#L1007-L1041), [raw add](https://github.com/mem0ai/mem0/blob/94c3fe9f238f3dbf29c9ce98643bd71eb13077cd/mem0/memory/main.py#L881-L916), [prompt attribution](https://github.com/mem0ai/mem0/blob/94c3fe9f238f3dbf29c9ce98643bd71eb13077cd/mem0/configs/prompts.py#L468).

## Recall, NLP, graph, dan waktu

Search mengambil semantic candidates sebanyak `max(top_k*4,60)`. Keyword/entity hanya menaikkan ranking kandidat semantic tersebut; tidak menambahkan kandidat yang luput. Semantic threshold diterapkan sebelum fusion. Ini berbeda dari union kandidat lexical+dense melalui RRF. [Search](https://github.com/mem0ai/mem0/blob/94c3fe9f238f3dbf29c9ce98643bd71eb13077cd/mem0/memory/main.py#L1642-L1745), [scoring](https://github.com/mem0ai/mem0/blob/94c3fe9f238f3dbf29c9ce98643bd71eb13077cd/mem0/utils/scoring.py#L57-L146).

PGVector keyword search memakai native PostgreSQL `ts_rank_cd`, **bukan BM25**, meskipun normalizer menyebut BM25. Kontribusi lexical perlu diukur per backend. [PG search](https://github.com/mem0ai/mem0/blob/94c3fe9f238f3dbf29c9ce98643bd71eb13077cd/mem0/vector_stores/pgvector.py#L369-L403).

NLP optional memakai English `en_core_web_sm` yang di-hardcode dan dapat diunduh otomatis saat pertama digunakan. Tanpa NLP, entity kosong dan lemma kembali ke teks asli; keyword PG tetap dapat berjalan. Kualitas Bahasa Indonesia/code-switching belum diukur. [Loader](https://github.com/mem0ai/mem0/blob/94c3fe9f238f3dbf29c9ce98643bd71eb13077cd/mem0/utils/spacy_models.py#L21-L90), [lemma fallback](https://github.com/mem0ai/mem0/blob/94c3fe9f238f3dbf29c9ce98643bd71eb13077cd/mem0/utils/lemmatization.py#L21-L54), [entity fallback](https://github.com/mem0ai/mem0/blob/94c3fe9f238f3dbf29c9ce98643bd71eb13077cd/mem0/utils/entity_extraction.py#L751-L774).

Graph memory telah **dihapus dari OSS** sekarang. Entity links untuk boosting bukan temporal knowledge graph. `timestamp` pada add dan `reference_date` pada search ditolak sebagai fitur platform. Expiry menyembunyikan search/get_all, tetapi get-by-ID masih mengembalikan record. [Migrasi](https://docs.mem0.ai/migration/oss-v2-to-v3), [add](https://github.com/mem0ai/mem0/blob/94c3fe9f238f3dbf29c9ce98643bd71eb13077cd/mem0/memory/main.py#L818-L825), [search](https://github.com/mem0ai/mem0/blob/94c3fe9f238f3dbf29c9ce98643bd71eb13077cd/mem0/memory/main.py#L1449), [get](https://github.com/mem0ai/mem0/blob/94c3fe9f238f3dbf29c9ce98643bd71eb13077cd/mem0/memory/main.py#L1222-L1267).

## Gap terhadap kontrak Ngertiin

| Area | Temuan dan pekerjaan aplikasi |
| --- | --- |
| Owner | Search/get_all memerlukan scope, tetapi get/update/delete/history menerima memory ID tanpa authenticated owner. Authorization tetap wajib di aplikasi. [ID operations](https://github.com/mem0ai/mem0/blob/94c3fe9f238f3dbf29c9ce98643bd71eb13077cd/mem0/memory/main.py#L1829-L1973) |
| Forget | Delete menghapus vector dan membersihkan entity links secara best-effort, tetapi menyimpan plaintext lama pada history DELETE. Last messages tetap tersimpan. [Delete](https://github.com/mem0ai/mem0/blob/94c3fe9f238f3dbf29c9ce98643bd71eb13077cd/mem0/memory/main.py#L2114-L2143), [messages](https://github.com/mem0ai/mem0/blob/94c3fe9f238f3dbf29c9ce98643bd71eb13077cd/mem0/memory/storage.py#L257-L322) |
| Retry/background | AsyncMemory memakai `asyncio.to_thread`, bukan durable queue. Vector, SQLite, dan entity state ditulis bertahap dengan fallback/partial success; aplikasi perlu Procrastinate, idempotency, dan rekonsiliasi. [Async](https://github.com/mem0ai/mem0/blob/94c3fe9f238f3dbf29c9ce98643bd71eb13077cd/mem0/memory/main.py#L2557-L2750), [persist](https://github.com/mem0ai/mem0/blob/94c3fe9f238f3dbf29c9ce98643bd71eb13077cd/mem0/memory/main.py#L1047-L1220) |

Delete tidak menambahkan suppression tombstone; capture tidak memeriksa larangan re-ingest. Maka **delete record bukan topic-forget yang tahan replay sumber lama**. Ini gap source, bukan klaim bahwa resurrection pasti terjadi; prompt memang melarang ekstraksi baru dari konteks pesan lama. [Capture](https://github.com/mem0ai/mem0/blob/94c3fe9f238f3dbf29c9ce98643bd71eb13077cd/mem0/memory/main.py#L918-L1041).

## Dampak operasional

- PGVector/psycopg dan connection pool tersedia; layanan graph tidak diperlukan. Tetapi memilih PG **tidak memindahkan history ke PG**: SQLiteManager tetap dibuat, default `~/.mem0/history.db`. Default vector provider adalah Qdrant, sehingga konfigurasi production harus eksplisit. [PGVector](https://github.com/mem0ai/mem0/blob/94c3fe9f238f3dbf29c9ce98643bd71eb13077cd/mem0/vector_stores/pgvector.py#L147-L329), [constructor](https://github.com/mem0ai/mem0/blob/94c3fe9f238f3dbf29c9ce98643bd71eb13077cd/mem0/memory/main.py#L488-L502), [history path](https://github.com/mem0ai/mem0/blob/94c3fe9f238f3dbf29c9ce98643bd71eb13077cd/mem0/configs/base.py#L11-L45), [default vector](https://github.com/mem0ai/mem0/blob/94c3fe9f238f3dbf29c9ce98643bd71eb13077cd/mem0/vector_stores/configs.py#L6-L12).
- Telemetry PostHog aktif default; set `MEM0_TELEMETRY=false` sebelum import bila tidak dikehendaki. Jalur yang diperiksa berisi metadata operasi/runtime, bukan bukti pengiriman teks percakapan oleh telemetry. [Telemetry](https://github.com/mem0ai/mem0/blob/94c3fe9f238f3dbf29c9ce98643bd71eb13077cd/mem0/memory/telemetry.py#L14-L118).
- Hindari install semua extras: `[extras]` mematok LangChain `<1.0.0`; cocokkan resolver dengan LangChain 1.x Ngertiin. [Dependencies](https://github.com/mem0ai/mem0/blob/94c3fe9f238f3dbf29c9ce98643bd71eb13077cd/pyproject.toml#L15-L109).

## Gerbang keputusan

Uji Indonesia/English, nama/kode/parafrasa/negasi, koreksi versus perubahan nyata, historical/current recall, forget→replay, cross-owner ID access, duplicate/concurrent capture, dan partial failure. Samakan chronological corpus, evidence, model, budget; ukur grounding, recall@K, p50/p95, biaya, serta usaha adapter.

Adopsi bila kualitas dan kecepatan delivery lebih baik setelah seluruh kontrak bisnis dipenuhi. Audit ini tidak menginstal paket, menjalankan benchmark/fault tests, atau memverifikasi wheel bit-for-bit terhadap tag. [Riset algoritma lebih luas](./agent-memory-algorithms-2026-10-19.md).
