"""Process-independent trial admission, owner checks and fenced control grants."""

import hashlib
import json
import secrets
import sqlite3
import time
from contextlib import contextmanager
from uuid import uuid4

from ngertiin.config import ROOT

PATH = ROOT / ".dev/daytona-trial.sqlite3"
BUDGET_USD = 1.0
MAX_TTL_MINUTES = 30
# Deliberately above the medium snapshot's public CPU/RAM/disk rate, including
# lifecycle overhead. Reservations are never refunded or reset by a restart.
RESERVED_HOURLY_USD = 1.0


class TrialError(Exception):
    """A failed precondition must prevent any provider side effect."""


@contextmanager
def database():
    PATH.parent.mkdir(parents=True, exist_ok=True)
    with sqlite3.connect(PATH, timeout=3) as conn:
        conn.row_factory = sqlite3.Row
        conn.executescript("""
            CREATE TABLE IF NOT EXISTS sessions (
                id TEXT PRIMARY KEY, owner_id TEXT NOT NULL, sandbox_id TEXT,
                created_at REAL NOT NULL, deadline REAL NOT NULL,
                reserved_usd REAL NOT NULL, status TEXT NOT NULL,
                mode TEXT NOT NULL DEFAULT 'agent', version INTEGER NOT NULL DEFAULT 1,
                busy TEXT, unknown_effect INTEGER NOT NULL DEFAULT 0
            );
            CREATE TABLE IF NOT EXISTS grants (
                id TEXT PRIMARY KEY, secret_hash TEXT NOT NULL,
                session_id TEXT NOT NULL, owner_id TEXT NOT NULL,
                version INTEGER NOT NULL, expires_at REAL NOT NULL
            );
            CREATE TABLE IF NOT EXISTS channels (
                id TEXT PRIMARY KEY, session_id TEXT NOT NULL, closed INTEGER NOT NULL DEFAULT 0
            );
            CREATE TABLE IF NOT EXISTS events (
                at REAL NOT NULL, session_id TEXT NOT NULL, kind TEXT NOT NULL, data TEXT NOT NULL
            );
        """)
        yield conn


def event(ident: str, kind: str, data: dict) -> None:
    with database() as conn:
        conn.execute(
            "INSERT INTO events VALUES(?,?,?,?)", (time.time(), ident, kind, json.dumps(data))
        )


def open_channel(row: dict) -> str:
    ident = secrets.token_hex(16)
    with database() as conn:
        inserted = conn.execute(
            "INSERT INTO channels(id,session_id) SELECT ?,id FROM sessions "
            "WHERE id=? AND version=? AND status='ready' AND mode IN ('agent','human') "
            "AND deadline>? AND NOT EXISTS (SELECT 1 FROM channels "
            "WHERE channels.session_id=sessions.id AND channels.closed=0) RETURNING id",
            (ident, row["id"], row["version"], time.time()),
        ).fetchone()
        if inserted is None:
            raise TrialError("Lease viewer dicabut saat menghubungkan.")
    return ident


def close_channel(ident: str) -> None:
    with database() as conn:
        conn.execute("UPDATE channels SET closed=1 WHERE id=?", (ident,))


def channels_open(ident: str) -> bool:
    with database() as conn:
        return (
            conn.execute(
                "SELECT 1 FROM channels WHERE session_id=? AND closed=0", (ident,)
            ).fetchone()
            is not None
        )


def begin_cleanup(ident: str, owner_id: str) -> dict:
    row = owned(ident, owner_id)
    with database() as conn:
        conn.execute(
            "UPDATE sessions SET status='deleting',mode='stopping',version=version+1 WHERE id=?",
            (ident,),
        )
        conn.execute("DELETE FROM grants WHERE session_id=?", (ident,))
    return row


def reserve(owner_id: str, ttl: int = MAX_TTL_MINUTES) -> dict:
    if not owner_id or not 1 <= ttl <= MAX_TTL_MINUTES:
        raise TrialError("Owner dan TTL 1–30 menit wajib diisi.")
    with database() as conn:
        conn.execute("BEGIN IMMEDIATE")
        if conn.execute("SELECT 1 FROM sessions WHERE status<>'deleted'").fetchone():
            raise TrialError("Reconcile/cleanup sesi sebelumnya sebelum membuat resource lain.")
        spent = conn.execute("SELECT coalesce(sum(reserved_usd),0) FROM sessions").fetchone()[0]
        amount = RESERVED_HOURLY_USD * (ttl + 2) / 60
        if spent + amount > BUDGET_USD:
            raise TrialError("Plafon reservasi trial US$1 sudah tercapai.")
        ident, now = str(uuid4()), time.time()
        conn.execute(
            "INSERT INTO sessions(id,owner_id,created_at,deadline,reserved_usd,status) "
            "VALUES(?,?,?,?,?,'provisioning')",
            (ident, owner_id, now, now + ttl * 60, amount),
        )
    return owned(ident, owner_id)


def owned(ident: str, owner_id: str) -> dict:
    with database() as conn:
        row = conn.execute(
            "SELECT * FROM sessions WHERE id=? AND owner_id=?", (ident, owner_id)
        ).fetchone()
    if row is None:
        raise TrialError("Sesi tidak ditemukan.")
    return dict(row)


