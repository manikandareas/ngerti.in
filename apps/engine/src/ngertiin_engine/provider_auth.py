"""Durable product login state around pinned native PKCE and JWT primitives."""

import hashlib
import hmac
import os
import secrets
import time
from urllib.parse import urlencode
from uuid import uuid4

import httpx
import jwt

from ngertiin_engine.contracts import EngineError, uuid
from ngertiin_engine.provider_manifest import PROVIDERS

ISSUER = "https://auth.openai.com"
RESOURCE = "https://api.openai.com/v1"
TOKEN_URL = ISSUER + "/api/accounts/oauth/token"
DISCOVERY = ISSUER + "/.well-known/openid-configuration"
JWKS = jwt.PyJWKClient(ISSUER + "/.well-known/jwks.json", timeout=15)


def token_request(data):
    try:
        with httpx.Client(
            timeout=20, follow_redirects=False, trust_env=False
        ) as client:
            response = client.post(TOKEN_URL, data=data)
        if response.is_error:
            error = response.json().get("error")
            raise EngineError(
                "PROVIDER_RECONNECT_REQUIRED"
                if error
                in {
                    "invalid_grant",
                    "invalid_client",
                    "access_denied",
                    "session_expired",
                }
                else "PROVIDER_UNAVAILABLE"
            )
        value = response.json()
        if not isinstance(value.get("access_token"), str) or not value["access_token"]:
            raise EngineError("INVALID_PROVIDER_RESPONSE")
        return value
    except (httpx.HTTPError, ValueError):
        raise EngineError("PROVIDER_UNAVAILABLE") from None


def exchange_openrouter(code, verifier):
    from hermes_cli.auth_constants import OPENROUTER_AUTH_KEYS_URL

    # The pinned native helper discards user_id. Retain the documented identity in this narrow adapter.
    try:
        with httpx.Client(
            timeout=20, follow_redirects=False, trust_env=False
        ) as client:
            response = client.post(
                OPENROUTER_AUTH_KEYS_URL,
                json={
                    "code": code,
                    "code_verifier": verifier,
                    "code_challenge_method": "S256",
                },
            )
        if response.is_error:
            raise EngineError("OAUTH_EXCHANGE_FAILED")
        value = response.json()
        if not isinstance(value.get("key"), str) or not value["key"]:
            raise EngineError("OAUTH_EXCHANGE_FAILED")
        return value
    except (httpx.HTTPError, ValueError):
        raise EngineError("OAUTH_EXCHANGE_FAILED") from None


def native_token_fields(raw, previous=None):
    from hermes_cli.auth_oauth_pkce_plugin import _token_fields

    return _token_fields("chatgpt", raw, previous or {}, "oauth_token_invalid")


def validate_identity(raw, client_id, nonce, previous=None):
    try:
        encoded = raw["id_token"]
        key = JWKS.get_signing_key_from_jwt(encoded)
        identity = jwt.decode(
            encoded,
            key.key,
            algorithms=["RS256"],
            audience=client_id,
            issuer=ISSUER,
            leeway=5,
            options={"require": ["sub", "exp", "iat", "nonce"]},
        )
        if (
            not isinstance(identity["sub"], str)
            or not identity["sub"]
            or not hmac.compare_digest(identity["nonce"], nonce)
        ):
            raise ValueError
        if previous and (
            previous["account_id"] != identity["sub"]
            or previous["registration_id"] != client_id
        ):
            raise ValueError
        return identity
    except (jwt.PyJWTError, KeyError, TypeError, ValueError):
        raise EngineError("OAUTH_IDENTITY_MISMATCH") from None


