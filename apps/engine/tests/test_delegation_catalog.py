"""Large account catalogs must not inflate provider tool schemas."""

import pytest


def test_large_catalog_schema_and_unknown_reference(monkeypatch):
    from agent import delegation_registry
    from agent.delegation_provider import DelegationRouteError
    from ngertiin_engine import delegation

    captured = []

    class Registered(Exception):
        pass

    def register(provider):
        captured.append(provider)
        raise Registered

    selected = {
        "nma_delegation_models": {f"connection:model-{i}": {} for i in range(1200)},
        "nma_capabilities": {"toolsets": ["todo"]},
    }
    monkeypatch.setattr(delegation_registry, "register_provider", register)
    monkeypatch.setattr(delegation, "policy_config", lambda: selected)
    with pytest.raises(Registered):
        delegation.install()
    provider = captured[0]
    schema = provider.task_parameters({})
    assert "enum" not in schema["model_ref"]
    assert schema["allowed_toolsets"]["items"]["enum"] == ["todo"]
    monkeypatch.setattr(delegation, "check", lambda: (selected, {}))
    with pytest.raises(DelegationRouteError, match="no child was started"):
        provider.route_task({"model_ref": "other-owner:unknown"}, {})
