"""Read-only verification of retained delegation/collaboration evidence.

Never starts a gateway, calls a provider, repeats a tool action or updates Notion.
"""

import hashlib
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
EVIDENCE = ROOT / "docs/research/evidence/nma-035"


def main():
    manifest = json.loads((EVIDENCE / "verification.json").read_text())
    for relative, expected in manifest["files"].items():
        path = (ROOT / relative).resolve()
        if not path.is_relative_to(ROOT) or not path.is_file():
            raise ValueError("Missing or out-of-workspace evidence: " + relative)
        if hashlib.sha256(path.read_bytes()).hexdigest() != expected:
            raise ValueError("Evidence hash mismatch: " + relative)
    live = json.loads((EVIDENCE / manifest["live_result"]).read_text())
    assert live["denominator"] == 3 and len(live["cases"]) == 3
    assert all(case["passed"] for case in live["cases"])
    assert live["provider"] == "openrouter" and live["model"] == "openai/gpt-6-luna"
    assert live["original_credential_journals_unchanged"] is True
    ui = json.loads((EVIDENCE / "ui/walkthrough.json").read_text())
    assert ui["passed"] and all(ui["cases"].values())
    assert ui["cleanup"]["database_dropped"]
    assert all(identity["deleted"] for identity in ui["cleanup"]["identities"])
    assert manifest["final_feature_acceptance"]["failed"] == 0
    assert manifest["final_feature_acceptance"]["skipped"] == 0
    assert (
        manifest["review"]
        == "Author source/evidence self-review; no independent review claimed"
    )
    print(
        f"Verified {len(manifest['files'])} source/evidence hashes, 3/3 live cases, UI and cleanup. No actions replayed."
    )


if __name__ == "__main__":
    main()
