"""Read private terminal receipts without starting a gateway or replaying work."""

import argparse
import hashlib
import json
import sqlite3
from pathlib import Path

MARKERS = ("no credits remaining", "billing or credits exhausted", "insufficient_quota")


def digest(path):
    return hashlib.sha256(path.read_bytes()).hexdigest() if path.exists() else None


def provider_message(text):
    return any(marker in text.lower() for marker in MARKERS)


def review(rows, database=None):
    records = []
    before = {}
    connection = None
    if database:
        from hermes_state_terminal import load_result

        paths = [database, Path(str(database) + "-wal")]
        before = {str(path): digest(path) for path in paths}
        connection = sqlite3.connect(database.as_uri() + "?mode=ro", uri=True)
        owners = {row["scope"]["owner_id"] for row in rows}
        actual = connection.execute("SELECT owner_id FROM nma_partition").fetchone()
        if len(owners) != 1 or actual != (next(iter(owners)),):
            connection.close()
            raise ValueError("Database must belong to this disposable batch owner")
    try:
        for row in rows:
            proof = {
                "attempt_id": row["attempt_id"],
                "surface": row["surface"],
                "scenario": row["scenario"],
                "repeat": row["repeat"],
                "native_receipts": [],
                "provider_credit_failure": False,
            }
            if connection:
                scope = row["scope"]
                for run, admission, session, config in connection.execute(
                    "SELECT r.run_id,r.native_admission_id,b.native_session_id,b.config "
                    "FROM nma_adapter_runs r JOIN nma_adapter_bindings b "
                    "ON r.owner_id=b.owner_id AND r.binding_id=b.binding_id"
                ):
                    config = json.loads(config)
                    if (config["agent_id"], config["thread_id"]) != (
                        scope["agent_id"],
                        scope["thread_id"],
                    ):
                        continue
                    stored = connection.execute(
                        "SELECT value FROM state_meta WHERE key=?",
                        ("gateway.admission.result.v1." + str(admission),),
                    ).fetchone()
                    if not stored:
                        continue
                    native = load_result(stored[0]).get("result", {})
                    message = (
                        str(native.get("final_response", ""))
                        + " "
                        + str(native.get("error", ""))
                    )
                    credit_failure = provider_message(message)
                    proof["native_receipts"].append(
                        {
                            "run_id": run,
                            "native_admission_id": admission,
                            "native_session_id": session,
                            "stored_receipt_sha256": hashlib.sha256(
                                stored[0].encode()
                            ).hexdigest(),
                            "provider_credit_failure": credit_failure,
                        }
                    )
                    proof["provider_credit_failure"] |= credit_failure
            else:
                # Direct native final cards are already retained in redacted JSONL.
                proof["provider_credit_failure"] = provider_message(
                    str(row.get("result", {}).get("text", ""))
                )
            records.append(proof)
    finally:
        if connection:
            connection.close()
    after = {path: digest(Path(path)) for path in before}
    if before != after:
        raise RuntimeError("Original database/WAL changed during read-only review")
    return {
        "method": "Read-only exact native terminal receipts; no gateway, model or tool invocation",
        "original_database_wal_unchanged": before == after,
        "original_hashes": before,
        "records": records,
    }


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("attempts", type=Path)
    parser.add_argument("--database", type=Path)
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()
    if args.output.exists():
        raise ValueError("Refuse to overwrite receipt review")
    rows = [json.loads(line) for line in args.attempts.read_text().splitlines()]
    value = review(rows, args.database.resolve() if args.database else None)
    args.output.write_text(json.dumps(value, indent=2) + "\n")
