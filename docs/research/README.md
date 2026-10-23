# Riset dan bukti

Keputusan pivot aktif berada di [Ngertiin Multi Agent di Notion](https://app.notion.com/p/402abdd6187381e3a720f4b01d824e1a) dan [backlog NMA](https://app.notion.com/p/116e1edcee864b5da91887466d728aac). [Produk & Scope V1](../product/01-produk-dan-paket.md), [spesifikasi runtime V1](../product/04-arsitektur-dan-delivery.md) dan [backlog V1](../backlog/README.md) tetap menjadi konteks historis. Riset di sini mendukung keputusan dan menyimpan batas verifikasi; bukan sumber roadmap paralel.

- [NMA-001 · Audit runtime Hermes dan provenance](nma-001-hermes-runtime-audit.md): setup terulang, dua profile dan hosted room dengan model nyata, restart/dedup, hasil test upstream, inventaris dependency/lisensi, dan gap runtime untuk ADR.
- [NMA-003 · Repository reuse and engine boundary audit](nma-003-repository-reuse-audit.md): source-backed reuse/replace/retire matrix, data preservation, coupling evidence and proposed engine location; no runtime or data changes.
- [NMA-004 · Engine integration and proactivity ADRs](nma-004-engine-integration-adrs.md): single Hermes service authority, conversational capture, canonical routing, durable triggers, design traces and explicit production gates.
- [NMA-005 · Domain, persistence and API contract](nma-005-domain-contract.md): ADR-03, owner-scoped entities, privacy, generations, storage boundaries, command/event examples and additive migration plan.
- [NMA-006 · Isolated runtime adapter](nma-006-runtime-adapter.md): separately packaged Hermes authority adapter, real-runtime contracts, partition bootstrap, provenance and explicit production gates.
- [Foundation packaging closure](nma-006-packaging-closure.md): pinned deployment profile, versioned notices, separate runtime/test dependencies, and macOS/Linux acceptance.

- [Agent identity and capability closure](nma-007-008-closure.md): persisted DM/group identity consumers, MCP metadata credential rejection, and current runtime/browser acceptance.
- [NMA-008 · Per-agent capability assignment](nma-008-capability-assignment.md): native tools, session-scoped MCP, skill snapshots, credential redaction, queued revocation and browser evidence; dependency gates remain open.

- [Bukti Riset & REA per modul](muse-ai-v1/README.md): chat/session, task/scheduler, file/artifact, memory/goals, permissions dan browser/computer.
- [Mesin privat: Daytona, VNC dan takeover](agent-private-machine-options-2026-10-18.md): snapshot dokumen vendor sebelum trial NG-031.
- [Alternatif provider browser privat](browser-provider-alternatives-2026-10-20.md): perbandingan E2B Desktop, Hopx, Kernel dan Browserbase berdasarkan kredit/trial, internet, viewer dan profil lintas Task; rekomendasi PoC, belum acceptance runtime.
- [NG-031 · Research dan rancangan trial Daytona](daytona-trial-31-2026-10-18.md): snapshot riset sebelum trial. [Hasil penerimaan](../engineering/daytona-31-acceptance.md) mencatat implementasi dan bukti live berikut batasnya.
- [Soul dan memory](agent-soul-memory.md), [framework agent](agent-framework-selection.md), [stack proaktif](proactive-agent-frameworks-2026-10-14.md).
- [Algoritma memory agent: hybrid, temporal graph, dan evaluasi](agent-memory-algorithms-2026-10-19.md): perbandingan sumber primer dan usulan PoC untuk NG-017; belum menjadi keputusan implementasi atau hasil benchmark lokal.
- [Evaluasi Mem0 untuk NG-017](mem0-evaluation-2026-10-19.md): audit SDK stabil, kecocokan pgvector, dan batas koreksi/forget sebelum keputusan integrasi; bukan hasil benchmark lokal.
- [Rencana memory dengan Mem0 OSS](memory-mem0-plan-2026-10-19.md): keputusan memakai library, pembagian tanggung jawab dan urutan delivery NG-017/018; implementasi belum dimulai.
- [Chat streaming/tools/recovery](chat-04-streaming-research-2026-10-16.md).
- [Audit lingkungan REA](rea-environment-audit-2026-10-18.md) dan [penilaian awal Muse](muse-reverse-engineering-assessment-2026-10-18.md): catatan sesuai tanggalnya.

[Model bisnis lama](business-model-2026-10-13.md), [engine Course](course-generation-engine-2026-10-15.md), [brainstorm belajar](archive/user-flow-brainstorm-2026-10-13.md), serta [blueprint](archive/muse-pre-reset/04-blueprint-ngertiin.md)/[roadmap sebelum reset](archive/muse-pre-reset/05-roadmap-dan-acceptance.md) adalah arsip. Harga, batas, instruksi mempertahankan kode pembelajaran, serta urutan A0–A10 tidak berlaku sebagai scope aktif V1. Observasi dan hash tetap dapat ditelusuri.