def sessions(owner_id: str | None = None) -> list[dict]:
    with database() as conn:
        rows = conn.execute(
            "SELECT * FROM sessions WHERE (? IS NULL OR owner_id=?) ORDER BY created_at DESC",
            (owner_id, owner_id),
        ).fetchall()
    return [dict(row) for row in rows]


def provisioned(ident: str, sandbox_id: str) -> None:
    with database() as conn:
        conn.execute(
            "UPDATE sessions SET sandbox_id=?,status='ready' WHERE id=?",
            (sandbox_id, ident),
        )


def deleted(ident: str) -> None:
    with database() as conn:
        conn.execute(
            "UPDATE sessions SET status='deleted',version=version+1,mode='stopped' WHERE id=?",
            (ident,),
        )
        conn.execute("DELETE FROM grants WHERE session_id=?", (ident,))
        conn.execute("UPDATE channels SET closed=1 WHERE session_id=?", (ident,))


def begin_action(ident: str, owner_id: str, version: int) -> str:
    token = secrets.token_hex(16)
    with database() as conn:
        row = conn.execute(
            "UPDATE sessions SET busy=? WHERE id=? AND owner_id=? AND version=? "
            "AND mode='agent' AND status='ready' AND busy IS NULL "
            "AND unknown_effect=0 AND deadline>? RETURNING id",
            (token, ident, owner_id, version, time.time()),
        ).fetchone()
        if row is None:
            raise TrialError("Aksi ditolak: lease usang, kendali manusia, atau sesi belum siap.")
    return token


def finish_action(ident: str, token: str, *, unknown: bool = False) -> None:
    with database() as conn:
        conn.execute(
            "UPDATE sessions SET busy=NULL,unknown_effect=? WHERE id=? AND busy=?",
            (int(unknown), ident, token),
        )


def request_control(ident: str, owner_id: str, destination: str) -> dict:
    if destination not in {"human", "agent"}:
        raise TrialError("Kendali tidak dikenal.")
    owned(ident, owner_id)
    with database() as conn:
        conn.execute("BEGIN IMMEDIATE")
        row = conn.execute("SELECT * FROM sessions WHERE id=?", (ident,)).fetchone()
        if row["status"] != "ready" or row["deadline"] <= time.time():
            raise TrialError("Sesi tidak aktif.")
        if row["mode"] not in {"agent", "human"}:
            expected = "handoff" if destination == "human" else "resuming"
            if row["mode"] == expected:
                return dict(row)
            raise TrialError("Perpindahan kendali sedang berjalan.")
        conn.execute(
            "UPDATE sessions SET mode=?,version=version+1 WHERE id=?",
            ("handoff" if destination == "human" else "resuming", ident),
        )
        conn.execute("DELETE FROM grants WHERE session_id=?", (ident,))
    return owned(ident, owner_id)


def complete_control(ident: str, owner_id: str, version: int, destination: str) -> dict:
    with database() as conn:
        row = conn.execute(
            "UPDATE sessions SET mode=? WHERE id=? AND owner_id=? AND version=? "
            "AND busy IS NULL AND unknown_effect=0 AND mode IN ('handoff','resuming') "
            "AND deadline>? AND NOT EXISTS (SELECT 1 FROM channels "
            "WHERE channels.session_id=sessions.id AND channels.closed=0) RETURNING id",
            (destination, ident, owner_id, version, time.time()),
        ).fetchone()
        if row is None:
            raise TrialError("Aksi in-flight belum selesai atau outcome perlu direkonsiliasi.")
    return owned(ident, owner_id)


def mint_grant(ident: str, owner_id: str, seconds: int = 60) -> tuple[str, str]:
    row = owned(ident, owner_id)
    if row["status"] != "ready" or row["mode"] not in {"agent", "human"}:
        raise TrialError("Viewer menunggu sesi siap.")
    grant, secret = secrets.token_urlsafe(18), secrets.token_urlsafe(32)
    with database() as conn:
        conn.execute("DELETE FROM grants WHERE session_id=?", (ident,))
        conn.execute(
            "INSERT INTO grants VALUES(?,?,?,?,?,?)",
            (
                grant,
                hashlib.sha256(secret.encode()).hexdigest(),
                ident,
                owner_id,
                row["version"],
                min(time.time() + min(max(seconds, 1), 60), row["deadline"]),
            ),
        )
    return grant, secret


def check_grant(grant: str, secret: str) -> dict:
    with database() as conn:
        row = conn.execute(
            "SELECT s.*,g.expires_at FROM grants g JOIN sessions s ON s.id=g.session_id "
            "WHERE g.id=? AND g.secret_hash=? AND g.owner_id=s.owner_id "
            "AND g.version=s.version AND g.expires_at>? AND s.deadline>? "
            "AND s.status='ready' AND s.mode IN ('agent','human')",
            (grant, hashlib.sha256(secret.encode()).hexdigest(), time.time(), time.time()),
        ).fetchone()
    if row is None:
        raise TrialError("Viewer kedaluwarsa atau akses dicabut.")
    return dict(row)
