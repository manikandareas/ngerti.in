"""Actual Linux file/process/kernel/LSP/checkpoint/worktree behavior at the pinned seam."""

import json
import os
from uuid import uuid4

import pytest
from ngertiin_engine.contracts import digest
from ngertiin_engine.native_executor import IsolatedTools, Scope, ScopeRefused

pytestmark = pytest.mark.skipif(
    not os.environ.get("NMA_TEST_NATIVE_IMAGE"),
    reason="Requires the reviewed native workspace image",
)


def test_native_coding_processes_and_persistent_files(tmp_path):
    import model_tools  # noqa: F401
    from ngertiin_engine.coding import install
    from tools.registry import registry

    install()
    owner, agent, thread = (str(uuid4()) for _ in range(3))
    scope = Scope(owner, agent, thread)
    broker = IsolatedTools(tmp_path, owner, image=os.environ["NMA_TEST_NATIVE_IMAGE"])
    allowed = {
        "terminal",
        "read_file",
        "write_file",
        "patch",
        "search_files",
        "process_manage",
        "execute_code",
        "coding",
    }

    def invoke(name, args):
        result = broker.invoke(
            scope,
            str(uuid4()),
            name,
            args,
            schema_hash=digest(registry.get_entry(name).schema),
            allowed_tools=allowed,
        )
        value = json.loads(result) if isinstance(result, str) else result
        print(name, json.dumps(value)[:12000], flush=True)
        assert not value.get("error"), value
        return value

    try:
        setup = invoke(
            "terminal",
            {
                "command": "git init -q && git config user.email fixture@example.invalid && git config user.name Fixture && printf 'value: int = 1\n' > main.py && printf 'Keep this file\n' > other.txt && git add main.py other.txt && git commit -qm initial"
            },
        )
        assert setup.get("exit_code", 0) == 0, setup
        baseline = invoke("coding", {"action": "checkpoint"})["checkpoints"][0]["hash"]
        invoke("read_file", {"path": "main.py"})
        invoke(
            "patch",
            {
                "path": "main.py",
                "old_string": "value: int = 1",
                "new_string": "value: int = 'broken'",
            },
        )
        diags = invoke("coding", {"action": "diagnostics", "path": "main.py"})
        assert diags["verified"] and diags["diagnostics"], diags
        assert "int" in json.dumps(diags["diagnostics"]), diags
        invoke(
            "patch",
            {
                "path": "main.py",
                "old_string": "value: int = 'broken'",
                "new_string": "value: int = 2",
            },
        )
        clean = invoke("coding", {"action": "diagnostics", "path": "main.py"})
        assert clean["verified"] and clean["diagnostics"] == [], clean
        unavailable = invoke("coding", {"action": "diagnostics", "path": "other.txt"})
        assert unavailable["verified"] is False and unavailable["diagnostics"] is None
        invoke(
            "terminal",
            {
                "command": "printf 'USER_EDIT' > other.txt; printf 'UNTRACKED' > keep.txt"
            },
        )
        inspected = invoke("coding", {"action": "inspect"})
        assert "main.py" in inspected["hashes"]
        diff = invoke("coding", {"action": "diff", "checkpoint": baseline})
        assert "main.py" in json.dumps(diff), diff
        restored = invoke(
            "coding",
            {
                "action": "restore",
                "checkpoint": baseline,
                "path": "main.py",
                "expected_hashes": inspected["hashes"],
            },
        )
        assert restored.get("success"), restored
        assert broker.file_bytes(scope, "project/main.py") == b"value: int = 1\n"
        assert broker.file_bytes(scope, "project/other.txt") == b"USER_EDIT"
        assert broker.file_bytes(scope, "project/keep.txt") == b"UNTRACKED"
        conflict = broker.invoke(
            scope,
            str(uuid4()),
            "coding",
            {
                "action": "restore",
                "checkpoint": baseline,
                "path": "main.py",
                "expected_hashes": inspected["hashes"],
            },
            schema_hash=digest(registry.get_entry("coding").schema),
            allowed_tools=allowed,
        )
        assert json.loads(conflict)["error"] == "RESTORE_CONFLICT"
        first = invoke("coding", {"action": "worktree"})
        invoke("terminal", {"command": "printf 'FIRST' > main.py"})
        second = invoke("coding", {"action": "worktree"})
        invoke("terminal", {"command": "printf 'SECOND' > main.py"})
        assert first["path"] != second["path"]
        assert (
            broker.file_bytes(scope, first["path"].removeprefix("/work/") + "/main.py")
            == b"FIRST"
        )
        assert (
            broker.file_bytes(scope, second["path"].removeprefix("/work/") + "/main.py")
            == b"SECOND"
        )
        refused = broker.invoke(
            scope,
            str(uuid4()),
            "coding",
            {"action": "cleanup", "worktree_id": first["worktree_id"]},
            schema_hash=digest(registry.get_entry("coding").schema),
            allowed_tools=allowed,
        )
        assert json.loads(refused)["error"] == "WORKTREE_IN_USE"
        invoke("coding", {"action": "release", "worktree_id": second["worktree_id"]})
        dirty = broker.invoke(
            scope,
            str(uuid4()),
            "coding",
            {"action": "cleanup", "worktree_id": second["worktree_id"]},
            schema_hash=digest(registry.get_entry("coding").schema),
            allowed_tools=allowed,
        )
        assert json.loads(dirty)["error"] == "WORKTREE_IN_USE"
        assert first["base"] == second["base"]
        code = invoke(
            "execute_code",
            {"code": "from hermes_tools import read_file\nprint(read_file('main.py'))"},
        )
        assert "FIRST" in json.dumps(code), code
        process = invoke(
            "terminal",
            {
                "command": "read line; printf 'INPUT:%s' \"$line\"; sleep 2",
                "background": True,
                "pty": True,
            },
        )
        handle = process["session_id"]
        invoke(
            "process_manage",
            {"action": "submit", "session_id": handle, "data": "hello"},
        )
        done = invoke(
            "process_manage", {"action": "wait", "session_id": handle, "timeout": 10}
        )
        assert "INPUT:hello" in json.dumps(done), done
        running = invoke("terminal", {"command": "sleep 60", "background": True})
        killed = invoke(
            "process_manage", {"action": "kill", "session_id": running["session_id"]}
        )
        assert killed, killed
        pending = invoke("terminal", {"command": "sleep 60", "background": True})
        broker.pause(scope)
        with broker._db() as db:
            lost = db.execute(
                "SELECT state,receipt FROM jobs WHERE handle=?",
                (pending["session_id"],),
            ).fetchone()
        assert lost[0] == "lost" and json.loads(lost[1])["state"] == "lost"
        broker = IsolatedTools(
            tmp_path, owner, image=os.environ["NMA_TEST_NATIVE_IMAGE"]
        )
        after = invoke("coding", {"action": "inspect"})
        assert first["worktree_id"] in after["worktrees"]
        assert any(
            p["handle"] == pending["session_id"] and p["state"] == "lost"
            for p in after["processes"]
        )
        assert broker.file_bytes(scope, "project/keep.txt") == b"UNTRACKED"
        invoke("terminal", {"command": "ln -s /etc/passwd /work/escape"})
        with pytest.raises(RuntimeError):
            broker.file_bytes(scope, "escape")
        with pytest.raises(ScopeRefused):
            broker.file_bytes(scope, "../escape")
    finally:
        broker.cleanup()


