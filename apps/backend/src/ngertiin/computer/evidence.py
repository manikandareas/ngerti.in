"""Bounded original source excerpts, never model paraphrases presented as evidence."""

import hashlib
from datetime import UTC, datetime
from urllib.parse import parse_qsl, urlencode, urlsplit, urlunsplit
from uuid import uuid5

from ngertiin.chat.store import json_value, one
from ngertiin.computer import continuation
from ngertiin.computer.contracts import NeedsHuman
from ngertiin.computer.permissions import SECRET_KEYS
from ngertiin.tasks import store

MAX_SOURCES = 24


def safe_url(url):
    parsed = urlsplit(url)
    if parsed.scheme != "https" or not parsed.hostname or parsed.username or parsed.password:
        return ""
    query = parse_qsl(parsed.query)
    if any(k.lower() in SECRET_KEYS for k, _ in query + parse_qsl(parsed.fragment)):
        raise NeedsHuman("URL privat memerlukan takeover.")
    return urlunsplit(
        (
            parsed.scheme,
            parsed.netloc,
            parsed.path,
            urlencode([(k, v) for k, v in query if not k.startswith("utm_")]),
            parsed.fragment,
        )
    )[:2048]


async def save(execution, page):
    url = safe_url(page["url"])
    # Search results help navigation; they are not independent article evidence.
    parsed = urlsplit(url)
    host = (parsed.hostname or "").removeprefix("www.")
    if ((host.startswith("google.") or host == "bing.com") and parsed.path == "/search") or (
        host == "duckduckgo.com" and any(k == "q" for k, _ in parse_qsl(parsed.query))
    ):
        return False
    text = page.get("text", "")[:6000].strip()
    if not url or not text:
        return False
    checksum = hashlib.sha256(text.encode()).hexdigest()
    ident = uuid5(execution["id"], f"{execution['revision']}:{url}:{checksum}")
    async with store.locked(execution["owner_id"], execution["id"]) as (conn, task):
        store.fence(task, execution)
        count = await one(
            conn,
            "SELECT count(*) AS n FROM computer_evidence WHERE task_id=%s AND revision=%s",
            (task["id"], task["revision"]),
        )
        if count["n"] >= MAX_SOURCES:
            return False
        row = await one(
            conn,
            "INSERT INTO "
            "computer_evidence(id,owner_id,task_id,revision,url,title,excerpt,"
            "content_hash,metadata) "
            "VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s) ON CONFLICT DO NOTHING RETURNING id",
            (
                ident,
                task["owner_id"],
                task["id"],
                task["revision"],
                url,
                page.get("title", "")[:200],
                text,
                checksum,
                json_value(
                    {
                        "scope": "visible_viewport",
                        "scroll": page.get("scroll"),
                        "accessed_at": datetime.now(UTC).isoformat(),
                    }
                ),
            ),
        )
        return row is not None


async def load(execution):
    async with store.transaction() as conn:
        rows = await (
            await conn.execute(
                "SELECT id,url,title,excerpt,content_hash,metadata FROM computer_evidence "
                "WHERE owner_id=%s AND task_id=%s AND revision=%s ORDER BY created_at LIMIT %s",
                (execution["owner_id"], execution["id"], execution["revision"], MAX_SOURCES),
            )
        ).fetchall()
    return [{**r, "id": str(r["id"])} for r in rows]


async def observe_progress(execution, fingerprint, new_evidence):
    state = execution.get("runtime_state", {})
    seen = state.get("observations", [])[-12:]
    repeated = seen.count(fingerprint)
    no_progress = 0 if new_evidence else state.get("no_progress", 0) + 1
    await continuation.update(
        execution,
        observations=[*seen, fingerprint][-12:],
        no_progress=no_progress,
        evidence_count=state.get("evidence_count", 0) + int(new_evidence),
    )
    # Repeated states and repeated actions are complementary: neither animation
    # nor alternating tabs can indefinitely reset the objective progress budget.
    return repeated >= 5 or no_progress >= 12


def bundle(rows, limit=6000):
    output, remaining = [], limit
    for row in rows:
        if remaining <= 0:
            break
        excerpt = row["excerpt"][: min(1500, remaining)]
        output.append(
            {
                "id": row["id"],
                "url": row["url"],
                "title": row["title"],
                "excerpt": excerpt,
                "metadata": row["metadata"],
            }
        )
        remaining -= len(excerpt)
    return output
