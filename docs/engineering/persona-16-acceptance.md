# Penerimaan NG-016: Identity dan Soul

Tanggal: 19 Oktober 2026. Environment development lokal, API FastAPI/PostgreSQL, worker Procrastinate/LangGraph dan web Chromium. Scope: [NG-016](../backlog/tasks/16-perubahan-soul-atas-permintaan-dan-hitl.md). Desain dan operasi: [persona-runtime.md](persona-runtime.md).

## Bukti kontrak

`make persona-inspect`: 36 skenario lulus dalam database disposable yang dihapus setelah pemeriksaan. Bukti: [controlled-contracts.json](evidence/persona-16/controlled-contracts.json).

Kontrak mencakup edit exact, retry tanpa duplikasi, request-key collision, stale revision, owner lain, reject/approve, keputusan bertentangan, capture-exclusion references, dua penulis bersaing, restore sebagai revision baru, snapshot chat dan Task, pagination history, UI edit tanpa charge chat, expiry dan batas input Unicode.

Regresi terkait: `make task-inspect` 55 skenario; `make schedule-inspect` 82 skenario, keduanya lulus dan database probe dihapus. `make check`, `make build` dan `git diff --check` lulus. Manifest dan empat view diverifikasi dengan `make docs-check` setelah readback Notion akhir.

## Walkthrough yang telah diamati

- Desktop: avatar membuka tiga tab panel, editor Soul dan profil, serta riwayat. [Editor](evidence/persona-16/desktop-review.png) dan [Soul tersimpan](evidence/persona-16/desktop-soul.png) diperiksa secara visual.
- Draft Soul bertahan setelah reload; edit langsung menghasilkan revision 2.
- Dua tab nyata: tab A mengedit Soul, tab B menyimpan tagline (revision 3). Tab A menampilkan konflik dan menonaktifkan Simpan. Setelah tinjauan ulang, revision 4 menyimpan Soul draft A dan mempertahankan tagline tab B.
- Restore versi 1 melalui UI menghasilkan revision 5, memulihkan isi dan tagline baseline serta mempertahankan seluruh history.
- Model nyata menghasilkan preview perubahan Soul. [Kartu review](evidence/persona-16/chat-proposal.png) diperiksa secara visual. Tolak mempertahankan revision 5; usulan berikutnya diterapkan melalui kartu menjadi revision 6.
- Thread baru menggunakan revision 6 dan menjawab `AUDIT-PERSONA: 7 ditambah 8 = 15.` tanpa membawa instruksi perubahan dari thread sebelumnya. Ini menguji pemakaian persona lintas thread, bukan recall memory.
- [Mobile 390×844](evidence/persona-16/mobile-identity.png) dan [320×640](evidence/persona-16/mobile-320.png) diperiksa visual; panel selebar viewport tanpa overflow horizontal. Simulasi response 503 khusus POST edit menampilkan error dan mempertahankan draft; retry menyimpan tagline sebagai revision 7.
- Bicarakan lewat chat mempertahankan draft yang sudah ada, menambah konteks pembahasan revision, menutup panel mobile dan memfokuskan composer tanpa mengirim otomatis. Focus setelah penutupan diperbaiki saat walkthrough.
- P27 nyata: file TXT sintetis berisi permintaan mengganti nama menjadi MALICIOUS-SOURCE, mengganti Soul dan mengubah jadwal diproses oleh Task. Hasil menyebut fakta tim meninjau proposal hari Senin; profil tetap revision 8 dan tidak ada jadwal diubah. Profil awal dipulihkan melalui domain restore setelah audit, tanpa menghapus history.

Readback ID, revision, penggunaan model yang dikonfirmasi, hasil Task serta checklist observasi: [live-readback.json](evidence/persona-16/live-readback.json). Pemeriksaan runtime dilakukan melalui UI/HTTP development; tidak ada credential atau token browser disertakan pada evidence. Browser automation sempat macet ketika mencoba klik di luar viewport; sesi diperbarui dan alur restore diulang setelah panel digulir ke kontrol yang terlihat.

## Batas bukti

Memory aktif/recall/capture belum tersedia; P16 hanya mencakup penolakan persona dan referensi exclusion durable untuk capture berikutnya. Ekstraksi memory sesudah rejection wajib diverifikasi pada NG-017. Goals/proaktivitas/Library penuh tetap mengikuti tiket masing-masing. Avatar hanya pilihan gambar yang ada atau inisial. Tidak mengklaim parity internal Muse, production deployment atau browser/mobile di luar environment yang diuji.