def test_native_whole_restore_preserves_direct_user_edits(tmp_path):
    import model_tools  # noqa: F401
    from ngertiin_engine.coding import install
    from tools.registry import registry

    install()
    owner, agent, thread = (str(uuid4()) for _ in range(3))
    scope = Scope(owner, agent, thread)
    broker = IsolatedTools(tmp_path, owner, image=os.environ["NMA_TEST_NATIVE_IMAGE"])
    allowed = {"terminal", "read_file", "patch", "coding"}

    def invoke(name, args):
        raw = broker.invoke(
            scope,
            str(uuid4()),
            name,
            args,
            schema_hash=digest(registry.get_entry(name).schema),
            allowed_tools=allowed,
        )
        value = json.loads(raw) if isinstance(raw, str) else raw
        assert not value.get("error"), value
        return value

    try:
        invoke(
            "terminal",
            {
                "command": "git init -q; printf ORIGINAL > agent.txt; printf USER_ORIGINAL > user.txt"
            },
        )
        checkpoint = invoke("coding", {"action": "checkpoint"})["checkpoints"][0][
            "hash"
        ]
        invoke("read_file", {"path": "agent.txt"})
        invoke(
            "patch",
            {
                "path": "agent.txt",
                "old_string": "ORIGINAL",
                "new_string": "AGENT_CHANGED",
            },
        )
        target = broker.ensure(scope)
        broker._docker(
            "exec",
            target["container"],
            "/opt/native/bin/python",
            "-c",
            "from pathlib import Path;Path('/work/project/user.txt').write_text('DIRECT_USER_EDIT');Path('/work/project/untracked.txt').write_text('USER_UNTRACKED')",
        )
        hashes = invoke("coding", {"action": "inspect"})["hashes"]
        with broker._db() as db:
            receipts = db.execute(
                "SELECT operation_id,result FROM operations WHERE result IS NOT NULL"
            ).fetchall()
        restored = invoke(
            "coding",
            {"action": "restore", "checkpoint": checkpoint, "expected_hashes": hashes},
        )
        assert restored["success"], restored
        assert broker.file_bytes(scope, "project/agent.txt") == b"ORIGINAL"
        assert broker.file_bytes(scope, "project/user.txt") == b"DIRECT_USER_EDIT"
        assert broker.file_bytes(scope, "project/untracked.txt") == b"USER_UNTRACKED"
        with broker._db() as db:
            for identity, result in receipts:
                assert (
                    db.execute(
                        "SELECT result FROM operations WHERE operation_id=?",
                        (identity,),
                    ).fetchone()[0]
                    == result
                )
    finally:
        broker.cleanup()


