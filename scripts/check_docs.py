"""Check the local Notion mirror, task graph, view membership and Markdown links."""

import hashlib
import json
import re
from pathlib import Path
from urllib.parse import unquote

ROOT = Path(__file__).resolve().parents[1]
DOCS = ROOT / "docs"


def digest(value):
    return hashlib.sha256(value).hexdigest()


def identity(url):
    match = re.search(r"([0-9a-f]{32}|[0-9a-f-]{36})(?:[?#].*)?$", url)
    assert match, f"Unrecognized page identity: {url}"
    return match[1].replace("-", "")


def main():
    manifest = json.loads((DOCS / "notion-manifest.json").read_text())
    pages = manifest["pages"]
    by_id = {identity(p["id"]): p for p in pages}
    assert len(by_id) == len(pages), "Duplicate page identity"
    assert len({p["file"] for p in pages}) == len(pages), "Duplicate mirror file"
    tasks = [p for p in pages if p["kind"] == "task"]
    by_number = {p["properties"]["Ticket"]: p for p in tasks}
    assert max(by_number) >= 41 and set(by_number) == set(
        range(1, max(by_number) + 1)
    ), "Missing or reused ticket identity"
    active = [p for p in tasks if p["properties"]["Lingkup"] == "Aktif V1"]
    assert sorted(p["properties"]["Urutan"] for p in active) == list(
        range(1, len(active) + 1)
    )
    for n in range(1, 6):
        assert by_number[n]["properties"]["Status"] == "Done", "Historical Done changed"
        assert by_number[n]["properties"]["Lingkup"] == "Histori"
    for n in [*range(6, 16), 24]:
        assert by_number[n]["properties"]["Lingkup"] == "Di luar V1"

    def dependencies(page):
        return [
            by_id[identity(url)] for url in page["properties"].get("Depends on", [])
        ]

    def ancestors(page, visiting=None):
        visiting = set() if visiting is None else visiting
        key = page["id"]
        assert key not in visiting, f"Dependency cycle at {page['title']}"
        result = set()
        for dep in dependencies(page):
            assert dep["properties"]["Lingkup"] == "Aktif V1", "Inactive dependency"
            assert dep["properties"]["Urutan"] < page["properties"]["Urutan"]
            result.add(dep["properties"]["Ticket"])
            result.update(ancestors(dep, visiting | {key}))
        return result

    for page in active:
        prop = page["properties"]
        chain = ancestors(page)
        if prop["Urutan"] > 5:
            assert 30 in chain, f"NG-030 gate missing: {page['title']}"
        if prop["Status"] in {"Ready", "Done"}:
            assert all(p["properties"]["Status"] == "Done" for p in dependencies(page))

    for page in pages:
        path = DOCS / page["file"]
        data = path.read_bytes()
        assert digest(data) == page["local_file_sha256"], f"File hash mismatch: {path}"
        text = data.decode()
        match = re.search(
            r"<!-- notion-content:start -->\n([\s\S]*?)\n<!-- notion-content:end -->",
            text,
        )
        assert match, f"Missing content boundary: {path}"
        assert digest(match[1].strip().encode()) == page["local_content_sha256"]
        assert not re.search(r"<(?:mention-page|page|database)\b", match[1])
        if page["kind"] == "task":
            for key in ["Ticket", "Urutan", "Lingkup", "Status", "Prioritas", "Area"]:
                assert f"| {key} | {page['properties'][key]} |" in text, path

    views = manifest["database"]["views"]
    for index, view in enumerate(views):
        path = DOCS / view["file"]
        text = path.read_text()
        assert digest(text.encode()) == view["local_file_sha256"], path
        expected = [
            tasks,
            active,
            [p for p in active if p["properties"]["Status"] == "Ready"],
            [p for p in tasks if p["properties"]["Lingkup"] != "Aktif V1"],
        ][index]
        expected.sort(key=lambda p: p["properties"]["Urutan"])
        assert view["page_ids"] == [p["id"] for p in expected], f"View mismatch: {path}"
        for page in expected:
            assert page["title"] in text, f"Missing view card: {page['title']}"

    broken = []
    count = 0
    for path in [*DOCS.rglob("*.md"), ROOT / "README.md", ROOT / "PRODUCT.md"]:
        for target in re.findall(r"\]\(([^)]+)\)", path.read_text()):
            target = target.strip("<>").split("#", 1)[0]
            if not target or re.match(r"[a-zA-Z][\w+.-]*:", target):
                continue
            count += 1
            if not (path.parent / unquote(target)).exists():
                broken.append(f"{path.relative_to(ROOT)} -> {target}")
    assert not broken, "Broken local links:\n" + "\n".join(broken)
    print(
        f"Docs: {len(pages)} page hashes, {len(tasks)} tickets, 4 views, {count} local links OK"
    )


if __name__ == "__main__":
    main()
