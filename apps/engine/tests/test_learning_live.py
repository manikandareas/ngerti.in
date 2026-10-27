"""Opt-in longitudinal acceptance with a real model and real native assets."""

# ruff: noqa: F811
import hashlib
import json
import os
import sqlite3
import time
import xml.etree.ElementTree as ET
import zipfile
from pathlib import Path

import pytest
from test_capabilities import capability_agent
from test_direct_messages import send, snapshot
from test_learning import conversation, inventory
from test_runtime import command, runtime  # noqa: F401
from test_workspace_delivery import catalog

pytestmark = pytest.mark.skipif(
    not os.environ.get("NMA_TEST_LIVE_ENV")
    or not os.environ.get("NMA_TEST_DOCUMENT_IMAGE"),
    reason="Requires the selected real model and reviewed native document image",
)


def turn(call, thread, text, attachment_ids=()):
    body = send(thread, text)
    body["payload"]["attachment_ids"] = list(attachment_ids)
    response = call(body)
    assert "result" in response, response
    started = time.monotonic()
    run_id = response["result"]["run_id"]
    while time.monotonic() - started < 360:
        state = call(command("runtime.read", {"run_id": run_id}))["result"]
        if state["status"] not in {"queued", "running"}:
            print(
                "LIVE_TURN",
                run_id,
                round(time.monotonic() - started, 3),
                state["status"],
                flush=True,
            )
            assert state["status"] == "succeeded", state
            return state
        time.sleep(0.5)
    pytest.fail(f"Real-model run did not settle: {state}")


def configured(runtime, handle):
    root, _, call, *_ = runtime
    capabilities = catalog(os.environ["NMA_TEST_DOCUMENT_IMAGE"])
    (root / "capabilities.json").write_text(json.dumps(capabilities))
    agent = capability_agent(
        call, handle, tool_grants=list(capabilities["tool_grants"])
    )
    thread = conversation(call, agent)
    if os.environ.get("NMA_TEST_LIVE_UI_AUTH"):
        from test_runtime import OWNER

        auth = json.loads(Path(os.environ["NMA_TEST_LIVE_UI_AUTH"]).read_text())
        registry_file = Path(auth["registry"])
        registry = json.loads(registry_file.read_text())
        registry[OWNER] = {
            "key_file": str(root / "key"),
            "socket": str(root / "state/nma.sock"),
        }
        registry_file.write_text(json.dumps(registry))
        Path(os.environ["NMA_TEST_LIVE_UI_METADATA"]).write_text(
            json.dumps(
                {
                    "owner_id": OWNER,
                    "root": str(root),
                    "agent_id": agent["agent_id"],
                    "thread_id": thread["thread_id"],
                },
                indent=2,
            )
        )
    return agent, thread


def test_real_model_memory_correction_forget_and_learned_skill_reuse(runtime):
    root, _, call, start, *_ = runtime
    agent, dm = configured(runtime, "longitudinal-learning")
    turn(
        call,
        dm,
        "Please remember my report preference: my favorite report color is turquoise. Save it for future conversations. This only records a preference; there is no ongoing task.",
    )
    memories = inventory(call, agent, dm)["memories"]
    assert len(memories) == 1 and "turquoise" in memories[0]["content"].lower(), (
        memories
    )
    start.current.kill()
    start.current.wait(timeout=10)
    start()
    remembered = turn(call, dm, "What is my favorite report color? Answer briefly.")
    assert "turquoise" in remembered["text"].lower(), remembered
    turn(
        call,
        dm,
        "Correct that preference: my favorite report color is now violet instead of turquoise. Update the same memory.",
    )
    corrected = inventory(call, agent, dm)["memories"]
    assert len(corrected) == 1 and corrected[0]["memory_id"] == memories[0]["memory_id"]
    assert (
        "violet" in corrected[0]["content"].lower()
        and "turquoise" not in corrected[0]["content"].lower()
    )
    turn(
        call,
        dm,
        "Completely forget my report color preference from persistent memory.",
    )
    assert inventory(call, agent, dm)["memories"] == []
    start.current.kill()
    start.current.wait(timeout=10)
    start()
    forgotten = turn(
        call,
        dm,
        "Do you still know my favorite report color? If there is no saved preference, say you do not know.",
    )
    assert all(
        word not in forgotten["text"].lower() for word in ("violet", "turquoise")
    ), forgotten
    solved = turn(
        call,
        dm,
        "Calculate the weighted mean of 72 with weight 2 and 90 with weight 3; verify it using Python in the workspace. After success, save a reusable skill named weighted-mean-check with a small Python script accepting values and weights, and record this conversation as its source. Finish in this turn.",
    )
    assert "82" in solved["text"], solved
    learned = next(
        s
        for s in inventory(call, agent, dm)["skills"]
        if s["name"] == "weighted-mean-check"
    )
    assert learned["origin"] == "learned" and any(
        a.endswith(".py") for a in learned["assets"]
    ), learned
    start.current.kill()
    start.current.wait(timeout=10)
    start()
    reused = turn(
        call,
        dm,
        "Use the saved weighted-mean-check skill, read its script, and execute it for 50 with weight 1 and 80 with weight 2. Reuse the existing skill and give the result.",
    )
    assert "70" in reused["text"], reused
    later = next(
        s for s in inventory(call, agent, dm)["skills"] if s["name"] == learned["name"]
    )
    assert (
        later["skill_id"] == learned["skill_id"]
        and later["revision"] == learned["revision"]
    )
    assert later["usage_count"] > learned["usage_count"]
    (root / "live-learning.json").write_text(
        json.dumps(
            {
                "agent_id": agent["agent_id"],
                "thread_id": dm["thread_id"],
                "memory_id": memories[0]["memory_id"],
                "skill_id": learned["skill_id"],
                "skill_revision": learned["revision"],
                "reused_run": reused["run_id"],
            },
            indent=2,
        )
    )
    print("LIVE_LEARNING_ROOT", str(root), flush=True)


