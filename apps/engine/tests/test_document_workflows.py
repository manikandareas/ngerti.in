"""Pinned Office/PDF scripts in the actual capsule, binary publication and restart."""

# ruff: noqa: F811
import hashlib
import json
import os
import shlex

import pytest
from test_capabilities import capability_agent
from test_direct_messages import snapshot
from test_learning import conversation, inventory, invoke
from test_runtime import command, runtime  # noqa: F401
from test_workspace_delivery import catalog

pytestmark = pytest.mark.skipif(
    not os.environ.get("NMA_TEST_DOCUMENT_IMAGE"),
    reason="Requires the actual document image",
)


def test_native_office_pdf_create_edit_validate_publish_and_restart(runtime):
    root, provider, call, start, *_ = runtime
    (root / "capabilities.json").write_text(
        json.dumps(catalog(os.environ["NMA_TEST_DOCUMENT_IMAGE"]))
    )
    agent = capability_agent(
        call,
        "document-creator",
        tool_grants=list(catalog(os.environ["NMA_TEST_DOCUMENT_IMAGE"])["tool_grants"]),
    )
    dm = conversation(call, agent)
    directory = {}
    for name in ("docx", "xlsx", "powerpoint", "pdf"):
        entry = next(
            e for e in inventory(call, agent, dm)["catalog"] if e["name"] == name
        )
        assert "skill_id" in invoke(
            provider, call, dm, "skill_install", {"catalog_id": entry["id"]}
        )
        viewed = invoke(provider, call, dm, "skill_view", {"name": name})
        assert viewed.get("success"), viewed
        directory[name] = viewed["skill_dir"] + "/scripts/"
    assert all(i["runtime_ready"] for i in inventory(call, agent, dm)["skills"])
    specs = {
        "word.json": {
            "blocks": [
                {"type": "heading", "text": "Inventory report"},
                {
                    "type": "paragraph",
                    "text": "There are 17 blue and 26 green crates. Total: 43.",
                },
            ]
        },
        "excel.json": {
            "sheets": [
                {
                    "name": "Inventory",
                    "rows": [
                        ["Blue", "Green", "Total"],
                        [17, 26, {"formula": "SUM(A2:B2)"}],
                    ],
                }
            ]
        },
        "slides.json": {
            "slides": [
                {
                    "layout": "title",
                    "title": "Inventory report",
                    "subtitle": "17 blue + 26 green = 43 crates",
                }
            ]
        },
        "pdf.json": {
            "title": "Inventory report",
            "elements": [
                {"type": "heading", "text": "Inventory report"},
                {"type": "paragraph", "text": "17 blue + 26 green = 43 crates"},
            ],
        },
    }
    for path, spec in specs.items():
        written = invoke(
            provider,
            call,
            dm,
            "write_file",
            {"path": path, "content": json.dumps(spec)},
        )
        assert not written.get("error"), written

    def terminal(text):
        value = invoke(provider, call, dm, "terminal", {"command": text})
        assert not value.get("error") and value.get("exit_code", 0) == 0, value
        return value

    quoted = {key: shlex.quote(value) for key, value in directory.items()}
    terminal(
        f"python {quoted['docx']}docx_create.py word.json original.docx && python {quoted['docx']}docx_edit.py replace original.docx --find '43' --replace '43 verified' -o revised.docx && python {quoted['docx']}docx_validate.py revised.docx"
    )
    terminal(
        f"python {quoted['xlsx']}xlsx_create.py excel.json original.xlsx && cp original.xlsx revised.xlsx && python {quoted['xlsx']}xlsx_edit.py revised.xlsx --sheet Inventory --set A2=18 --recalc && python {quoted['xlsx']}xlsx_recalc.py revised.xlsx"
    )
    terminal(
        f"python {quoted['powerpoint']}pptx_create.py slides.json original.pptx && cp original.pptx revised.pptx && python {quoted['powerpoint']}pptx_edit.py revised.pptx --replace-text 'Inventory report' 'Verified inventory' && python {quoted['powerpoint']}pptx_render.py revised.pptx --outdir slides-preview"
    )
    terminal(
        f"python {quoted['pdf']}pdf_create.py pdf.json -o original.pdf && python {quoted['pdf']}pdf_stamp.py original.pdf -o revised.pdf --text VERIFIED --x 70 --y 100 && python {quoted['pdf']}pdf_page_image.py revised.pdf --pages 1 --out-dir pdf-preview"
    )
    checked = terminal(
        "python - <<'PY'\nfrom docx import Document\nfrom openpyxl import load_workbook\nfrom pptx import Presentation\nfrom pypdf import PdfReader\nassert '43 verified' in '\\n'.join(p.text for p in Document('revised.docx').paragraphs)\nw=load_workbook('revised.xlsx',data_only=True); assert w['Inventory']['C2'].value == 44\nassert 'Verified inventory' in Presentation('revised.pptx').slides[0].shapes.title.text\nassert 'VERIFIED' in PdfReader('revised.pdf').pages[0].extract_text()\nprint('FOUR_FORMATS_CONTENT_VERIFIED')\nPY"
    )
    assert "FOUR_FORMATS_CONTENT_VERIFIED" in json.dumps(checked)
    # Render the Word document too; the actual target application must open it.
    terminal(
        "mkdir -p word-preview && soffice -env:UserInstallation=file:///tmp/nma-docx-preview --headless --convert-to pdf --outdir word-preview revised.docx && pdftoppm -f 1 -singlefile -scale-to 1200 -png word-preview/revised.pdf word-preview/page"
    )
    start.current.kill()
    start.current.wait(timeout=10)
    start()
    for extension in ("docx", "xlsx", "pptx", "pdf"):
        value = invoke(
            provider,
            call,
            dm,
            "workspace",
            {
                "action": "publish_file",
                "path": "project/revised." + extension,
                "filename": "revised." + extension,
            },
        )
        assert not value.get("error"), value
    artifacts = snapshot(call, dm)["artifacts"]
    assert len(artifacts) == 4, artifacts
    for artifact in artifacts:
        path = (
            root / "state/files/objects" / artifact["sha256"][:2] / artifact["sha256"]
        )
        assert hashlib.sha256(path.read_bytes()).hexdigest() == artifact["sha256"]
        print(
            "DOCUMENT_VERIFIED",
            artifact["filename"],
            artifact["sha256"],
            artifact["byte_count"],
        )


