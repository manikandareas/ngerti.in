"""Keep native encrypted vault secrets outside model-written browser/terminal code.

Native origin classification, autofill and TOTP remain upstream. Only supervised
page transport crosses into the capsule, over signed stdin RPC without argv or
plaintext database fields. Each owner has a distinct gateway/profile vault.
"""

import fcntl
import json
import os
import threading
from contextvars import ContextVar
from pathlib import Path
from uuid import uuid4

from ngertiin_engine.contracts import EngineError

_transport = ContextVar("nma_vault_transport", default=None)
_lock = threading.Lock()


class Supervisor:
    def call(self, arguments):
        current = _transport.get()
        if current is None:
            raise EngineError("ACCESS_REVOKED")
        broker, scope, authorize = current
        value = broker.invoke(
            scope,
            "vault:" + str(uuid4()),
            "_nma_page",
            arguments,
            schema_hash="nma.screen.v1",
            allowed_tools={"_nma_page"},
            authorize=authorize,
        )
        return json.loads(value)

    def evaluate_runtime(self, expression):
        value = self.call({"expression": expression})
        return {
            "ok": value.get("success", False),
            "result": value.get("result"),
            "error": value.get("error"),
        }

    def focus_page(self, origin, accept=None):
        return self.call({"action": "focus", "origin": origin, "accept": accept})


def register(value):
    from agent.redact import register_vault_redaction_value

    from ngertiin_engine.redaction import _values

    if isinstance(value, str) and value:
        _values.add(value)
        register_vault_redaction_value(value)


def load_redactions():
    from agent.vault_store import get_vault_store

    vault = get_vault_store()
    for item in vault.list_items():
        for value in vault.resolve_secret(item.id).values():
            register(value)


def invoke(arguments, broker, scope, authorize):
    from tools import browser_vault_tool as native

    from ngertiin_engine.redaction import result as redact

    authorize()
    if not broker.screen.agent_allowed(scope):
        return json.dumps({"error": "HUMAN_CONTROL_ACTIVE", "outcome": "rejected"})
    action = arguments.get("action")
    if action == "save_login":
        status = broker.screen.request(scope)
        return json.dumps(
            {"success": False, "error_type": "human_assistance_required", **status}
        )
    methods = {
        "list": native.browser_vault_list,
        "fill": lambda: native.browser_vault_fill(
            arguments.get("handle", ""), task_id=scope.key
        ),
        "enter_code": lambda: native.browser_vault_enter_code(
            arguments.get("handle", ""), task_id=scope.key
        ),
        "unlock": lambda: native.browser_vault_unlock(arguments.get("backend", "")),
    }
    if action not in methods:
        raise EngineError("INVALID_REQUEST")
    load_redactions()
    token = _transport.set((broker, scope, authorize))
    try:
        result = methods[action]()
        load_redactions()
        return redact(result)
    finally:
        _transport.reset(token)


def _manage(action, payload):
    from agent.vault_store import VaultError, get_vault_store

    vault = get_vault_store()
    try:
        if action == "list" and not payload:
            return {
                "items": [item.to_dict() for item in vault.list_items()],
                "keychain": "unavailable_in_linux_capsule",
                "storage": "owner-local encrypted native vault",
            }
        if action == "add" and set(payload) == {
            "label",
            "origin",
            "identifier",
            "password",
            "otp_secret",
        }:
            if any(
                not isinstance(value, str) or len(value) > 4096
                for value in payload.values()
            ):
                raise EngineError("INVALID_REQUEST")
            register(payload["password"])
            register(payload["otp_secret"])
            meta = vault.add_item(
                "login",
                payload["label"],
                {
                    "identifier_type": "email"
                    if "@" in payload["identifier"]
                    else "username",
                    "identifier": payload["identifier"],
                    "password": payload["password"],
                    "otp_secret": payload["otp_secret"],
                },
                origin=payload["origin"],
            )
            return meta.to_dict()
        if (
            action == "delete"
            and set(payload) == {"handle"}
            and isinstance(payload["handle"], str)
        ):
            return {"deleted": vault.remove_item(payload["handle"])}
    except VaultError:
        raise EngineError("INVALID_REQUEST") from None
    raise EngineError("INVALID_REQUEST")


def manage(action, payload, command_id):
    from hermes_constants import get_hermes_home
    from utils import atomic_write_bytes

    from ngertiin_engine.contracts import digest

    if action == "list":
        return _manage(action, payload)
    root = Path(get_hermes_home()) / "vault"
    root.mkdir(mode=0o700, parents=True, exist_ok=True)
    path = root / "product-receipts.json"
    with _lock, (root / "product-receipts.lock").open("a+") as lock:
        os.chmod(lock.name, 0o600)
        fcntl.flock(lock, fcntl.LOCK_EX)
        receipts = json.loads(path.read_text()) if path.exists() else {}
        fingerprint = digest([action, payload])
        previous = receipts.get(command_id)
        if previous:
            if previous["digest"] != fingerprint:
                raise EngineError("COMMAND_CONFLICT")
            if previous["state"] != "complete":
                raise EngineError("VAULT_OUTCOME_UNKNOWN")
            return previous["result"]
        receipts[command_id] = {"digest": fingerprint, "state": "pending"}
        atomic_write_bytes(path, json.dumps(receipts).encode(), mode=0o600)
        result = _manage(action, payload)
        receipts[command_id].update(state="complete", result=result)
        atomic_write_bytes(path, json.dumps(receipts).encode(), mode=0o600)
        return result


def install():
    from agent import redact as native_redact
    from tools import browser_vault_tool as native

    from ngertiin_engine.redaction import _values

    register_native = native_redact.register_vault_redaction_value

    def remember(value):
        if isinstance(value, str) and value:
            _values.add(value)
        return register_native(value)

    native_redact.register_vault_redaction_value = remember

    original = native._ensure_supervisor

    def supervisor(task_id):
        return Supervisor() if _transport.get() is not None else original(task_id)

    native._ensure_supervisor = supervisor
    load_redactions()