def test_real_model_office_pdf_create_revise_and_publish(runtime):
    root, _, call, start, *_ = runtime
    agent, dm = configured(runtime, "live-document-workflows")
    for extension, skill, script in (
        ("docx", "docx", "docx_create.py"),
        ("xlsx", "xlsx", "xlsx_create.py"),
        ("pptx", "powerpoint", "pptx_create.py"),
        ("pdf", "pdf", "pdf_create.py"),
    ):
        turn(
            call,
            dm,
            f"My source inventory contains 17 blue crates and 26 green crates, totaling 43. Create a real {extension.upper()} file named inventory.{extension}. Use the native {skill} workflow: discover and install it if needed, read its instructions and assets, save its JSON specification with write_file, then execute {script} from skill_dir. Use the native workflow and its validators. XLSX must use a recalculated SUM formula; render DOCX/PPTX/PDF pages or slides for inspection. Publish with workspace using a path relative to /work, such as project/inventory.{extension}. Complete this one-time task in this turn.",
        )
    first = snapshot(call, dm)["artifacts"]
    assert len(first) == 4, first
    original_hashes = {a["sha256"] for a in first}
    start.current.kill()
    start.current.wait(timeout=10)
    start()
    for extension, skill in (
        ("docx", "docx"),
        ("xlsx", "xlsx"),
        ("pptx", "powerpoint"),
        ("pdf", "pdf"),
    ):
        turn(
            call,
            dm,
            f"Revise the existing inventory.{extension}: blue crates are now 18, green remains 26, totaling 44. Edit the existing file using the native {skill} scripts and save revised-inventory.{extension}. Preserve and recalculate the SUM formula in XLSX; add VERIFIED to DOCX/PPTX/PDF. Validate, render, and publish the revised file for download in this turn.",
        )
    artifacts = [
        a for a in snapshot(call, dm)["artifacts"] if a["sha256"] not in original_hashes
    ]
    assert {Path(a["filename"]).suffix.lower() for a in artifacts} == {
        ".docx",
        ".xlsx",
        ".pptx",
        ".pdf",
    }, artifacts
    assert len(artifacts) == 4, artifacts
    for artifact in artifacts:
        path = (
            root / "state/files/objects" / artifact["sha256"][:2] / artifact["sha256"]
        )
        assert hashlib.sha256(path.read_bytes()).hexdigest() == artifact["sha256"]
        suffix = Path(artifact["filename"]).suffix.lower()
        if suffix != ".pdf":
            with zipfile.ZipFile(path) as package:
                assert package.testzip() is None
                xml = "\n".join(
                    package.read(name).decode()
                    for name in package.namelist()
                    if name.endswith(".xml")
                )
                assert "44" in xml, (suffix, artifact)
                if suffix == ".xlsx":
                    formulas = [
                        element.text or ""
                        for name in package.namelist()
                        if name.startswith("xl/worksheets/") and name.endswith(".xml")
                        for element in ET.fromstring(package.read(name)).iter()
                        if element.tag.rsplit("}", 1)[-1] == "f"
                    ]
                    assert any("SUM(" in formula.upper() for formula in formulas), (
                        formulas
                    )
                else:
                    assert "VERIFIED" in xml.upper()
        else:
            assert path.read_bytes().startswith(b"%PDF-")
    (root / "live-documents.json").write_text(
        json.dumps(
            {
                "agent_id": agent["agent_id"],
                "thread_id": dm["thread_id"],
                "artifacts": artifacts,
            },
            indent=2,
        )
    )
    print("LIVE_DOCUMENT_ROOT", str(root), flush=True)
    if os.environ.get("NMA_TEST_LIVE_UI_RELEASE"):
        release = Path(os.environ["NMA_TEST_LIVE_UI_RELEASE"])
        print("LIVE_DOCUMENT_REVIEW_READY", flush=True)
        deadline = time.monotonic() + 900
        while not release.exists() and time.monotonic() < deadline:
            time.sleep(0.25)
        assert release.exists(), "Browser review deadline exceeded"


