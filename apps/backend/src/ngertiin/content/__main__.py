"""Operator-run content inspection. No model calls, application writes, or CI test suite."""

import argparse
import copy
import hashlib
import json
import re
from pathlib import Path

from pydantic import ValidationError

from ngertiin.content.answer_keys import key_problems, match_definitive_answer
from ngertiin.content.contracts import LessonDraft, NodeBlueprint, NodePacket, fingerprint
from ngertiin.content.handoff import node_readiness, public_lesson, public_practice
from ngertiin.content.provider_schema import QUESTION_MODELS, practice_output_model, provider_schema
from ngertiin.content.questions import Contract, DefinitiveKey
from ngertiin.content.review import QualityReview, decide_review, review_input
from ngertiin.content.validation import check_packet


def apply_edits(data: dict, edits: list[dict]) -> None:
    for edit in edits:
        target = data
        for part in edit["path"][:-1]:
            target = target[part]
        target[edit["path"][-1]] = copy.deepcopy(edit["value"])


def refresh_snapshot(data: dict) -> None:
    """Fixture-only authoring operation; never refresh a stale production Practice automatically."""
    if data["practice"]:
        for ref in data["practice"]["lesson_revisions"]:
            lesson = next(x for x in data["lessons"] if x["id"] == ref["id"])
            ref["revision"] = lesson["revision"]
            ref["content_hash"] = fingerprint(
                NodePacket.model_validate(data).lessons[
                    next(i for i, x in enumerate(data["lessons"]) if x["id"] == ref["id"])
                ]
            )


def inspect_case(corpus: Path, case: dict) -> dict:
    raw = (corpus / case["packet"]).read_bytes()
    if hashlib.sha256(raw).hexdigest() != case["packet_sha256"]:
        raise ValueError(
            "Fixture changed: its editorial labels need review before re-pinning the hash"
        )
    data = json.loads(raw)
    apply_edits(data, case.get("edits", []))
    if case.get("refresh_snapshot"):
        refresh_snapshot(data)
    try:
        packet = NodePacket.model_validate(data)
    except ValidationError:
        return {"structural_codes": ["SCHEMA"], "outcome": "hold", "contract_codes": []}
    codes = sorted({e.code for e in check_packet(packet, complete=case.get("complete", True))})
    result: dict = {
        "structural_codes": codes,
        "outcome": "hold" if codes else "unreviewed",
        "contract_codes": [],
    }
    if label := case.get("review"):
        request = review_input(packet, label["scope"], label["target_ids"])
        review = QualityReview.model_validate({**label, "input_hash": fingerprint(request)})
        if case.get("stale_input"):
            packet = packet.model_copy(deep=True)
            packet.evidence[0].source_revision += 1
        if case.get("tamper_review_hash"):
            review.input_hash = "0" * 64
        decision = decide_review(packet, request, review, repair_round=case.get("repair_round", 0))
        result.update(decision.model_dump(mode="json"))
        result["contract_codes"] = sorted({e.code for e in decision.contract_issues})
    if "published_lesson_ids" in case:
        from ngertiin.content.contracts import LessonRevision

        receipts = [
            LessonRevision(id=x.id, revision=x.revision, content_hash=fingerprint(x))
            for x in packet.lessons
            if x.id in case["published_lesson_ids"]
        ]
        practice = packet.practice
        practice_receipt = (
            LessonRevision(
                id=practice.id, revision=practice.revision, content_hash=fingerprint(practice)
            )
            if practice and case.get("published_practice")
            else None
        )
        ready = node_readiness(packet, receipts, practice_receipt)
        result["readiness"] = ready.model_dump(exclude={"packet_hash"})
        # Exercise the allowlist using exactly the host-approved snapshots.
        public = [public_lesson(packet, x, ready) for x in ready.lesson_ready_ids]
        if ready.practice_ready:
            public.append(public_practice(packet, ready))
        result["public_fields"] = sorted({key for artifact in public for key in artifact})
        if any(
            key in json.dumps(public)
            for key in ['"correct_option_id"', '"explanation"', '"key"', '"distractor_reasons"']
        ):
            raise ValueError("Private grading metadata leaked through a public projection")
    return result


