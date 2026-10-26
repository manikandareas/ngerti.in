"""Cryptographic identity, refresh serialization and crash-safe auth journal contracts."""

import json
import sqlite3
import threading
import time
from concurrent.futures import ThreadPoolExecutor
from types import SimpleNamespace
from urllib.parse import parse_qs, urlsplit
from uuid import uuid4

import jwt
import pytest
from cryptography.hazmat.primitives.asymmetric import rsa
from ngertiin_engine import provider_auth
from ngertiin_engine.connections import DDL, Connections
from ngertiin_engine.contracts import EngineError
from ngertiin_engine.provider_auth import ProviderAuth, validate_identity


class LocalStore:
    """Only storage/auth tests use this fixture; native execution has separate real-gateway tests."""

    def __init__(self):
        self.owner, self.lock = str(uuid4()), threading.RLock()
        self.db = sqlite3.connect(":memory:", check_same_thread=False)
        for statement in DDL:
            self.db.execute(statement)

    def write(self, operation):
        with self.lock, self.db:
            return operation(self.db)


@pytest.fixture
def auth(tmp_path, monkeypatch):
    monkeypatch.setenv("HERMES_HOME", str(tmp_path))
    monkeypatch.setenv("NMA_CHATGPT_LOCAL_OSS", "1")
    store = LocalStore()
    connections = Connections(store, tmp_path)
    result = ProviderAuth(connections, "http://127.0.0.1:1455")
    yield result
    store.db.close()


def begin(auth, provider="chatgpt", **extra):
    result = auth.start(
        {
            "provider": provider,
            "label": "Selected account",
            "session_binding": "a" * 64,
            **extra,
        }
    )
    params = {
        k: v[0]
        for k, v in parse_qs(
            urlsplit(auth.vault.read(result["attempt_id"])["authorize_url"]).query
        ).items()
    }
    result["cookies"] = {
        "nma_auth_" + result["attempt_id"].replace("-", ""): auth.vault.read(
            result["attempt_id"]
        )["browser_binding"]
    }
    return result, params


def callback(auth, result, params):
    return auth.callback(params, result["cookies"])


def test_id_token_checks_signature_issuer_audience_nonce_expiry_and_subject(
    monkeypatch,
):
    private = rsa.generate_private_key(public_exponent=65537, key_size=2048)
    foreign = rsa.generate_private_key(public_exponent=65537, key_size=2048)
    monkeypatch.setattr(
        provider_auth,
        "JWKS",
        SimpleNamespace(
            get_signing_key_from_jwt=lambda _: SimpleNamespace(key=private.public_key())
        ),
    )
    claims = {
        "iss": provider_auth.ISSUER,
        "aud": "issued-client",
        "sub": "stable-subject",
        "iat": int(time.time()),
        "exp": int(time.time()) + 600,
        "nonce": "original-nonce",
    }

    def encoded(payload, signer=private):
        return {"id_token": jwt.encode(payload, signer, algorithm="RS256")}

    assert (
        validate_identity(encoded(claims), "issued-client", "original-nonce")["sub"]
        == "stable-subject"
    )
    for patch in (
        {"iss": "https://foreign.invalid"},
        {"aud": "foreign-client"},
        {"nonce": "foreign"},
        {"exp": 1},
        {"sub": ""},
    ):
        with pytest.raises(EngineError, match="OAUTH_IDENTITY_MISMATCH"):
            validate_identity(
                encoded(claims | patch), "issued-client", "original-nonce"
            )
    with pytest.raises(EngineError):
        validate_identity(encoded(claims, foreign), "issued-client", "original-nonce")
    with pytest.raises(EngineError):
        validate_identity(
            encoded(claims),
            "issued-client",
            "original-nonce",
            {"account_id": "other", "registration_id": "issued-client"},
        )