def test_real_model_research_and_coding_assets(runtime):
    root, _, call, *_ = runtime
    agent, dm = configured(runtime, "native-research-coding")
    result = turn(
        call,
        dm,
        "Use the native codebase-inspection and grounded-citations workflows. Create a mini project with one Python file defining add(a,b) returning a+b. Discover/install both skills, read their reference assets, and execute pygount to inspect the code. My supplied synthetic source is: 'Inventory contains 17 blue crates and 26 green crates, total 43.' Its test source identifier is https://example.test/inventory; it is not a fetched web page. Save the source file, register it with sources.py, attach its verbatim quote using quote --from, and author a Markdown report with citations and Sources. Verify with sources.py verify --evidence. State that no browsing occurred. Publish the report and finish in this turn.",
    )
    items = inventory(call, agent, dm)["skills"]
    for name in ("codebase-inspection", "grounded-citations"):
        item = next(item for item in items if item["name"] == name)
        assert item["runtime_ready"] and item["usage_count"] > 0, item
    artifacts = snapshot(call, dm)["artifacts"]
    assert artifacts and any(item["filename"].endswith(".md") for item in artifacts)
    report = next(item for item in artifacts if item["filename"].endswith(".md"))
    if report.get("storage") == "file.v1":
        content = (
            root / "state/files/objects" / report["sha256"][:2] / report["sha256"]
        ).read_text()
    else:
        with sqlite3.connect(root / "state/state.db") as db:
            content = bytes(
                db.execute(
                    "SELECT content FROM nma_artifacts WHERE artifact_id=?",
                    (report["artifact_id"],),
                ).fetchone()[0]
            ).decode()
    assert (
        "43" in content
        and "[1]" in content
        and "https://example.test/inventory" in content
    )
    (root / "live-research-coding.json").write_text(
        json.dumps(
            {
                "run_id": result["run_id"],
                "skills": [
                    {
                        "name": item["name"],
                        "revision": item["revision"],
                        "assets": item["assets"],
                    }
                    for item in items
                ],
                "artifacts": artifacts,
            },
            indent=2,
        )
    )
    print("LIVE_RESEARCH_CODING_ROOT", str(root), flush=True)


def test_real_model_uploaded_spreadsheet_layout_and_formula(runtime):
    from test_files import upload

    root, _, call, *_ = runtime
    _agent, dm = configured(runtime, "spreadsheet-layout-review")
    source = Path(os.environ["NMA_TEST_XLSX_SOURCE"]).read_bytes()
    original = upload(call, dm["thread_id"], source, "source-inventory.xlsx")
    result = turn(
        call,
        dm,
        "Repair the attached XLSX using the native xlsx workflow. Import the attachment into the workspace; preserve 18 blue crates, 26 green crates, the SUM formula and total 44. The first-row title is clipped in print preview: set its height to 36 pt so the full title fits. Save final-inventory.xlsx, recalculate with LibreOffice, verify its formula and row height, render a PDF using a separate profile, and publish both the final XLSX and its PDF preview. Finish this one-time correction.",
        [original["artifact_id"]],
    )
    items = snapshot(call, dm)["artifacts"]
    artifact = next(
        item for item in items if item["filename"] == "final-inventory.xlsx"
    )
    path = root / "state/files/objects" / artifact["sha256"][:2] / artifact["sha256"]
    with zipfile.ZipFile(path) as package:
        sheets = [
            ET.fromstring(package.read(name))
            for name in package.namelist()
            if name.startswith("xl/worksheets/") and name.endswith(".xml")
        ]
        assert any(
            float(row.get("ht", 0)) >= 32
            for sheet in sheets
            for row in sheet.iter()
            if row.tag.rsplit("}", 1)[-1] == "row" and row.get("r") == "1"
        )
        assert any(
            "SUM(" in (e.text or "")
            for sheet in sheets
            for e in sheet.iter()
            if e.tag.rsplit("}", 1)[-1] == "f"
        )
        assert any(
            e.text == "44"
            for sheet in sheets
            for e in sheet.iter()
            if e.tag.rsplit("}", 1)[-1] == "v"
        )
    assert hashlib.sha256(path.read_bytes()).hexdigest() == artifact["sha256"]
    source_path = (
        root / "state/files/objects" / original["sha256"][:2] / original["sha256"]
    )
    assert source_path.read_bytes() == source
    (root / "live-spreadsheet-layout.json").write_text(
        json.dumps(
            {"run_id": result["run_id"], "source": original, "artifacts": items},
            indent=2,
        )
    )
    print("LIVE_SPREADSHEET_ROOT", str(root), flush=True)
    if os.environ.get("NMA_TEST_LIVE_UI_RELEASE"):
        print("LIVE_SPREADSHEET_REVIEW_READY", flush=True)
        release = Path(os.environ["NMA_TEST_LIVE_UI_RELEASE"])
        deadline = time.monotonic() + 900
        while not release.exists() and time.monotonic() < deadline:
            time.sleep(0.25)
        assert release.exists(), "Browser review deadline exceeded"
