"""Owner-scoped model connections and non-secret admission snapshots."""

import os
import re
import time
from pathlib import Path
from urllib.parse import urlsplit
from uuid import UUID, uuid5

import httpx

from ngertiin_engine.contracts import EngineError, canonical, uuid
from ngertiin_engine.provider_manifest import (
    CANDIDATES,
    PROTOCOLS,
    PROVIDERS,
    opencode_route,
)
from ngertiin_engine.provider_secrets import Vault
from ngertiin_engine.redaction import result as redact
from ngertiin_engine.runtime import supported_protocols

DDL = (
    "CREATE TABLE nma_provider_connections (owner_id TEXT NOT NULL, connection_id TEXT NOT NULL, metadata TEXT NOT NULL CHECK(json_valid(metadata)), PRIMARY KEY(owner_id,connection_id), FOREIGN KEY(owner_id) REFERENCES nma_partition(owner_id))",
    "CREATE TABLE nma_provider_failures (owner_id TEXT NOT NULL, run_id TEXT NOT NULL, code TEXT NOT NULL, PRIMARY KEY(owner_id,run_id), FOREIGN KEY(owner_id,run_id) REFERENCES nma_adapter_runs(owner_id,run_id))",
    "CREATE TABLE nma_provider_legacy_routes (owner_id TEXT NOT NULL, binding_id TEXT NOT NULL, snapshot TEXT NOT NULL CHECK(json_valid(snapshot)), PRIMARY KEY(owner_id,binding_id), FOREIGN KEY(owner_id,binding_id) REFERENCES nma_adapter_bindings(owner_id,binding_id))",
)


def endpoint(value):
    if not isinstance(value, str) or len(value) > 2048:
        raise EngineError("INVALID_REQUEST")
    parsed = urlsplit(value)
    if (
        not parsed.hostname
        or parsed.username
        or parsed.password
        or parsed.query
        or parsed.fragment
        or (
            parsed.scheme != "https"
            and not (
                parsed.scheme == "http"
                and parsed.hostname in {"127.0.0.1", "::1", "localhost"}
            )
        )
    ):
        raise EngineError("INVALID_ENDPOINT")
    return value.rstrip("/")


def provider_error(status, code="", error_type=""):
    if error_type == "insufficient_quota" or code in {
        "subscription_sharing_usage_limit_exceeded",
        "insufficient_quota",
        "credit_balance_exhausted",
        "billing_hard_limit_reached",
        "billing_not_active",
    }:
        return "PROVIDER_QUOTA_EXHAUSTED"
    if code == "subscription_sharing_usage_unavailable":
        return "PROVIDER_ENTITLEMENT_REQUIRED"
    if code in {"model_not_found", "unsupported_model", "model_not_supported"}:
        return "MODEL_UNAVAILABLE"
    return {
        400: "PROVIDER_REQUEST_REJECTED",
        401: "PROVIDER_RECONNECT_REQUIRED",
        403: "PROVIDER_ENTITLEMENT_REQUIRED",
        404: "MODEL_UNAVAILABLE",
        402: "PROVIDER_QUOTA_EXHAUSTED",
        429: "PROVIDER_RATE_LIMITED",
    }.get(status, "PROVIDER_UNAVAILABLE")


def checked(response):
    if response.is_error:
        raise EngineError(provider_error(response.status_code))
    return response.json()