def test_new_registration_reauthorization_and_verified_account_binding(
    auth, monkeypatch
):
    result, params = begin(auth)
    assert params["client_id"] == "dynamic_agent_client"
    host = params["ext_agent_host_id"]
    assert params["resource"] == "https://api.openai.com/v1"
    assert params["redirect_uri"] == "http://127.0.0.1:1455/auth/callback"
    exchanges = []

    def token(data):
        exchanges.append(data)
        return {
            "access_token": "synthetic-access",
            "refresh_token": "synthetic-refresh",
            "id_token": "synthetic-id",
            "expires_in": 3600,
            "scope": "openid resource.invoke chatgpt.tokens.use.direct offline_access",
        }

    monkeypatch.setattr(provider_auth, "token_request", token)
    monkeypatch.setattr(
        provider_auth, "validate_identity", lambda *args: {"sub": "verified-subject"}
    )
    assert (
        callback(
            auth,
            result,
            {
                "state": params["state"],
                "code": "single-use",
                "client_id": "issued-client",
            },
        )
        == "completed"
    )
    status = auth.status(
        {"attempt_id": result["attempt_id"], "session_binding": "a" * 64}
    )
    connection = auth.connections.get(status["connection_id"])
    assert (
        connection["account_id"] == "verified-subject"
        and connection["registration_id"] == "issued-client"
    )
    assert exchanges[0]["client_id"] == "issued-client"
    _, again = begin(auth, connection_id=connection["connection_id"])
    assert again["client_id"] == "issued-client" and again["ext_agent_host_id"] == host
    assert "agent_name_hint" not in again
    with pytest.raises(EngineError, match="OAUTH_STATE_INVALID"):
        callback(
            auth,
            result,
            {
                "state": params["state"],
                "code": "replayed",
                "client_id": "issued-client",
            },
        )
    assert len(exchanges) == 1


def test_callback_denial_expiry_cancel_and_foreign_session(auth):
    result, params = begin(auth)
    assert (
        callback(auth, result, {"state": params["state"], "error": "access_denied"})
        == "denied"
    )
    identity = result["attempt_id"]
    with pytest.raises(EngineError, match="NOT_FOUND"):
        auth.status({"attempt_id": identity, "session_binding": "b" * 64})
    result, params = begin(auth)
    pending = auth.vault.read(result["attempt_id"])
    pending["expires_at"] = 0
    auth.vault.write(result["attempt_id"], pending)
    with pytest.raises(EngineError, match="OAUTH_STATE_INVALID"):
        callback(
            auth,
            result,
            {"state": params["state"], "code": "expired", "client_id": "issued"},
        )
    assert (
        auth.status({"attempt_id": result["attempt_id"], "session_binding": "a" * 64})[
            "status"
        ]
        == "expired"
    )
    result, params = begin(auth)
    assert (
        auth.status(
            {"attempt_id": result["attempt_id"], "session_binding": "a" * 64},
            cancel=True,
        )["status"]
        == "cancelled"
    )
    with pytest.raises(EngineError):
        callback(
            auth,
            result,
            {"state": params["state"], "code": "late", "client_id": "issued"},
        )
    assert auth.connections.listing()["items"] == []


def test_rotating_refresh_has_one_writer_and_terminal_failure_requires_reconnect(
    auth, monkeypatch
):
    result, params = begin(auth)
    calls = []

    def token(data):
        calls.append(data)
        return {
            "access_token": "access-" + str(len(calls)),
            "refresh_token": "refresh-" + str(len(calls)),
            "id_token": "test-id",
            "expires_in": 3600,
            "scope": "resource.invoke chatgpt.tokens.use.direct",
        }

    monkeypatch.setattr(provider_auth, "token_request", token)
    monkeypatch.setattr(
        provider_auth, "validate_identity", lambda *args: {"sub": "verified-subject"}
    )
    callback(
        auth,
        result,
        {"state": params["state"], "code": "one-use", "client_id": "issued-client"},
    )
    identity = auth.status(
        {"attempt_id": result["attempt_id"], "session_binding": "a" * 64}
    )["connection_id"]
    value = auth.vault.read(identity)
    value["expires_at_ms"] = 0
    auth.vault.write(identity, value)
    snapshot = auth.connections.get(identity)
    with ThreadPoolExecutor(max_workers=8) as pool:
        keys = list(pool.map(lambda _: auth.connections.credential(snapshot), range(8)))
    assert set(keys) == {"access-2"} and len(calls) == 2
    assert auth.vault.read(identity)["refresh_token"] == "refresh-2"
    value = auth.vault.read(identity)
    value["expires_at_ms"] = 0
    auth.vault.write(identity, value)

    def rejected(_):
        raise EngineError("PROVIDER_RECONNECT_REQUIRED")

    monkeypatch.setattr(provider_auth, "token_request", rejected)
    with pytest.raises(EngineError, match="PROVIDER_RECONNECT_REQUIRED"):
        auth.connections.credential(snapshot)
    assert auth.connections.get(identity)["status"] == "reconnect_required"
    # The final request boundary rejects the durable disconnected state after restart.
    restored = Connections(auth.connections.store, auth.connections.home)
    with pytest.raises(EngineError, match="PROVIDER_RECONNECT_REQUIRED"):
        restored.credential(snapshot)


