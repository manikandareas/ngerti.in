# Corpus editorial Course v1

Sumber dan konten di sini dibuat khusus sebagai **materi sintetis**, bukan salinan konten pengguna atau keluaran prototipe. Kasus diskon, pengendali tangki, luas segitiga, laporan bug, energi/biaya listrik, dan sumber tidak memadai mewakili bentuk kebutuhan belajar berbeda.

`cases.json` berisi 30 skenario dengan fingerprint file sumber, perubahan yang disengaja, label struktur/outcome, hasil review editorial dan alasan temuan. `answer-cases.json` berisi sembilan kasus alias unit, case-sensitive symbols, toleransi, jawaban panjang dan input eksponen ekstrem. Label disusun dan diperiksa secara editorial oleh Codex. **Belum dikalibrasi guru independen atau diuji terhadap hasil belajar siswa.**

```sh
make content-inspect
uv run --project apps/backend python -m ngertiin.content show shallow-but-schema-valid
uv run --project apps/backend python -m ngertiin.content inspect --output .dev/content-inspection.json
```

Command memanggil validator dan policy yang sama dengan yang akan dipakai worker. Review pada corpus adalah label yang diberikan, bukan penilaian AI baru. Ia menunjukkan bahwa struktur dapat lolos sementara label semantiknya menuntut repair; suggestion/resolved tidak memblokir; review kedaluwarsa ditahan; Lesson pertama dapat siap tanpa Practice.

`refresh_snapshot` hanya operasi authoring fixture setelah perubahan sengaja pada draft. Production tidak boleh memperbarui fingerprint Practice otomatis untuk mengakali stale snapshot. Jika file dasar berubah, inspeksi menolak hash lama: periksa lagi seluruh label sebelum memperbarui fingerprint.

Pemeriksaan schema mengekspor hasil aktual adapter LangChain, termasuk semua lima format melalui fixed typed slots. Runtime discriminated union tetap terpisah. [Standar](../../engineering/course-content-standard.md), [bukti penerimaan](../../engineering/content-03-manual-acceptance.md), [desain worker](../../engineering/course-generation-design.md).
