# NG-020 · Delivery proaktif per thread dan batas global

Sumber: [Notion](https://app.notion.com/p/3f8abdd618738137a8c9c719f5b64bc4) · Readback: 2026-10-19T09:02:27.281Z

| Property | Value |
| --- | --- |
| Ticket | 20 |
| Urutan | 18 |
| Lingkup | Aktif V1 |
| Status | Done |
| Prioritas | P0 |
| Area | Agent |
| Depends on | [NG-019 · Kandidat proaktif dinamis dan reranking](19-kandidat-proaktif-dinamis-dan-reranking.md) · [NG-037 · Scheduler pengguna saat offline](37-scheduler-pengguna-saat-offline.md) |

<!-- notion-content:start -->
Tujuan: Delivery proaktif per thread dan batas global.

Lingkup: **Aktif V1**. Identitas NG-020; Urutan delivery 18.

## Acceptance criteria

- [x] Global daily cap atomik per account, quiet hours, mute/snooze dan dedup lintas thread diterapkan lagi saat delivery.
- [x] Satu kandidat menuju thread yang relevan; bukan broadcast; race dua worker tidak melampaui cap.
- [x] Hasil yang memang dijadwalkan tetap tercatat dan mempunyai kebijakan delivery terpisah dari inisiatif proaktif; P21/P22/P23.

## Spesifikasi dan bukti

[03 · Perilaku Agent](../../product/03-agent.md) · [REA-2 · Task & Scheduler](../../research/muse-ai-v1/evidence/task.md)

## Dependencies

[NG-019 · Kandidat proaktif dinamis dan reranking](19-kandidat-proaktif-dinamis-dan-reranking.md) · [NG-037 · Scheduler pengguna saat offline](37-scheduler-pengguna-saat-offline.md)

## Bukti penerimaan

[NG-030 · Bukti penerimaan baseline V1](../../engineering/baseline-v1-acceptance.md). Bukti repo: docs/engineering/evidence/baseline-v1/. Status mengikuti hasil pemeriksaan baru; tidak mengandalkan penerimaan #01–05.

## Implementasi dan penerimaan NG-020

NG-020 diterima development pada 19 Oktober 2026. Setelah penjelasan onboarding, akun baru ditawari Normal; delivery memerlukan penyimpanan pilihan. Pratinjau NG-019 bukan consent produk, dan pilihan Nonaktif dipertahankan. Chat dapat membaca dan mengubah intensitas akun/thread/Goal serta jeda dari instruksi langsung pengguna saat ini; kontrol UI memakai state/revision/receipt yang sama. Kontrol tidak mengubah Soul, memory, Task, jadwal atau grant eksternal.

Kandidat informatif boleh tanpa action/pertanyaan; needs_input harus memuat pertanyaan spesifik. Sebelum pengiriman, backend memeriksa sumber/revision/hash, watermark konteks, target thread, preferensi terbaru, quiet hours IANA, scope/jeda, minimum semantik, dedup lintas thread dan cap gabungan. Pesan mandiri, event, receipt dan pemakaian cap ditulis atomik; retry/race tidak menggandakan pesan. Navigasi menunjukkan unread; pesan menampilkan waktu dan alasan relevansi. Lineage yang dicabut tidak direhidrasi ke konteks model.

Kebijakan awal Ngertiin, bukan angka Muse: ceiling per 24 jam berjalan Lebih tenang/Normal/Lebih aktif adalah 1/3/6 pesan dengan jarak minimum 12/4/1 jam. Override scope tidak menaikkan cap total akun. Jam tenang awal 22.00–08.00 mengikuti timezone yang ditinjau; intensitas bukan target cadence. Hasil Task/Jadwal yang memang diminta tetap tersimpan melalui jalur delivery tersendiri dan tidak diduplikasi sebagai pesan proaktif.

Bukti NG-020: 105 kontrak PostgreSQL disposable, regresi Scheduler82/Task55/Memory62/Goals74/File47/quota46, check/build serta browser Clerk desktop1440/mobile320. Chat nyata mengurangi saran thread dan mematikan saran global. Fixture positif terkontrol dikirim satu kali oleh worker saat browser about:blank pukul 16.58 WITA; pesan informatif tetap terbaca setelah kembali. Dua evaluasi provider nyata memilih no-op; kualitas seleksi positif belum dibuktikan oleh fixture delivery terkontrol. Kalibrasi luas tetap NG-041. Bukti repo: `docs/engineering/proactivity-delivery-runtime.md`, `docs/engineering/proactivity-20-acceptance.md`, `docs/engineering/evidence/proactivity-20/`. Audit diakhiri dengan proaktivitas nonaktif dan Goal fixture diarsipkan.
<!-- notion-content:end -->