def test_native_research_coding_assets_and_missing_asset_readiness(runtime):
    _, provider, call, *_ = runtime
    capabilities = catalog(os.environ["NMA_TEST_DOCUMENT_IMAGE"])
    agent = capability_agent(
        call, "research-coding-assets", tool_grants=list(capabilities["tool_grants"])
    )
    thread = conversation(call, agent)
    directories = {}
    for name in ("grounded-citations", "codebase-inspection", "docx"):
        entry = next(
            entry
            for entry in inventory(call, agent, thread)["catalog"]
            if entry["name"] == name
        )
        assert "skill_id" in invoke(
            provider, call, thread, "skill_install", {"catalog_id": entry["id"]}
        )
        viewed = invoke(provider, call, thread, "skill_view", {"name": name})
        assert viewed["success"]
        directories[name] = viewed["skill_dir"]
    for path, content in {
        "mini/sample.py": "def add(a, b):\n    return a + b\n",
        "source.txt": "Inventory contains 17 blue crates and 26 green crates, total 43.\n",
        "report.md": "Inventory contains 43 crates. [1]\n\n",
    }.items():
        result = invoke(
            provider, call, thread, "write_file", {"path": path, "content": content}
        )
        assert not result.get("error"), result
    source = shlex.quote(directories["grounded-citations"] + "/scripts/sources.py")
    command_text = f"pygount --format=summary mini && python {source} --ledger citations.json reset && python {source} --ledger citations.json add https://example.test/inventory --title 'Synthetic inventory' && python {source} --ledger citations.json quote 1 --text 'Inventory contains 17 blue crates and 26 green crates, total 43.' --from source.txt && python {source} --ledger citations.json render >> report.md && python {source} --ledger citations.json verify report.md --evidence"
    result = invoke(provider, call, thread, "terminal", {"command": command_text})
    assert not result.get("error") and result.get("exit_code") == 0, result
    assert "Python" in json.dumps(result), result
    item = next(
        item
        for item in inventory(call, agent, thread)["skills"]
        if item["name"] == "docx"
    )
    removed = invoke(
        provider,
        call,
        thread,
        "skill_manage",
        {
            "operations": [
                {
                    "action": "remove_file",
                    "name": "docx",
                    "file_path": "scripts/docx_validate.py",
                }
            ]
        },
    )
    assert removed.get("success"), removed
    broken = next(
        item
        for item in inventory(call, agent, thread)["skills"]
        if item["name"] == "docx"
    )
    assert not broken["runtime_ready"] and broken["reason"] == "skill_assets_required"
    restore = command(
        "learning.skill",
        {
            "agent_id": agent["agent_id"],
            "thread_id": thread["thread_id"],
            "skill_id": item["skill_id"],
            "action": "rollback",
            "source_revision": item["revision"],
        },
    )
    restore["expected_revision"] = broken["revision"]
    assert "result" in call(restore)
    assert next(
        item
        for item in inventory(call, agent, thread)["skills"]
        if item["name"] == "docx"
    )["runtime_ready"]