def test_native_projects_document_extraction_and_scope_boundaries(tmp_path):
    import model_tools  # noqa: F401
    from ngertiin_engine.coding import install
    from tools.registry import registry

    install()
    owner, agent, thread = (str(uuid4()) for _ in range(3))
    scope = Scope(owner, agent, thread)
    broker = IsolatedTools(tmp_path, owner, image=os.environ["NMA_TEST_NATIVE_IMAGE"])
    allowed = {
        "terminal",
        "read_file",
        "write_file",
        "patch",
        "search_files",
        "execute_code",
        "coding",
        "_nma_reference",
    }

    def invoke(name, args, selected=scope):
        value = broker.invoke(
            selected,
            str(uuid4()),
            name,
            args,
            schema_hash=digest(registry.get_entry(name).schema),
            allowed_tools=allowed,
        )
        result = json.loads(value) if isinstance(value, str) else value
        assert not result.get("error"), result
        return result

    try:
        project = invoke(
            "coding",
            {"action": "project", "project": "Alpha", "folders": ["src", "docs"]},
        )
        root = project["root"].removeprefix("/work/")
        code = """import io,json,sqlite3,zipfile
from pathlib import Path
Path('src/value.txt').write_text('ALPHA_PRIVATE_CANARY')
Path('AGENTS.md').write_text('Use native file tools and preserve the test data.')
Path('sample.ipynb').write_text(json.dumps({'nbformat':4,'nbformat_minor':5,'metadata':{},'cells':[{'cell_type':'markdown','metadata':{},'source':['NOTEBOOK_CANARY']}]}))
with zipfile.ZipFile('sample.docx','w') as z:
 z.writestr('word/document.xml','<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:r><w:t>WORD_CANARY</w:t></w:r></w:p></w:body></w:document>')
with zipfile.ZipFile('sample.xlsx','w') as z:
 z.writestr('xl/workbook.xml','<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="Sheet1" sheetId="1" r:id="rId1"/></sheets></workbook>')
 z.writestr('xl/_rels/workbook.xml.rels','<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Target="worksheets/sheet1.xml" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet"/></Relationships>')
 z.writestr('xl/worksheets/sheet1.xml','<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData><row r="1"><c r="A1" t="inlineStr"><is><t>EXCEL_CANARY</t></is></c></row></sheetData></worksheet>')
with sqlite3.connect('sample.sqlite') as db:
 db.execute('CREATE TABLE sample(value TEXT)');db.execute("INSERT INTO sample VALUES ('SQLITE_CANARY')")
stream=b'BT /F1 12 Tf 50 700 Td (PDF_CANARY) Tj ET'
objects=[b'<< /Type /Catalog /Pages 2 0 R >>',b'<< /Type /Pages /Kids [3 0 R] /Count 1 >>',b'<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>',b'<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',b'<< /Length '+str(len(stream)).encode()+b' >>\\nstream\\n'+stream+b'\\nendstream']
pdf=b'%PDF-1.4\\n';offsets=[]
for i,obj in enumerate(objects,1):
 offsets.append(len(pdf));pdf+=str(i).encode()+b' 0 obj\\n'+obj+b'\\nendobj\\n'
xref=len(pdf);pdf+=b'xref\\n0 6\\n0000000000 65535 f \\n'+b''.join(f'{o:010d} 00000 n \\n'.encode() for o in offsets)+b'trailer\\n<< /Size 6 /Root 1 0 R >>\\nstartxref\\n'+str(xref).encode()+b'\\n%%EOF\\n'
Path('sample.pdf').write_bytes(pdf)
Path('broken.pdf').write_bytes(b'not a pdf')
print('DOCUMENT_FIXTURES_READY')"""
        invoke("execute_code", {"code": code})
        for extension, marker in (
            ("ipynb", "NOTEBOOK_CANARY"),
            ("docx", "WORD_CANARY"),
            ("xlsx", "EXCEL_CANARY"),
            ("sqlite", "SQLITE_CANARY"),
            ("pdf", "PDF_CANARY"),
        ):
            result = invoke("read_file", {"path": "sample." + extension})
            assert marker in result.get("content", ""), result
        malformed = broker.invoke(
            scope,
            str(uuid4()),
            "read_file",
            {"path": "broken.pdf"},
            schema_hash=digest(registry.get_entry("read_file").schema),
            allowed_tools=allowed,
        )
        assert (
            "error" in malformed.lower()
            or "cannot" in malformed.lower()
            or "failed" in malformed.lower()
        ), malformed
        inspection = invoke("coding", {"action": "inspect"})
        assert inspection["instructions"] and inspection["folders"] == ["src", "docs"]
        ref = broker.invoke(
            scope,
            str(uuid4()),
            "_nma_reference",
            {"kind": "file", "target": "src/value.txt"},
            schema_hash="nma.workspace.v1",
            allowed_tools=allowed,
        )
        assert "ALPHA_PRIVATE_CANARY" in ref, ref
        invoke("coding", {"action": "project", "project": "Beta"})
        invoke("terminal", {"command": "printf BETA > value.txt"})
        assert (
            broker.file_bytes(scope, root + "/src/value.txt") == b"ALPHA_PRIVATE_CANARY"
        )
        other = Scope(owner, str(uuid4()), str(uuid4()))
        invoke("terminal", {"command": "printf OTHER > value.txt"}, other)
        assert broker.file_bytes(other, "project/value.txt") == b"OTHER"
        from concurrent.futures import ThreadPoolExecutor

        with ThreadPoolExecutor(max_workers=2) as pool:
            first = pool.submit(
                invoke,
                "terminal",
                {"command": "sleep 1; printf BETA_PARALLEL > value.txt"},
                scope,
            )
            second = pool.submit(
                invoke,
                "terminal",
                {"command": "sleep 1; printf OTHER_PARALLEL > value.txt"},
                other,
            )
            first.result()
            second.result()
        assert (
            broker.file_bytes(scope, root + "/src/value.txt") == b"ALPHA_PRIVATE_CANARY"
        )
        assert broker.file_bytes(other, "project/value.txt") == b"OTHER_PARALLEL"
        with pytest.raises(ScopeRefused):
            broker.file_bytes(
                Scope(str(uuid4()), agent, thread), root + "/src/value.txt"
            )
        broker.cancel(scope)
        new_scope = broker.current_scope(scope)
        assert new_scope.key != scope.key
        broker.ensure(new_scope)
        assert (
            broker.file_bytes(new_scope, root + "/src/value.txt")
            == b"ALPHA_PRIVATE_CANARY"
        )
    finally:
        broker.cleanup()