def refresh_chatgpt(value):
    if (value.get("expires_at_ms") or 0) > time.time() * 1000 + 60000:
        return value
    if not value.get("refresh_token"):
        raise EngineError("PROVIDER_RECONNECT_REQUIRED")
    raw = token_request(
        {
            "grant_type": "refresh_token",
            "refresh_token": value["refresh_token"],
            "client_id": value["metadata"]["registration_id"],
            "resource": RESOURCE,
        }
    )
    scopes = raw.get("scope", " ".join(value["scopes"])).split()
    if not {"resource.invoke", "chatgpt.tokens.use.direct"} <= set(scopes):
        raise EngineError("PROVIDER_RECONNECT_REQUIRED")
    value.update(native_token_fields(raw, value), scopes=scopes)
    # Refresh does not establish a different account; a new ID token is validated on login.
    value["metadata"]["credential_version"] += 1
    return value


def revoke_chatgpt(value):
    try:
        with httpx.Client(
            timeout=10, follow_redirects=False, trust_env=False
        ) as client:
            discovery = client.get(DISCOVERY)
            discovery.raise_for_status()
            url = discovery.json()["revocation_endpoint"]
            if not url.startswith(ISSUER + "/"):
                return "not_confirmed"
            response = client.post(
                url,
                data={
                    "token": value["refresh_token"],
                    "token_type_hint": "refresh_token",
                    "client_id": value["metadata"]["registration_id"],
                },
            )
            return "confirmed" if response.status_code == 200 else "not_confirmed"
    except (httpx.HTTPError, ValueError, KeyError):
        return "not_confirmed"


