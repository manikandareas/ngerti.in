"""Durable screen grants and exclusive human input on a scoped native resource.

Grant expiry suspends human input; it never transfers input back to an agent.
The supervisor coordinates resources only. Hermes still owns every model run.
"""

import hashlib
import json
import secrets
import time
from uuid import uuid4

from ngertiin_engine.native_executor import ScopeRefused

DDL = """
CREATE TABLE IF NOT EXISTS screen_control (workspace_key TEXT PRIMARY KEY, state TEXT NOT NULL, grant_hash TEXT, revision INTEGER NOT NULL DEFAULT 1);
CREATE TABLE IF NOT EXISTS screen_grants (token_hash TEXT PRIMARY KEY, scope_key TEXT NOT NULL, workspace_key TEXT NOT NULL, expires REAL NOT NULL, revoked INTEGER NOT NULL DEFAULT 0);
"""


def token_hash(token):
    if not isinstance(token, str) or len(token) != 64:
        raise ScopeRefused("Invalid screen grant")
    return hashlib.sha256(token.encode()).hexdigest()


class ScreenControl:
    def __init__(self, broker):
        self.broker = broker
        with broker._db() as db:
            db.executescript(DDL)

    def state(self, scope, db=None):
        if db is None:
            with self.broker._db() as conn:
                return self.state(scope, conn)
        row = db.execute(
            "SELECT state,grant_hash,revision FROM screen_control WHERE workspace_key=?",
            (scope.workspace_key,),
        ).fetchone()
        if row and row[0] in {"human", "pending"} and row[1]:
            active = db.execute(
                "SELECT 1 FROM screen_grants WHERE token_hash=? AND revoked=0 AND expires>?",
                (row[1], time.time()),
            ).fetchone()
            if not active:
                return ("disconnected", None, row[2])
        return row or ("agent", None, 1)

    def agent_allowed(self, scope):
        with self.broker._db() as db:
            return self.state(scope, db)[0] == "agent"

    def issue(self, scope):
        self.broker.ensure(scope)
        token = secrets.token_hex(32)
        expires = time.time() + 300
        with self.broker._db() as db:
            db.execute(
                "INSERT INTO screen_grants VALUES (?,?,?,?,0)",
                (token_hash(token), scope.key, scope.workspace_key, expires),
            )
        return {"grant": token, "expires_at": expires, "control": self.state(scope)[0]}

    def check(self, scope, token, db):
        self.broker._scope(scope)
        hashed = token_hash(token)
        row = db.execute(
            "SELECT scope_key,workspace_key,expires,revoked FROM screen_grants WHERE token_hash=?",
            (hashed,),
        ).fetchone()
        if (
            not row
            or row[:2] != (scope.key, scope.workspace_key)
            or row[2] <= time.time()
            or row[3]
        ):
            raise ScopeRefused("Screen grant expired or revoked")
        return hashed

    def _set(self, db, scope, state, hashed=None):
        db.execute(
            "INSERT INTO screen_control VALUES (?,?,?,1) ON CONFLICT(workspace_key) DO UPDATE SET state=excluded.state,grant_hash=excluded.grant_hash,revision=screen_control.revision+1",
            (scope.workspace_key, state, hashed),
        )

    def request(self, scope):
        with self.broker.lock, self.broker._db() as db:
            if self.state(scope, db)[0] == "agent":
                self._set(db, scope, "requested")
        return {
            "control": self.state(scope)[0],
            "next_step": "Ask the owner to open the conversation screen and take control. Do not send further input until they explicitly resume.",
        }

    def takeover(self, scope, token, authorize):
        with self.broker.lock, self.broker._db() as db:
            hashed = self.check(scope, token, db)
            state, owner, _ = self.state(scope, db)
            if state in {"human", "pending"} and owner != hashed:
                raise ScopeRefused("Another viewer owns input")
            self._set(db, scope, "pending", hashed)
        # Pending is durable BEFORE waiting for the current native batch. No new
        # agent batch may start while the human waits for exclusive ownership.
        with self.broker._execution_lock(scope.workspace_key):
            authorize()
            self.broker._invoke(
                scope,
                "focus:" + str(uuid4()),
                "_nma_screen",
                {"action": "focus"},
                schema_hash="nma.screen.v1",
                allowed_tools={"_nma_screen"},
                timeout=30,
                control_access=True,
            )
            with self.broker.lock, self.broker._db() as db:
                self.check(scope, token, db)
                if self.state(scope, db)[:2] != ("pending", hashed):
                    raise ScopeRefused("Input transfer was revoked")
                self._set(db, scope, "human", hashed)
        return {"control": "human"}

    def invoke(self, scope, token, action, arguments, operation, authorize):
        with self.broker._execution_lock(scope.workspace_key):
            authorize()
            with self.broker.lock, self.broker._db() as db:
                hashed = self.check(scope, token, db)
                state, owner, _ = self.state(scope, db)
                if action == "input" and (state != "human" or owner != hashed):
                    raise ScopeRefused("Human input ownership required")
            return self.broker._invoke(
                scope,
                operation,
                "_nma_screen",
                {"action": action, **arguments},
                schema_hash="nma.screen.v1",
                allowed_tools={"_nma_screen"},
                timeout=30,
                control_access=True,
            )

    def release(self, scope, token, authorize):
        # Re-observe while the agent remains fenced. A failed observation leaves
        # ownership suspended and cannot silently resume model-written input.
        with self.broker._execution_lock(scope.workspace_key):
            authorize()
            with self.broker.lock, self.broker._db() as db:
                hashed = self.check(scope, token, db)
                state, owner, _ = self.state(scope, db)
                if owner and owner != hashed and state in {"human", "pending"}:
                    raise ScopeRefused("Another viewer owns input")
            frame = self.broker._invoke(
                scope,
                "release:" + str(uuid4()),
                "_nma_screen",
                {"action": "reobserve"},
                schema_hash="nma.screen.v1",
                allowed_tools={"_nma_screen"},
                timeout=30,
                control_access=True,
            )
            observed = json.loads(frame) if isinstance(frame, str) else frame
            if not isinstance(observed, dict) or not str(
                observed.get("image", "")
            ).startswith("data:image/png;base64,"):
                raise ScopeRefused(
                    "Fresh screen observation failed; input remains suspended"
                )
            with self.broker.lock, self.broker._db() as db:
                self.check(scope, token, db)
                if self.state(scope, db)[:2] != (state, owner):
                    raise ScopeRefused("Input transfer was revoked")
                self._set(db, scope, "agent")
        return {"control": "agent", "observation": observed}

    def revoke(self, scope, token, *, suspend=False):
        with self.broker.lock, self.broker._db() as db:
            hashed = self.check(scope, token, db)
            db.execute(
                "UPDATE screen_grants SET revoked=1 WHERE token_hash=?", (hashed,)
            )
            if suspend or self.state(scope, db)[1] == hashed:
                self._set(db, scope, "disconnected")
        return {"revoked": True, "control": self.state(scope)[0]}

    def suspend(self, scope):
        with self.broker.lock, self.broker._db() as db:
            db.execute(
                "UPDATE screen_grants SET revoked=1 WHERE workspace_key=?",
                (scope.workspace_key,),
            )
            if self.state(scope, db)[0] != "agent":
                self._set(db, scope, "disconnected")