def schema_audit(output: Path | None = None) -> list[dict]:
    def check(value: object) -> int:
        if isinstance(value, dict):
            count = 0
            if any(k in value for k in ("oneOf", "allOf", "discriminator", "if", "then", "else")):
                raise ValueError("Unsupported provider schema composition")
            if value.get("type") == "object":
                properties = value.get("properties", {})
                if value.get("additionalProperties") is not False:
                    raise ValueError("Provider object is not closed")
                if set(value.get("required", [])) != set(properties):
                    raise ValueError(
                        "Provider fields must be explicitly required; use null when absent"
                    )
                if any(not p.get("description") for p in properties.values()):
                    raise ValueError("Provider fields need meaningful descriptions")
                count += 1
            return count + sum(check(v) for v in value.values())
        if isinstance(value, list):
            return sum(check(v) for v in value)
        return 0

    results = []
    slots = [(f"audit_{kind}", kind) for kind in QUESTION_MODELS]
    models: list[type[Contract]] = [
        NodeBlueprint,
        LessonDraft,
        practice_output_model(slots),
        QualityReview,
    ]
    for model in models:
        emitted = provider_schema(model)
        objects = check(emitted["parameters"])
        if model.__name__ == "PracticeSlots":
            for index, (slot_id, kind) in enumerate(slots, 1):
                fields = emitted["parameters"]["properties"][f"question_{index}"]["properties"]
                if fields["id"].get("pattern") != f"^{re.escape(slot_id)}$":
                    raise ValueError("Provider slot ID is not locked to the host blueprint")
                if fields["type"].get("const") != kind:
                    raise ValueError("Provider slot type is not locked to the host blueprint")
        encoded = json.dumps(emitted, ensure_ascii=False, sort_keys=True, indent=2) + "\n"
        results.append(
            {
                "name": model.__name__,
                "closed_objects": objects,
                "sha256": hashlib.sha256(encoded.encode()).hexdigest(),
            }
        )
        if output:
            output.mkdir(parents=True, exist_ok=True)
            (output / f"{model.__name__}.json").write_text(encoded)
    return results


def inspect_answers(corpus: Path) -> list[dict]:
    results = []
    for case in json.loads((corpus / "answer-cases.json").read_text())["cases"]:
        key = DefinitiveKey.model_validate(case["key"])
        problems = key_problems(key)
        match = match_definitive_answer(case["answer"], key) if not problems else None
        results.append(
            {
                "case": case["id"],
                "problems": problems,
                "match": match,
                "matches_labels": problems == case["expected_problems"]
                and match == case["expected_match"],
            }
        )
    return results


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("command", choices=["inspect", "show", "schemas"])
    parser.add_argument("case_id", nargs="?")
    parser.add_argument("--corpus", type=Path, default=Path("docs/fixtures/course-content"))
    parser.add_argument("--output", type=Path)
    args = parser.parse_args()
    if args.command == "schemas":
        print(json.dumps(schema_audit(args.output), indent=2))
        return
    cases = json.loads((args.corpus / "cases.json").read_text())["cases"]
    failures = 0
    observed = []
    for case in cases:
        if args.case_id and args.case_id != case["id"]:
            continue
        result = inspect_case(args.corpus, case)
        mismatch = {
            k: {"expected": v, "observed": result.get(k)}
            for k, v in case["expected"].items()
            if result.get(k) != v
        }
        failures += bool(mismatch)
        observed.append({"case": case["id"], "matches_labels": not mismatch, "result": result})
        if args.command == "show":
            print(
                json.dumps(
                    {"case": case, "observed": result, "mismatch": mismatch},
                    ensure_ascii=False,
                    indent=2,
                )
            )
        else:
            print(
                f"{'OK' if not mismatch else 'MISMATCH'} {case['id']}: "
                f"{result['outcome']} {mismatch or ''}"
            )
    if not observed:
        parser.error("Unknown fixture case ID")
    answers = inspect_answers(args.corpus)
    failures += sum(not result["matches_labels"] for result in answers)
    schemas = schema_audit()
    report = {
        "cases": observed,
        "label_mismatches": failures,
        "provider_schemas": schemas,
        "answer_cases": answers,
        "limits": (
            "Offline editorial labels, not live AI review or teacher calibration; "
            "no latency benchmark."
        ),
    }
    if args.output:
        args.output.parent.mkdir(parents=True, exist_ok=True)
        args.output.write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n")
    print(
        f"{len(observed)} cases inspected; {failures} label mismatches; "
        f"{len(answers)} answer policies; {len(schemas)} provider schemas inspected."
    )
    raise SystemExit(1 if failures else 0)


if __name__ == "__main__":
    main()