class Connections:
    def __init__(self, store, home=None):
        self.store, self.owner = store, store.owner
        self.home = Path(home or os.environ["HERMES_HOME"])
        (self.home / "workspace").mkdir(mode=0o700, exist_ok=True)
        self.vault = Vault(self.home, self.owner)
        self.reconcile()

    def save(self, metadata):
        if redact(metadata) != metadata:
            raise EngineError("CREDENTIAL_METADATA_REJECTED")
        self.store.write(
            lambda conn: conn.execute(
                "INSERT INTO nma_provider_connections VALUES (?,?,?) ON CONFLICT(owner_id,connection_id) DO UPDATE SET metadata=excluded.metadata",
                (self.owner, metadata["connection_id"], canonical(metadata)),
            )
        )

    def reconcile(self):
        # The private atomic journal is committed first. Reconcile a lost DB acknowledgement.
        for path in self.vault.root.glob("*.json"):
            value = self.vault.read(path.stem)
            if value.get("metadata"):
                self.save(value["metadata"])

    def get(self, identity):
        import json

        row = self.store.write(
            lambda conn: conn.execute(
                "SELECT metadata FROM nma_provider_connections WHERE owner_id=? AND connection_id=?",
                (self.owner, uuid(identity)),
            ).fetchone()
        )
        if not row:
            raise EngineError("NOT_FOUND")
        return json.loads(row[0])

    def listing(self):
        import json

        rows = self.store.write(
            lambda conn: conn.execute(
                "SELECT metadata FROM nma_provider_connections WHERE owner_id=? ORDER BY connection_id",
                (self.owner,),
            ).fetchall()
        )
        return {
            "items": [json.loads(r[0]) for r in rows],
            "providers": [
                {
                    "id": k,
                    **v,
                    "verification": "live_acceptance_pending",
                    "available": k != "chatgpt"
                    or os.environ.get("NMA_CHATGPT_LOCAL_OSS") == "1",
                }
                for k, v in PROVIDERS.items()
            ],
            "candidates": CANDIDATES,
            "protocols": supported_protocols(),
        }

    def commit(self, identity, value):
        self.vault.remember(value)
        if redact(value["metadata"]) != value["metadata"]:
            raise EngineError("CREDENTIAL_METADATA_REJECTED")
        self.vault.write(identity, value)
        self.save(value["metadata"])
        return value["metadata"]

    def add_key(self, p):
        if set(p) - {
            "connection_id",
            "provider",
            "label",
            "api_key",
            "base_url",
            "protocol",
            "workload",
        }:
            raise EngineError("INVALID_REQUEST")
        identity, provider = uuid(p.get("connection_id")), p.get("provider")
        if (
            not isinstance(provider, str)
            or provider not in PROVIDERS
            or provider == "chatgpt"
        ):
            raise EngineError("INVALID_REQUEST")
        key, label = p.get("api_key"), p.get("label")
        if (
            not isinstance(key, str)
            or not 1 <= len(key.strip()) <= 16384
            or "\n" in key
        ):
            raise EngineError("INVALID_REQUEST")
        if not isinstance(label, str) or not 1 <= len(label.strip()) <= 100:
            raise EngineError("INVALID_REQUEST")
        spec = PROVIDERS[provider]
        url = endpoint(p.get("base_url") if provider == "custom" else spec["base_url"])
        protocol = (
            p.get("protocol", "chat_completions")
            if provider == "custom"
            else spec["protocol"]
        )
        if protocol not in PROTOCOLS | {"model_specific"}:
            raise EngineError("UNSUPPORTED_PROTOCOL")
        if protocol != "model_specific" and protocol not in supported_protocols():
            raise EngineError("PROTOCOL_UNAVAILABLE")
        if provider == "opencode-go" and p.get("workload") != "coding":
            raise EngineError("PROVIDER_WORKLOAD_REQUIRED")
        with self.vault.locked(identity):
            try:
                previous = self.get(identity)
            except EngineError as exc:
                if exc.code != "NOT_FOUND":
                    raise
                previous = None
            if previous and any(
                previous[k] != v
                for k, v in (
                    ("provider", provider),
                    ("base_url", url),
                    ("protocol", protocol),
                )
            ):
                raise EngineError("CONNECTION_IDENTITY_CONFLICT")
            if previous and previous["status"] != "disconnected":
                held = self.vault.read(identity)
                if held.get("api_key") == key.strip():
                    held["metadata"]["label"] = label.strip()
                    return self.commit(identity, held)
            metadata = {
                "connection_id": identity,
                "provider": provider,
                "label": label.strip(),
                "base_url": url,
                "protocol": protocol,
                "auth_method": "api_key",
                "billing": spec["billing"],
                "account_id": identity,
                "registration_id": None,
                "workspace_id": None,
                "generation": (previous or {}).get("generation", 0) + 1,
                "credential_version": (previous or {}).get("credential_version", 0) + 1,
                "status": "configured",
                "catalog_status": "not_checked",
                "models": [],
                "saved_models": (previous or {}).get(
                    "models", (previous or {}).get("saved_models", [])
                ),
                "remote_revocation": "not_requested",
                "workload": p.get("workload", "general"),
            }
            self.commit(identity, {"api_key": key.strip(), "metadata": metadata})
        return metadata

    def credential(self, snapshot):
        """Serialize refresh and verify disconnect at the final upstream request boundary."""
        identity = snapshot["connection_id"]
        with self.vault.locked(identity):
            value = self.vault.read(identity)
            metadata = value["metadata"]
            if metadata["generation"] != snapshot["generation"] or metadata[
                "status"
            ] in {"disconnected", "reconnect_required"}:
                raise EngineError("PROVIDER_RECONNECT_REQUIRED")
            if metadata["provider"] == "chatgpt":
                from ngertiin_engine.provider_auth import refresh_chatgpt

                if value.get("refresh_pending"):
                    metadata["status"] = "reconnect_required"
                    self.commit(identity, value)
                    raise EngineError("PROVIDER_RECONNECT_REQUIRED")
                needs_refresh = (
                    value.get("expires_at_ms") or 0
                ) <= time.time() * 1000 + 60000
                if needs_refresh:
                    value["refresh_pending"] = True
                    self.commit(identity, value)
                try:
                    value = refresh_chatgpt(value)
                except EngineError as exc:
                    if exc.code == "PROVIDER_RECONNECT_REQUIRED":
                        metadata["status"] = "reconnect_required"
                        self.commit(identity, value)
                    raise
                value["refresh_pending"] = False
                self.commit(identity, value)
            return value.get("api_key") or value["access_token"]

    def refresh_models(self, identity):
        metadata = self.get(identity)
        spec = PROVIDERS[metadata["provider"]]
        url = spec["catalog_url"] or metadata["base_url"] + "/models"
        try:
            with (
                self.vault.locked(identity),
                httpx.Client(
                    timeout=20, follow_redirects=False, trust_env=False
                ) as client,
            ):
                key = self.credential(metadata)
                payload = checked(
                    client.get(
                        url,
                        headers={
                            "Authorization": "Bearer " + key,
                            "User-Agent": "Ngertiin/0.1",
                        },
                    )
                )
        except (httpx.HTTPError, ValueError):
            raise EngineError("PROVIDER_UNAVAILABLE") from None
        entries = payload.get("models" if metadata["provider"] == "chatgpt" else "data")
        if not isinstance(entries, list) or len(entries) > 10000:
            raise EngineError("INVALID_PROVIDER_CATALOG")
        models, unavailable_models = [], []
        preserved = {
            m["id"]: m for m in [*metadata.get("saved_models", []), *metadata["models"]]
        }
        for row in entries:
            if not isinstance(row, dict):
                continue
            model = (
                row.get("slug") if metadata["provider"] == "chatgpt" else row.get("id")
            )
            if not isinstance(model, str) or not re.fullmatch(
                r"[\w./:@+~-]{1,200}", model
            ):
                continue
            if metadata["provider"] == "chatgpt" and row.get("visibility") != "list":
                continue
            route = (metadata["base_url"], metadata["protocol"])
            if metadata["provider"].startswith("opencode-"):
                route = opencode_route(metadata["provider"], model)
                if not route:
                    continue
            if route[1] not in supported_protocols():
                unavailable_models.append(
                    {"id": model, "reason": "PROTOCOL_UNAVAILABLE"}
                )
                continue
            models.append(
                {
                    **{
                        k: preserved.get(model, {})[k]
                        for k in ("selection_id", "cwd")
                        if k in preserved.get(model, {})
                    },
                    "id": model,
                    "label": str(row.get("display_name") or row.get("name") or model)[
                        :200
                    ],
                    "base_url": route[0],
                    "protocol": route[1],
                }
            )
        with self.vault.locked(identity):
            value = self.vault.read(identity)
            if (
                value["metadata"]["generation"] != metadata["generation"]
                or value["metadata"]["status"] == "disconnected"
            ):
                raise EngineError("PROVIDER_RECONNECT_REQUIRED")
            value["metadata"].update(
                models=models,
                unavailable_models=unavailable_models,
                catalog_status="public_catalog"
                if metadata["provider"].startswith("opencode-")
                else "account_catalog",
                status="configured"
                if metadata["provider"].startswith("opencode-")
                else "connected",
                catalog_checked_at=int(time.time()),
            )
            return self.commit(identity, value)

    def disconnect(self, identity):
        self.get(identity)
        with self.vault.locked(identity):
            value = self.vault.read(identity)
            metadata = value["metadata"]
            if metadata["status"] == "disconnected":
                return metadata
            remote = (
                "not_confirmed"
                if metadata["auth_method"] == "oauth"
                else "not_requested"
            )
            if metadata["provider"] == "chatgpt" and value.get("refresh_token"):
                from ngertiin_engine.provider_auth import revoke_chatgpt

                remote = revoke_chatgpt(value)
            metadata.update(status="disconnected", remote_revocation=remote)
            # Retain registration/identity, never tokens, after local disconnect.
            return self.commit(identity, {"metadata": metadata})

    def catalog(self):
        result = {}
        for connection in self.listing()["items"]:
            if connection["status"] not in {"connected", "configured"}:
                continue
            for model in connection["models"]:
                selection = (
                    model.get("selection_id")
                    or connection["connection_id"] + ":" + model["id"]
                )
                result[selection] = {
                    "label": f"{connection['label']} · {model['label']} · {connection['billing']}",
                    "model": model["id"],
                    "provider": "custom",
                    "base_url": model["base_url"],
                    "cwd": model.get("cwd", str(self.home / "workspace")),
                    "protocol": model["protocol"],
                    "connection_id": connection["connection_id"],
                    "generation": connection["generation"],
                    "provider_id": connection["provider"],
                    "account_id": connection["account_id"],
                    "registration_id": connection["registration_id"],
                    "billing": connection["billing"],
                }
        return result

    def legacy_snapshot(self, config):
        matches = [
            c for c in self.listing()["items"] if c["base_url"] == config["base_url"]
        ]
        if len(matches) != 1:
            return None
        connection = matches[0]
        return {
            "model": config["model"],
            "provider": "custom",
            "provider_id": connection["provider"],
            "base_url": config["base_url"],
            "protocol": connection["protocol"],
            "connection_id": connection["connection_id"],
            "generation": connection["generation"],
            "account_id": connection["account_id"],
            "registration_id": connection["registration_id"],
            "billing": connection["billing"],
        }

    def record_failure(self, run_id, code):
        if run_id:
            self.store.write(
                lambda conn: conn.execute(
                    "INSERT INTO nma_provider_failures VALUES (?,?,?) ON CONFLICT(owner_id,run_id) DO UPDATE SET code=excluded.code",
                    (self.owner, run_id, code),
                )
            )

    def import_bootstrap(self, models):
        """One-time, explicit owner assignment. Saved connections always win on restart."""
        key = os.environ.get("OPENAI_API_KEY")
        if not key:
            return
        grouped = {}
        for selection, model in models.items():
            identity = str(
                uuid5(
                    UUID(self.owner),
                    "provider-bootstrap:" + model["provider"] + ":" + model["base_url"],
                )
            )
            grouped.setdefault(identity, []).append(
                {**model, "selection_id": selection}
            )
        for identity, group in grouped.items():
            try:
                self.get(identity)
                continue
            except EngineError as exc:
                if exc.code != "NOT_FOUND":
                    raise
            self.add_key(
                {
                    "connection_id": identity,
                    "provider": "custom",
                    "label": "Existing connection",
                    "api_key": key,
                    "base_url": group[0]["base_url"],
                    "protocol": group[0].get("protocol", "chat_completions"),
                }
            )
            with self.vault.locked(identity):
                value = self.vault.read(identity)
                value["metadata"]["models"] = [
                    {
                        "id": m["model"],
                        "label": m.get("label", m["model"]),
                        "selection_id": m["selection_id"],
                        "base_url": m["base_url"],
                        "protocol": m.get("protocol", "chat_completions"),
                        "cwd": m["cwd"],
                    }
                    for m in group
                ]
                self.commit(identity, value)
