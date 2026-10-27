"""Authenticated web callbacks over the unchanged native MCP OAuth worker."""

import threading
import time
from urllib.parse import urlsplit
from uuid import uuid4

from ngertiin_engine.contracts import EngineError, digest, uuid
from ngertiin_engine.provider_secrets import Vault


class AppAuth:
    def __init__(self, apps):
        self.apps = apps
        self.journal = Vault(apps.home, apps.owner, directory="app-auth")
        self.flows = {}
        self.lock = threading.RLock()

    def start(self, payload):
        if set(payload) != {"connection_id", "redirect_uri", "session_binding"}:
            raise EngineError("INVALID_REQUEST")
        identity = uuid(payload["connection_id"])
        value = self.apps.read(identity)
        if (
            value["metadata"]["auth_method"] != "oauth"
            or value["metadata"]["transport"] != "http"
        ):
            raise EngineError("INVALID_REQUEST")
        if value["metadata"]["application"] == "github" and not value.get(
            "oauth_client_id"
        ):
            raise EngineError("APP_OAUTH_CLIENT_REQUIRED")
        if value["metadata"].get("builtin_mcp") == "google_standard_api" and not (
            value.get("oauth_client_id") and value.get("oauth_client_secret")
        ):
            raise EngineError("APP_GOOGLE_OAUTH_REQUIRED")
        redirect = urlsplit(payload["redirect_uri"])
        if (
            redirect.path != "/connections"
            or redirect.query
            or redirect.fragment
            or redirect.username
            or redirect.scheme not in {"https", "http"}
        ):
            raise EngineError("INVALID_ENDPOINT")
        generation = value["metadata"]["generation"]
        from tools.connectors import mcp_oauth
        from tools.mcp_dashboard_oauth import DashboardOAuthFlow

        attempt = str(uuid4())
        name = self.apps.token_name(identity, generation)
        from ngertiin_engine.app_runtime import register_reference

        register_reference(name, {"connection_id": identity, "generation": generation})
        flow = DashboardOAuthFlow(
            attempt, name, None, str(self.apps.home), payload["redirect_uri"]
        )
        saved = {
            "connection_id": identity,
            "generation": generation,
            "attempt_id": attempt,
            "session_binding": payload["session_binding"],
            "expires_at": time.time() + 600,
            "status": "starting",
        }
        self.journal.write(attempt, saved)

        def commit():
            try:
                self.apps.check(identity, generation)
            except EngineError:
                raise mcp_oauth.AttemptCanceled("Connection access changed") from None

        def done():
            try:
                if flow.status == "approved":
                    from ngertiin_engine.app_runtime import discover

                    discover(self.apps, identity, generation)
            except Exception:  # noqa: BLE001 - native discovery failures remain a distinct setup state
                # OAuth success and discovery failure are separate states.
                with self.apps.vault.locked(identity):
                    try:
                        current = self.apps.check(identity, generation)
                        current["metadata"].update(
                            status="authorized_tools_unavailable",
                            error="CONNECTOR_UNAVAILABLE",
                        )
                        self.apps.save(identity, current)
                    except EngineError:
                        pass
            finally:
                flow.nma_discovery_done = True
                with self.journal.locked(attempt):
                    state = {**self.journal.read(attempt), "status": flow.status}
                    self.journal.write(attempt, state)

        with self.lock:
            # Native commit/cancel ordering prevents an obsolete attempt committing later.
            key = (str(self.apps.home), name)
            with mcp_oauth._COMMIT_GUARD:
                prior = mcp_oauth._ACTIVE.get(key)
                if prior:
                    prior.mark_error(
                        "Replaced by a new authorization attempt", cancelled=True
                    )
                mcp_oauth._ACTIVE[key] = flow
            self.flows[attempt] = flow
            threading.Thread(
                target=mcp_oauth.run_worker,
                kwargs={
                    "hermes_home": str(self.apps.home),
                    "server_name": name,
                    "cfg": self.apps.native_config(identity, generation),
                    "reconnect_live": False,
                    "flow": flow,
                    "on_commit": commit,
                    "on_done": done,
                    "reuse_saved": True,
                },
                daemon=True,
                name="app-oauth-" + attempt,
            ).start()
        return self.status(
            {"attempt_id": attempt, "session_binding": payload["session_binding"]}
        )

    def status(self, payload, *, cancel=False):
        if set(payload) != {"attempt_id", "session_binding"}:
            raise EngineError("INVALID_REQUEST")
        identity = uuid(payload["attempt_id"])
        value = self.journal.read(identity)
        if value["session_binding"] != payload["session_binding"]:
            raise EngineError("NOT_FOUND")
        flow = self.flows.get(identity)
        if flow and (cancel or time.time() > value["expires_at"]):
            from tools.connectors.mcp_oauth import cancel_attempt

            cancel_attempt(flow)
        status = flow.status if flow else value["status"]
        if (
            flow
            and status == "approved"
            and not getattr(flow, "nma_discovery_done", False)
        ):
            status = "starting"
        if not flow and status in {"starting", "authorization_required"}:
            status = "interrupted"
        return {
            "attempt_id": identity,
            "connection_id": value["connection_id"],
            "expires_at": value["expires_at"],
            "status": status,
            "authorize_url": flow.authorization_url
            if flow and status == "authorization_required"
            else None,
            "error": "APP_AUTH_FAILED" if status == "error" else None,
        }

    def callback(self, payload):
        if set(payload) != {"attempt_id", "session_binding", "callback_url"}:
            raise EngineError("INVALID_REQUEST")
        state = self.status({k: payload[k] for k in ("attempt_id", "session_binding")})
        with self.journal.locked(state["attempt_id"]):
            saved = self.journal.read(state["attempt_id"])
            callback_digest = digest(payload["callback_url"])
            if saved.get("callback_digest") == callback_digest:
                return {
                    "attempt_id": state["attempt_id"],
                    "status": "callback_received",
                }
            flow = self.flows.get(state["attempt_id"])
            if not flow or time.time() > state["expires_at"]:
                raise EngineError("OAUTH_STATE_INVALID")
            parsed = urlsplit(payload["callback_url"])
            if parsed.scheme + "://" + parsed.netloc + parsed.path != flow.redirect_uri:
                raise EngineError("OAUTH_STATE_INVALID")
            from tools.mcp_oauth import _parse_redirect_query

            try:
                flow.deliver_callback(**_parse_redirect_query(parsed.query))
            except (TypeError, ValueError):
                raise EngineError("OAUTH_STATE_INVALID") from None
            saved["callback_digest"] = callback_digest
            self.journal.write(state["attempt_id"], saved)
        return {"attempt_id": state["attempt_id"], "status": "callback_received"}