def test_crash_during_exchange_is_not_replayed_or_attached_to_another_owner(auth):
    result, _ = begin(auth)
    value = auth.vault.read(result["attempt_id"])
    value.update(status="exchanging", registration_id="issued-before-crash")
    auth.vault.write(result["attempt_id"], value)
    restored = ProviderAuth(
        Connections(auth.connections.store, auth.connections.home), auth.callback_base
    )
    assert (
        restored.status(
            {"attempt_id": result["attempt_id"], "session_binding": "a" * 64}
        )["status"]
        == "interrupted"
    )
    assert (
        restored.vault.read(result["attempt_id"])["registration_id"]
        == "issued-before-crash"
    )
    raw = json.loads(auth.vault.path(result["attempt_id"]).read_text())
    raw["owner_id"] = str(uuid4())
    auth.vault.path(result["attempt_id"]).write_text(json.dumps(raw))
    with pytest.raises(EngineError, match="NOT_FOUND"):
        restored.status(
            {"attempt_id": result["attempt_id"], "session_binding": "a" * 64}
        )


def test_loopback_cookie_and_retry_preserve_issued_registration(auth):
    result, params = begin(auth)
    launch = urlsplit(result["authorize_url"])
    ticket = parse_qs(launch.query)["ticket"][0]
    url, name, cookie = auth.launch(result["attempt_id"], ticket)
    assert url.startswith(provider_auth.ISSUER)
    with pytest.raises(EngineError, match="OAUTH_SESSION_INVALID"):
        auth.launch(result["attempt_id"], ticket)
    assert auth.launch(result["attempt_id"], ticket, {name: cookie})[0] == url
    with pytest.raises(EngineError, match="OAUTH_SESSION_INVALID"):
        auth.callback({"state": params["state"], "error": "access_denied"}, {})
    pending = auth.vault.read(result["attempt_id"])
    pending.update(status="exchanging", registration_id="issued-before-crash")
    auth.vault.write(result["attempt_id"], pending)
    retried = auth.retry(
        {"attempt_id": result["attempt_id"], "session_binding": "a" * 64}
    )
    original = auth.vault.read(retried["attempt_id"])
    query = parse_qs(urlsplit(original["authorize_url"]).query)
    assert query["client_id"] == ["issued-before-crash"]
    assert original["connection_id"] == pending["connection_id"]
    assert original["state"] != pending["state"]


def test_opencode_routes_keep_go_catalog_billing_and_protocol_separate():
    from ngertiin_engine.provider_manifest import PROVIDERS, opencode_route

    assert "/go/" in PROVIDERS["opencode-go"]["catalog_url"]
    assert opencode_route("opencode-zen", "qwen3.8-max")[1] == "chat_completions"
    assert opencode_route("opencode-go", "qwen3.8-max")[1] == "anthropic_messages"
    assert "/go/" in opencode_route("opencode-go", "grok-4.7")[0]
    assert opencode_route("opencode-zen", "big-pickle") is None
    assert opencode_route("opencode-zen", "undocumented-model") is None


