"""An old relay credential cannot borrow another admission or execution generation."""

import sqlite3
from types import SimpleNamespace
from urllib.parse import urlsplit

import pytest
from ngertiin_engine.contracts import EngineError
from ngertiin_engine.provider_transport import ProviderTransport


@pytest.mark.parametrize(
    ("run", "generation", "epoch", "stopped", "expected"),
    [
        ("old", 1, 7, False, "STALE_GENERATION"),
        ("current", 1, 7, False, "STALE_GENERATION"),
        ("current", 2, 6, False, "STALE_GENERATION"),
        ("current", 2, 7, True, "RUN_CANCELLED"),
        (None, 2, 7, False, "ACCESS_REVOKED"),
    ],
)
def test_relay_rejects_stale_work_before_provider_dispatch(
    run, generation, epoch, stopped, expected, monkeypatch
):
    db = sqlite3.connect(":memory:")
    db.executescript(
        """
        CREATE TABLE nma_adapter_runs(owner_id, run_id, operation_id, binding_id);
        CREATE TABLE nma_adapter_bindings(owner_id, binding_id, native_session_id, config);
        CREATE TABLE session_admissions(admission_id, request_id, target_session_id, principal_id, status, owner_epoch, generation);
        CREATE TABLE nma_run_stops(owner_id, run_id);
        CREATE TABLE nma_agent_run_fences(owner_id, run_id);
        CREATE TABLE nma_context_run_fences(owner_id, run_id);
        INSERT INTO nma_adapter_bindings VALUES('owner','binding','session','{}');
        INSERT INTO nma_adapter_runs VALUES('owner','old','old','binding'),('owner','current','current','binding');
        INSERT INTO session_admissions VALUES('old','nma:old','session','nma:owner','terminal',7,1),('current','nma:current','session','nma:owner','started',7,2);
        """
    )
    if stopped:
        db.execute("INSERT INTO nma_run_stops VALUES('owner','current')")
    store = SimpleNamespace(
        owner="owner",
        authority=SimpleNamespace(epoch=7),
        write=lambda operation: operation(db),
    )
    relay = ProviderTransport.__new__(ProviderTransport)
    relay.connections = SimpleNamespace(store=store)
    relay.key, relay.routes, relay.base = (
        b"disposable-relay-key",
        {},
        "http://127.0.0.1:1",
    )
    snapshot = {
        "model": "example",
        "provider_id": "custom",
        "protocol": "chat_completions",
    }
    _, runtime = relay.runtime(
        snapshot,
        "thread",
        run,
        "session",
        {
            "admission_id": run or "current",
            "execution_generation": generation,
            "authority_epoch": epoch,
        },
    )
    handler = SimpleNamespace(
        path=urlsplit(runtime["base_url"]).path + "/chat/completions",
        headers={"Authorization": "Bearer " + runtime["api_key"]},
    )

    def no_dispatch(*args, **kwargs):
        pytest.fail("Stale work reached the upstream provider")

    monkeypatch.setattr("ngertiin_engine.provider_transport.httpx.Client", no_dispatch)
    try:
        with pytest.raises(EngineError) as failure:
            relay.forward(handler)
        assert failure.value.code == expected
    finally:
        db.close()
