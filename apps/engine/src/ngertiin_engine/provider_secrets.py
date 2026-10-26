"""Trusted owner-local credential journal using pinned Hermes atomic storage/locks."""

import json
from contextlib import contextmanager
from pathlib import Path

from ngertiin_engine.contracts import EngineError, uuid
from ngertiin_engine.redaction import remember


class Vault:
    def __init__(self, home, owner):
        self.root, self.owner = Path(home) / "provider-secrets", uuid(owner)
        if self.root.is_symlink():
            raise EngineError("CREDENTIAL_UNAVAILABLE")
        self.root.mkdir(mode=0o700, exist_ok=True)
        self.root.chmod(0o700)

    def path(self, identity):
        return self.root / (uuid(identity) + ".json")

    @contextmanager
    def locked(self, identity):
        from hermes_cli.auth import _auth_store_lock

        with _auth_store_lock(target_path=self.path(identity)):
            yield

    def read(self, identity):
        path = self.path(identity)
        if path.is_symlink():
            raise EngineError("CREDENTIAL_UNAVAILABLE")
        if not path.exists():
            raise EngineError("CREDENTIAL_UNAVAILABLE")
        value = json.loads(path.read_text())
        if value.get("owner_id") != self.owner:
            raise EngineError("NOT_FOUND")
        self.remember(value)
        return value

    def write(self, identity, value):
        from hermes_cli.auth import _save_private_json

        self.remember(value)
        _save_private_json(
            self.path(identity), {**value, "owner_id": self.owner}, fsync_dir=True
        )

    @staticmethod
    def remember(value):
        for key in ("access_token", "refresh_token", "id_token", "api_key", "verifier"):
            if value.get(key):
                remember({"headers": [{"value": value[key]}]})