def test_native_chromium_managed_download(tmp_path):
    import model_tools  # noqa: F401
    from tools.registry import registry

    owner, agent, thread = (str(uuid4()) for _ in range(3))
    scope = Scope(owner, agent, thread)
    broker = IsolatedTools(tmp_path, owner, image=os.environ["NMA_TEST_NATIVE_IMAGE"])
    allowed = {"browser_exec", "terminal"}

    def invoke(name, args):
        value = broker.invoke(
            scope,
            str(uuid4()),
            name,
            args,
            schema_hash=digest(registry.get_entry(name).schema),
            allowed_tools=allowed,
        )
        result = json.loads(value) if isinstance(value, str) else value
        assert not result.get("error"), result
        return result

    try:
        result = invoke(
            "browser_exec",
            {
                "code": 'cdp("Browser.setDownloadBehavior", behavior="allow", downloadPath="/work/project/downloads", eventsEnabled=True); js("document.body.innerHTML = \'<a download=browser.txt href=data:text/plain,BROWSER_DOWNLOAD_VERIFIED>Download</a>\'; document.querySelector(\'a\').click()"); print("Download requested")'
            },
        )
        assert result.get("success"), result
        invoke(
            "terminal",
            {
                "command": "for attempt in 1 2 3 4 5 6 7 8 9 10; do test -f /work/project/downloads/browser.txt && break; sleep 0.2; done; test -f /work/project/downloads/browser.txt"
            },
        )
        assert (
            broker.file_bytes(scope, "project/downloads/browser.txt")
            == b"BROWSER_DOWNLOAD_VERIFIED"
        )
    finally:
        broker.cleanup()