class ProviderAuth:
    def __init__(self, connections, callback_base):
        self.connections, self.vault = connections, connections.vault
        self.callback_base = callback_base

    def start(self, p, *, registration=None, resume=False):
        from hermes_cli.auth_device_flow import (
            _pkce_code_challenge,
            _pkce_code_verifier,
        )

        if set(p) - {"provider", "connection_id", "label", "session_binding"}:
            raise EngineError("INVALID_REQUEST")
        provider, label = p.get("provider"), p.get("label")
        if (
            provider not in {"chatgpt", "openrouter"}
            or not isinstance(label, str)
            or not 1 <= len(label.strip()) <= 100
        ):
            raise EngineError("INVALID_REQUEST")
        if provider == "chatgpt" and os.environ.get("NMA_CHATGPT_LOCAL_OSS") != "1":
            raise EngineError("PROVIDER_DEPLOYMENT_UNVERIFIED")
        binding = p.get("session_binding")
        if not isinstance(binding, str) or len(binding) != 64:
            raise EngineError("UNAUTHENTICATED")
        identity = uuid(p["connection_id"]) if p.get("connection_id") else str(uuid4())
        previous = None
        if p.get("connection_id"):
            try:
                previous = self.connections.get(identity)
            except EngineError as exc:
                if exc.code != "NOT_FOUND" or not resume:
                    raise
            if previous and previous["provider"] != provider:
                raise EngineError("CONNECTION_IDENTITY_CONFLICT")
        attempt = str(uuid4())
        state, nonce, verifier = (
            secrets.token_urlsafe(32),
            secrets.token_urlsafe(32),
            _pkce_code_verifier(),
        )
        redirect = self.callback_base + "/auth/callback"
        if provider == "openrouter":
            redirect += "/" + state
        value = {
            "kind": "login",
            "provider": provider,
            "connection_id": identity,
            "state": state,
            "nonce": nonce,
            "verifier": verifier,
            "redirect_uri": redirect,
            "session_binding": binding,
            "label": label.strip(),
            "status": "pending",
            "expires_at": int(time.time()) + 600,
            "registration_id": previous["registration_id"]
            if previous
            else registration,
        }
        params = {
            "state": state,
            "code_challenge": _pkce_code_challenge(verifier),
            "code_challenge_method": "S256",
        }
        if provider == "chatgpt":
            host_file = self.connections.home / "provider-host.json"
            import json

            from hermes_cli.auth import _save_private_json

            if not host_file.exists():
                _save_private_json(
                    host_file, {"host_id": "urn:uuid:" + str(uuid4())}, fsync_dir=True
                )
            params.update(
                client_id=value["registration_id"] or "dynamic_agent_client",
                response_type="code",
                redirect_uri=redirect,
                nonce=nonce,
                resource=RESOURCE,
                ext_agent_host_id=json.loads(host_file.read_text())["host_id"],
                scope="openid profile email offline_access resource.invoke chatgpt.tokens.use.direct",
            )
            if not value["registration_id"]:
                params["agent_name_hint"] = "Ngertiin"
            # Keep retained identity hints server-side; reauthorization may show account selection.
            url = ISSUER + "/api/accounts/authorize"
        else:
            params.update(callback_url=redirect, key_label="Ngertiin")
            url = "https://openrouter.ai/auth"
        value["authorize_url"] = url + "?" + urlencode(params)
        value["launch_token"] = secrets.token_urlsafe(32)
        value["browser_binding"] = secrets.token_urlsafe(32)
        self.vault.write(attempt, value)
        return {
            "attempt_id": attempt,
            "authorize_url": self.callback_base
            + "/auth/start/"
            + attempt
            + "?ticket="
            + value["launch_token"],
            "expires_at": value["expires_at"],
            "status": "pending",
        }

    def status(self, p, *, cancel=False):
        if set(p) != {"attempt_id", "session_binding"}:
            raise EngineError("INVALID_REQUEST")
        identity = uuid(p["attempt_id"])
        with self.vault.locked(identity):
            value = self.vault.read(identity)
            if (
                value.get("kind") != "login"
                or value["session_binding"] != p["session_binding"]
            ):
                raise EngineError("NOT_FOUND")
            if value["status"] == "pending" and (
                cancel or value["expires_at"] <= time.time()
            ):
                value["status"] = "cancelled" if cancel else "expired"
                value.pop("verifier", None)
                self.vault.write(identity, value)
            if value["status"] == "exchanging":
                # Unknown token-exchange outcome is never blindly retried after a crash.
                value["status"] = "interrupted"
                self.vault.write(identity, value)
            return {
                "attempt_id": identity,
                "status": value["status"],
                "connection_id": value["connection_id"],
                "error": value.get("error"),
                "expires_at": value["expires_at"],
            }

    def retry(self, p):
        self.status(p)
        prior = self.vault.read(p["attempt_id"])
        if prior["status"] not in {
            "failed",
            "interrupted",
            "denied",
            "expired",
            "cancelled",
        }:
            raise EngineError("INVALID_TRANSITION")
        return self.start(
            {
                "provider": prior["provider"],
                "label": prior["label"],
                "connection_id": prior["connection_id"],
                "session_binding": p["session_binding"],
            },
            registration=prior.get("registration_id"),
            resume=True,
        )

    def launch(self, identity, ticket, cookies=None):
        identity = uuid(identity)
        with self.vault.locked(identity):
            value = self.vault.read(identity)
            if (
                value.get("kind") != "login"
                or value["status"] != "pending"
                or value["expires_at"] <= time.time()
            ):
                raise EngineError("OAUTH_STATE_INVALID")
            if not isinstance(ticket, str) or not hmac.compare_digest(
                value["launch_token"], ticket
            ):
                raise EngineError("OAUTH_STATE_INVALID")
            name = "nma_auth_" + identity.replace("-", "")
            if value.get("launched") and (
                not isinstance(cookies, dict)
                or not hmac.compare_digest(
                    cookies.get(name, ""), value["browser_binding"]
                )
            ):
                raise EngineError("OAUTH_SESSION_INVALID")
            value["launched"] = True
            self.vault.write(identity, value)
            return (
                value["authorize_url"],
                "nma_auth_" + identity.replace("-", ""),
                value["browser_binding"],
            )

    def callback(self, params, cookies=None):
        state = params.get("state")
        if not isinstance(state, str) or not 20 <= len(state) <= 200:
            raise EngineError("OAUTH_STATE_INVALID")
        for path in self.vault.root.glob("*.json"):
            value = self.vault.read(path.stem)
            if value.get("kind") == "login" and hmac.compare_digest(
                value["state"], state
            ):
                with self.vault.locked(path.stem):
                    value = self.vault.read(path.stem)
                    if (
                        value["status"] != "pending"
                        or value["expires_at"] <= time.time()
                    ):
                        raise EngineError("OAUTH_STATE_INVALID")
                    expected_cookie = "nma_auth_" + path.stem.replace("-", "")
                    if not isinstance(cookies, dict) or not hmac.compare_digest(
                        cookies.get(expected_cookie, ""), value["browser_binding"]
                    ):
                        raise EngineError("OAUTH_SESSION_INVALID")
                    if params.get("error"):
                        value.update(status="denied", error="OAUTH_DENIED")
                    else:
                        value["status"] = "exchanging"
                        # Persist registration before the irreversible, one-use code exchange.
                        issued = params.get("client_id")
                        if value["provider"] == "chatgpt":
                            if (
                                value["registration_id"]
                                and issued
                                and issued != value["registration_id"]
                            ) or not (issued or value["registration_id"]):
                                raise EngineError("OAUTH_IDENTITY_MISMATCH")
                            value["registration_id"] = (
                                issued or value["registration_id"]
                            )
                        self.vault.write(path.stem, value)
                        try:
                            self.complete(value, params)
                            value["status"] = "completed"
                        except EngineError as exc:
                            value.update(status="failed", error=exc.code)
                    value.pop("verifier", None)
                    self.vault.write(path.stem, value)
                    return value["status"]
        raise EngineError("OAUTH_STATE_INVALID")

    def complete(self, pending, params):
        identity, provider = pending["connection_id"], pending["provider"]
        code = params.get("code")
        if not isinstance(code, str) or not 1 <= len(code) <= 8192:
            raise EngineError("OAUTH_CODE_INVALID")
        with self.vault.locked(identity):
            try:
                previous = self.connections.get(identity)
            except EngineError as exc:
                if exc.code != "NOT_FOUND":
                    raise
                previous = None
            if provider == "openrouter":
                grant = exchange_openrouter(code, pending["verifier"])
                credentials = {"api_key": grant["key"]}
                grant_id = hashlib.sha256(grant["key"].encode()).hexdigest()
                subject = grant.get("user_id") or grant_id
                if (
                    not isinstance(subject, str)
                    or not subject
                    or (previous and previous["account_id"] != subject)
                ):
                    raise EngineError("CONNECTION_IDENTITY_CONFLICT")
            else:
                raw = token_request(
                    {
                        "grant_type": "authorization_code",
                        "client_id": pending["registration_id"],
                        "code": code,
                        "code_verifier": pending["verifier"],
                        "redirect_uri": pending["redirect_uri"],
                        "resource": RESOURCE,
                    }
                )
                claims = validate_identity(
                    raw, pending["registration_id"], pending["nonce"], previous
                )
                scopes = str(raw.get("scope", "")).split()
                if not {"resource.invoke", "chatgpt.tokens.use.direct"} <= set(scopes):
                    raise EngineError("PROVIDER_ENTITLEMENT_REQUIRED")
                credentials = {
                    **native_token_fields(raw),
                    "id_token": raw["id_token"],
                    "scopes": scopes,
                }
                subject = claims["sub"]
            spec = PROVIDERS[provider]
            metadata = {
                "connection_id": identity,
                "provider": provider,
                "label": pending["label"],
                "account_id": subject,
                "registration_id": pending["registration_id"],
                "workspace_id": None,
                "base_url": spec["base_url"],
                "protocol": spec["protocol"],
                "billing": spec["billing"],
                "auth_method": "oauth",
                "generation": (previous or {}).get("generation", 0) + 1,
                "credential_version": (previous or {}).get("credential_version", 0) + 1,
                "status": "configured",
                "catalog_status": "not_checked",
                "models": [],
                "remote_revocation": "not_requested",
                "workload": "general",
            }
            if provider == "openrouter":
                metadata["grant_id"] = grant_id
                metadata["identity_kind"] = (
                    "provider_user" if grant.get("user_id") else "opaque_grant"
                )
            self.connections.commit(identity, {**credentials, "metadata": metadata})
