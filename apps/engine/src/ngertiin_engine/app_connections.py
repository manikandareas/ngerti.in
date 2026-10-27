"""Versioned owner-local app journals; native Hermes owns MCP and OAuth execution."""

import json
import os
import re
from pathlib import Path

from ngertiin_engine.contracts import EngineError, digest, uuid
from ngertiin_engine.provider_secrets import Vault
from ngertiin_engine.redaction import result as redact


def grant_id(identity):
    return "app_" + uuid(identity).replace("-", "")


def owner_apps():
    return AppConnections(os.environ["HERMES_HOME"], os.environ["NMA_OWNER_ID"])


def public_url(value, *, fixed=False):
    from urllib.parse import urlsplit

    from ngertiin_engine.connections import endpoint

    parsed = urlsplit(value or "")
    origin = parsed.scheme + "://" + parsed.netloc
    allowed = json.loads(os.environ.get("NMA_APP_ALLOWED_ORIGINS", "[]"))
    if not fixed and origin not in allowed:
        raise EngineError("INVALID_ENDPOINT", {"reason": "app_origin_not_configured"})
    result = endpoint(value)
    if parsed.scheme != "https" and origin not in allowed:
        raise EngineError("INVALID_ENDPOINT")
    return result


class AppConnections:
    def __init__(self, home, owner):
        self.home, self.owner = Path(home), uuid(owner)
        self.vault = Vault(home, owner, directory="app-secrets")

    def read(self, identity):
        try:
            value = self.vault.read(identity)
        except EngineError as exc:
            if exc.code == "CREDENTIAL_UNAVAILABLE":
                raise EngineError("NOT_FOUND") from None
            raise
        if value.get("version") != 1:
            raise EngineError("UNSUPPORTED_VERSION")
        return value

    def save(self, identity, value):
        self.vault.remember(value)
        if redact(value["metadata"]) != value["metadata"]:
            raise EngineError("CREDENTIAL_METADATA_REJECTED")
        self.vault.write(identity, {**value, "version": 1})
        return value["metadata"]

    def items(self):
        return [self.read(p.stem) for p in sorted(self.vault.root.glob("*.json"))]

    def listing(self):
        from ngertiin_engine.app_manifest import manifest

        return {
            "version": 1,
            "applications": [entry for entry in manifest() if entry["id"] != "n8n"],
            "items": [value["metadata"] for value in self.items()],
        }

    def recover_processes(self):
        from ngertiin_engine.app_stdio import stop

        for value in self.items():
            if value["metadata"]["transport"] == "stdio" and not stop(
                self, value["metadata"]["connection_id"]
            ):
                raise EngineError(
                    "CONNECTOR_UNAVAILABLE", {"reason": "app_process_cleanup_pending"}
                )

    def configure(self, payload):
        from ngertiin_engine.app_manifest import manifest

        if set(payload) - {
            "connection_id",
            "application",
            "label",
            "url",
            "auth_method",
            "api_key",
            "tools",
            "oauth_client_id",
            "oauth_client_secret",
            "stdio_profile",
            "expected_generation",
        }:
            raise EngineError("INVALID_REQUEST")
        identity = uuid(payload.get("connection_id"))
        app = next(
            (v for v in manifest() if v["id"] == payload.get("application")), None
        )
        label = payload.get("label")
        method = payload.get("auth_method", "oauth")
        if (
            not app
            or method not in app["auth_methods"]
            or not isinstance(label, str)
            or not 1 <= len(label.strip()) <= 100
        ):
            raise EngineError("INVALID_REQUEST")
        filters = payload.get("tools", [])
        if (
            not isinstance(filters, list)
            or len(filters) > 256
            or any(
                not isinstance(name, str)
                or not re.fullmatch(r"[A-Za-z0-9_.:-]{1,160}", name)
                for name in filters
            )
        ):
            raise EngineError("INVALID_REQUEST")
        profile = payload.get("stdio_profile")
        if profile is not None and (
            not isinstance(profile, str)
            or not re.fullmatch(r"[a-z][a-z0-9_-]{0,63}", profile)
        ):
            raise EngineError("INVALID_REQUEST")
        builtin_google = app["id"] == "google-workspace" and not profile
        if builtin_google:
            from ngertiin_engine.google_workspace import RESOURCE_URL

            if method != "oauth":
                raise EngineError("INVALID_REQUEST")
            if payload.get("url") not in (None, "", RESOURCE_URL):
                raise EngineError("INVALID_ENDPOINT")
            url = RESOURCE_URL
        else:
            url = (
                ""
                if profile
                else public_url(
                    app["url"] or payload.get("url"), fixed=bool(app["url"])
                )
            )
        # Fixed vendor entries never accept a browser-supplied replacement endpoint.
        if app["url"] and payload.get("url") not in (None, ""):
            from ngertiin_engine.connections import endpoint

            if endpoint(payload["url"]) != endpoint(app["url"]):
                raise EngineError("INVALID_ENDPOINT")
        secrets = {}
        for key in ("api_key", "oauth_client_id", "oauth_client_secret"):
            value = payload.get(key)
            if value is not None:
                if (
                    not isinstance(value, str)
                    or not 1 <= len(value) <= 16384
                    or "\n" in value
                ):
                    raise EngineError("INVALID_REQUEST")
                secrets[key] = value
        if builtin_google:
            from ngertiin_engine.google_workspace import defaults

            secrets = {**defaults(), **secrets}
        if method == "bearer" and not secrets.get("api_key"):
            raise EngineError("INVALID_REQUEST")
        with self.vault.locked(identity):
            try:
                previous = self.read(identity)
            except EngineError as exc:
                if exc.code != "NOT_FOUND":
                    raise
                previous = None
            if previous and previous["metadata"]["application"] != app["id"]:
                raise EngineError("CONNECTION_IDENTITY_CONFLICT")
            if previous and previous.get("request_digest") == digest(payload):
                return previous["metadata"]
            if (
                previous
                and payload.get("expected_generation")
                != previous["metadata"]["generation"]
            ):
                raise EngineError("REVISION_CONFLICT")
            if builtin_google and previous:
                secrets = {
                    **{
                        key: previous[key]
                        for key in ("oauth_client_id", "oauth_client_secret")
                        if previous.get(key)
                    },
                    **secrets,
                }
            generation = previous["metadata"]["generation"] + 1 if previous else 1
            metadata = {
                "connection_id": identity,
                "grant_id": grant_id(identity),
                "application": app["id"],
                "label": label.strip(),
                "url": url,
                "transport": "stdio" if profile else "http",
                "auth_method": method,
                "generation": generation,
                "credential_generation": generation,
                "status": "configured",
                "tools": [],
                "selected_tools": sorted(set(filters)),
                "tools_selected": "tools" in payload and bool(filters),
                "verification": "live_acceptance_pending",
                "remote_revocation": "not_requested",
                "error": None,
            }
            if builtin_google:
                metadata.update(
                    builtin_mcp="google_standard_api",
                    oauth_configured=bool(
                        secrets.get("oauth_client_id")
                        and secrets.get("oauth_client_secret")
                    ),
                )
            return self.save(
                identity,
                {
                    "metadata": metadata,
                    **secrets,
                    "stdio_profile": profile,
                    "request_digest": digest(payload),
                },
            )

    def disconnect(self, identity):
        identity = uuid(identity)
        with self.vault.locked(identity):
            value = self.read(identity)
            metadata = value["metadata"]
            if metadata["status"] != "disconnected":
                metadata.update(
                    status="disconnected",
                    generation=metadata["generation"] + 1,
                    remote_revocation="not_confirmed",
                )
            # Old native token files remain inaccessible to every new dispatch. Retain
            # the receipt; never claim the vendor's remote grant has been revoked.
            result = self.save(identity, {"metadata": metadata})
        if metadata["transport"] == "stdio":
            from ngertiin_engine.app_stdio import stop

            try:
                stopped = stop(self, identity)
            except (RuntimeError, OSError):
                stopped = False
            result = {
                **result,
                "process_cleanup": "confirmed" if stopped else "pending",
            }
        elif metadata.get("builtin_mcp") == "google_standard_api":
            from ngertiin_engine.google_mcp import stop

            stop(self, identity)
        return result

    def check(self, connection_id, generation):
        value = self.read(connection_id)
        if (
            value["metadata"]["generation"] != generation
            or value["metadata"]["status"] == "disconnected"
        ):
            raise EngineError("ACCESS_REVOKED")
        return value

    def native_config(self, connection_id, generation, scope_name="setup"):
        value = self.check(connection_id, generation)
        metadata = value["metadata"]
        config = {
            "url": metadata["url"],
            "connect_timeout": 15,
            "tool_timeout": 120,
            "trust": "full",
            "sampling": {"enabled": True},
            "tools": {"include": metadata["selected_tools"]}
            if metadata.get("tools_selected", bool(metadata["selected_tools"]))
            else {},
        }
        if metadata["auth_method"] == "oauth":
            config.update(
                auth="oauth",
                oauth={
                    key.removeprefix("oauth_"): value[key]
                    for key in ("oauth_client_id", "oauth_client_secret")
                    if value.get(key)
                },
            )
        if metadata.get("builtin_mcp") == "google_standard_api":
            from ngertiin_engine.google_mcp import url_for
            from ngertiin_engine.google_workspace import SCOPES

            if not value.get("oauth_client_id") or not value.get("oauth_client_secret"):
                raise EngineError("APP_GOOGLE_OAUTH_REQUIRED")
            config["url"] = url_for(self, connection_id, generation)
            config["oauth"]["scope"] = " ".join(SCOPES)
        elif metadata["auth_method"] != "oauth" and value.get("api_key"):
            config["headers"] = {"Authorization": "Bearer " + value["api_key"]}
        if metadata["transport"] == "stdio":
            from ngertiin_engine.app_stdio import configuration

            config = {**config, **configuration(self, value, scope_name)}
            config.pop("url", None)
            config.pop("auth", None)
        options_file = os.environ.get("NMA_APP_OPTIONS_FILE")
        options = (
            json.loads(Path(options_file).read_text())
            .get(self.owner, {})
            .get(connection_id, {})
            if options_file
            else {}
        )
        allowed = {
            "identity_header",
            "client_cert",
            "client_key",
            "sampling",
            "elicitation",
            "tool_costs",
            "spend_limit",
            "cost_unit",
            "events",
        }
        if not isinstance(options, dict) or set(options) - allowed:
            raise EngineError("INVALID_CONFIGURATION")
        config.update(options)
        if config.get("events"):
            # Upstream experimental delivery creates profile webhook routes. It
            # cannot bypass the product's thread/agent wake binding.
            raise EngineError(
                "CAPABILITY_UNAVAILABLE", {"reason": "mcp_events_bridge_unavailable"}
            )
        return config

    def token_name(self, identity, generation):
        value = self.check(identity, generation)
        return (
            grant_id(identity)
            + "_g"
            + str(value["metadata"].get("credential_generation", generation))
        )

    def select_tools(self, payload):
        if set(payload) != {"connection_id", "generation", "tools"}:
            raise EngineError("INVALID_REQUEST")
        identity = uuid(payload["connection_id"])
        selected = payload["tools"]
        with self.vault.locked(identity):
            value = self.read(identity)
            if (
                value.get("selection_digest") == digest(payload)
                and value["metadata"]["generation"] == payload["generation"] + 1
            ):
                return value["metadata"]
            value = self.check(identity, payload["generation"])
            available = {v["name"] for v in value["metadata"]["tools"]}
            if not isinstance(selected, list) or any(
                not isinstance(v, str) or v not in available for v in selected
            ):
                raise EngineError("INVALID_REQUEST")
            value["metadata"].update(
                generation=payload["generation"] + 1,
                selected_tools=sorted(set(selected)),
                tools_selected=True,
            )
            value["selection_digest"] = digest(payload)
            return self.save(identity, value)

    def catalog(self):
        return {
            v["metadata"]["grant_id"]: {
                "enabled": v["metadata"]["status"] == "connected",
                "label": v["metadata"]["label"],
                "app_connection_id": v["metadata"]["connection_id"],
                "generation": v["metadata"]["generation"],
            }
            for v in self.items()
        }

    def specification(self, identity, generation):
        value = self.check(identity, generation)
        if value["metadata"]["status"] != "connected":
            raise EngineError("CONNECTOR_UNAVAILABLE")
        # ACP validation accepts extension metadata. Native durable state contains
        # only its fingerprint and schemas, never this private transport payload.
        return {
            "name": grant_id(identity),
            "type": "http",
            "url": value["metadata"]["url"] or "https://stdio.invalid/mcp",
            "headers": [],
            "_nma_app": {"connection_id": identity, "generation": generation},
            "_nma_configuration": self.fingerprint(value),
        }

    def fingerprint(self, value):
        options_file = os.environ.get("NMA_APP_OPTIONS_FILE")
        options = (
            json.loads(Path(options_file).read_text())
            .get(self.owner, {})
            .get(value["metadata"]["connection_id"], {})
            if options_file
            else {}
        )
        profiles_file = os.environ.get("NMA_APP_SERVERS_FILE")
        profile = (
            json.loads(Path(profiles_file).read_text()).get(
                value.get("stdio_profile"), {}
            )
            if profiles_file
            else {}
        )
        return digest([options, profile, value["metadata"].get("schema_fingerprint")])

    def discovered(self, identity, generation, tools, protocol):
        if redact(tools) != tools:
            raise EngineError("CREDENTIAL_METADATA_REJECTED")
        with self.vault.locked(identity):
            value = self.check(identity, generation)
            value["metadata"].update(
                status="connected",
                tools=tools,
                error=None,
                schema_fingerprint=digest(tools),
                protocol=protocol,
            )
            return self.save(identity, value)
