# NMA-071 focused completion scope — 2026-11-09

The owner instructed: “lanjutkan complete NMA-071. mulai dari paritas ui menyeluruh, journey native lengkap” and “jangan lakukan testing yang berlebihan, performa tidak mesti 1:1, karena kita native harusnya jauh lebih baik untuk performa”.

This continuation prioritizes implementation parity and complete useful native journeys. It audits all eight assistant-studio categories and their 67 named states against the native production paths, fixes missing behavior/presentation, and checks representative real-window journeys against the product API. Critical submission, scope, recovery, selection and cancellation invariants remain required. Earlier retained native/API evidence is reused when its behavior and source are unchanged; focused checks cover the deltas.

To honor the instruction against excessive testing, the execution uses a representative coverage register rather than requiring all 3,684 Cartesian screenshot configurations before closure. The original frozen manifest and unexecuted counts remain historical evidence; representative checks are not relabeled as completed exhaustive runs. Theme/minimum-window behavior is checked where a changed component can fail, without repeating every unchanged component across every environment combination.

Matching Tauri's performance 1:1 and the exhaustive paired performance workload are no longer closure prerequisites. Native implementation alone is not evidence of superior performance. Retain measured results, check for material stalls, runaway redraws and unusable long-content behavior during the journeys, and report comparative performance as unmeasured unless actually measured.

Muse API-key execution remains the previously approved separate follow-up. Signing, installers, fresh-device distribution, Windows/Linux, physical mobile delivery, product-wide NMA-063 acceptance and replacing Tauri remain separate. Native rendering ownership, authoritative API state, private scope, explicit billing selection and preservation of unrelated data are unchanged.

The final report must distinguish source-audited states, native interaction outcomes, provider execution, retained earlier proof and unexecuted conditions. A smaller verification cohort does not authorize hiding a known material UI or functional gap.
