# Ngertiin V1

Asisten personal umum untuk percakapan, pekerjaan background, file/hasil, kode/browser, jadwal, memory dan goals. [Spesifikasi aktif](docs/README.md) dan [backlog](docs/backlog/README.md) membedakan target V1 dari kemampuan yang sudah diterima.

Fondasi saat ini: Clerk/ownership, main/side chat, streaming SSE/replay, LangGraph checkpoints, Procrastinate, S3/MinIO dan ledger chat. [Task background](docs/engineering/task-33-acceptance.md), [file/hasil persisten](docs/engineering/files-34-acceptance.md), serta [komputasi Python](docs/engineering/sandbox-35-acceptance.md) menyediakan review/revisi, stop/retry dan delivery sambil chat tetap digunakan. [Interface runtime](docs/engineering/sandbox-runtime.md) memakai E2B untuk browser/VNC/takeover dan Python offline; [migrasi E2B](docs/engineering/e2b-migration-2026-10-20.md) mencatat konfigurasi dan bukti penggantian Daytona. Course/Lesson/Practice tidak menjadi dependency aktif V1.

## Development

Prasyarat: Bun, uv, Docker/OrbStack. Isi `.env` dari `.env.example`, lalu:

```sh
make install
make infra-up
make setup
make dev
```

UI: http://localhost:3000 · API: http://127.0.0.1:8000. PostgreSQL/MinIO berada pada Compose `ngertiin-v1`; web/API/worker berjalan pada host. [Panduan operasi](docs/engineering/development.md) menjelaskan setup, readiness, diagnosis dan acceptance.

```sh
make check
make build
make quota-inspect
make task-inspect
make files-inspect
make sandbox-inspect
make memory-inspect
make docs-check
```

`make setup` / `make migrate` menjalankan migration head saat ini, termasuk `0008_personal_memory`, tanpa reset data yang sudah ada. Restart worker setelah perubahan Python atau konfigurasi runtime. [Memory runtime](docs/engineering/memory-runtime.md) memakai Mem0 OSS di backend dan PostgreSQL/pgvector yang ada; [penerimaan memory](docs/engineering/memory-17-acceptance.md) mencatat recall, sumber dan kontrol pengguna.

`make reset-dev` **menghapus seluruh data development lokal proyek**, lalu menjalankan baseline `0001_v1_baseline`, setup resmi queue/checkpoints dan bucket. Hentikan API/worker terlebih dahulu. Script memverifikasi environment, endpoint, project serta volume labels. Clerk, kredensial dan resource remote dipertahankan. Reset ini mengganti migrasi development lama; bukan jalur upgrade production.

[Bukti penerimaan baseline](docs/engineering/baseline-v1-acceptance.md) mencatat verifikasi baru. Bukti #01–05 serta Pen lama adalah riwayat, bukan bukti seluruh V1 sudah selesai. Keputusan/status Notion disalin melalui readback ke [manifest](docs/notion-manifest.json).