def test_concurrent_owner_callbacks_and_restart_keep_grants_separate(
    tmp_path, monkeypatch
):
    monkeypatch.setenv("NMA_CHATGPT_LOCAL_OSS", "1")
    owners = []
    exchanges = []
    lock = threading.Lock()
    for index in range(2):
        store = LocalStore()
        home = tmp_path / str(index)
        home.mkdir()
        auth = ProviderAuth(
            Connections(store, home), f"http://127.0.0.1:{1455 + index}"
        )
        result, params = begin(auth, session_binding=str(index) * 64)
        launch = urlsplit(result["authorize_url"])
        _, name, cookie = auth.launch(
            result["attempt_id"], parse_qs(launch.query)["ticket"][0]
        )
        result["cookies"] = {name: cookie}
        # Reconstruct both writers from their durable journals before concurrent callbacks.
        restored = ProviderAuth(Connections(store, home), auth.callback_base)
        owners.append((store, restored, result, params))

    pending = {
        f"owner-{i}": (a.vault.read(r["attempt_id"]), f"subject-{i}", f"client-{i}")
        for i, (_, a, r, _) in enumerate(owners)
    }

    def token(data):
        saved, subject, client = pending[data["code"]]
        assert data["code_verifier"] == saved["verifier"]
        assert data["redirect_uri"] == saved["redirect_uri"]
        assert data["client_id"] == client
        with lock:
            exchanges.append(data["code"])
        return {
            "access_token": "access-for-" + subject,
            "refresh_token": "refresh-for-" + subject,
            "id_token": "id-token-for-" + subject,
            "expires_in": 3600,
            "scope": "openid offline_access resource.invoke chatgpt.tokens.use.direct",
        }

    monkeypatch.setattr(provider_auth, "token_request", token)
    monkeypatch.setattr(
        provider_auth,
        "validate_identity",
        lambda raw, *args: {"sub": raw["id_token"].removeprefix("id-token-for-")},
    )
    try:
        for index, (_, auth, result, params) in enumerate(owners):
            _, other, other_result, _ = owners[1 - index]
            with pytest.raises(EngineError, match="OAUTH_STATE_INVALID"):
                other.callback(
                    {"state": params["state"], "error": "access_denied"},
                    result["cookies"],
                )
            with pytest.raises(EngineError, match="OAUTH_SESSION_INVALID"):
                auth.callback(
                    {"state": params["state"], "error": "access_denied"},
                    other_result["cookies"],
                )
            assert (
                auth.status(
                    {
                        "attempt_id": result["attempt_id"],
                        "session_binding": str(index) * 64,
                    }
                )["status"]
                == "pending"
            )

        def complete(index):
            _, auth, result, params = owners[index]
            return callback(
                auth,
                result,
                {
                    "state": params["state"],
                    "code": f"owner-{index}",
                    "client_id": f"client-{index}",
                },
            )

        with ThreadPoolExecutor(max_workers=2) as pool:
            assert list(pool.map(complete, range(2))) == ["completed", "completed"]
        assert sorted(exchanges) == ["owner-0", "owner-1"]
        for index, (store, auth, result, params) in enumerate(owners):
            restored = ProviderAuth(
                Connections(store, auth.connections.home), auth.callback_base
            )
            listing = restored.connections.listing()["items"]
            assert len(listing) == 1
            selected = listing[0]
            assert selected["account_id"] == f"subject-{index}"
            assert (
                restored.connections.credential(selected)
                == f"access-for-subject-{index}"
            )
            foreign = owners[1 - index][1].connections.listing()["items"][0]
            for operation in (
                restored.connections.get,
                restored.connections.disconnect,
            ):
                with pytest.raises(EngineError, match="NOT_FOUND"):
                    operation(foreign["connection_id"])
            with pytest.raises(EngineError):
                restored.connections.credential(foreign)
            with pytest.raises(EngineError, match="OAUTH_STATE_INVALID"):
                callback(
                    restored,
                    result,
                    {
                        "state": params["state"],
                        "code": f"owner-{index}",
                        "client_id": f"client-{index}",
                    },
                )
        assert len(exchanges) == 2
    finally:
        for store, *_ in owners:
            store.db.close()
