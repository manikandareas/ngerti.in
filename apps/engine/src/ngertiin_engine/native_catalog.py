"""Source-backed, operator-configured native bundles and readiness diagnostics."""

import os

from ngertiin_engine.contracts import EngineError, digest
from ngertiin_engine.redaction import result as redact

# Execution surfaces describe deployment prerequisites, never agent autonomy.
HISTORICAL_PRODUCT_TOOLS = {
    "todo": ["todo_list"],
    "nma_workspace": ["workspace"],
    "nma_computer": ["computer"],
}
PRODUCT_SURFACES = set(HISTORICAL_PRODUCT_TOOLS)
EXCLUDED = {"send_message"}


def unchanged_historical_bundle(bundle):
    """Recognize the original permission boundary when retaining stored grants."""
    return (
        bundle["tools"] == HISTORICAL_PRODUCT_TOOLS.get(bundle["toolset"])
        and not bundle["requires"]
        and bundle["execution_surface"] is None
        and not bundle["plugin"]
    )


def inspect_bundle(key, entry, data, visiting=()):
    from tools.registry import registry
    from toolsets import resolve_toolset, validate_toolset

    if key in visiting:
        raise EngineError("CAPABILITY_DEPENDENCY_CYCLE", {"capability": key})
    name = entry.get("toolset")
    if not isinstance(name, str) or name in {"all", "*"} or not validate_toolset(name):
        raise EngineError(
            "CAPABILITY_UNAVAILABLE", {"capability": key, "reason": "not_installed"}
        )
    names = sorted(resolve_toolset(name))
    if not names or EXCLUDED.intersection(names):
        raise EngineError(
            "CAPABILITY_UNAVAILABLE", {"capability": key, "reason": "excluded_surface"}
        )
    surface = entry.get("execution_surface")
    surface_spec = {}
    # Existing product bundles retain their already-scoped integrations. New native
    # bundles must explicitly declare their reviewed deployment boundary.
    if name not in PRODUCT_SURFACES or surface is not None:
        surfaces = data.get("execution_surfaces", {})
        spec = surfaces.get(surface, {}) if isinstance(surface, str) else {}
        if not isinstance(spec, dict) or spec.get("ready") is not True:
            raise EngineError(
                "CAPABILITY_UNAVAILABLE",
                {"capability": key, "reason": "execution_surface_required"},
            )
        surface_spec = spec
        if spec.get("kind") == "scoped_linux":
            from ngertiin_engine.native_surface import verify_image

            verify_image(spec.get("image"))
        elif spec.get("kind") != "trusted_plugin" or not entry.get("plugin"):
            raise EngineError(
                "CAPABILITY_UNAVAILABLE",
                {"capability": key, "reason": "execution_surface_required"},
            )
    dependencies = entry.get("requires", [])
    if not isinstance(dependencies, list) or any(
        not isinstance(d, str) for d in dependencies
    ):
        raise EngineError(
            "CAPABILITY_UNAVAILABLE",
            {"capability": key, "reason": "invalid_dependencies"},
        )
    for dependency in dependencies:
        candidate = data.get("tool_grants", {}).get(dependency, {})
        if candidate.get("enabled") is not True:
            raise EngineError(
                "CAPABILITY_UNAVAILABLE",
                {
                    "capability": key,
                    "reason": "dependency_unconfigured",
                    "dependency": dependency,
                },
            )
        inspect_bundle(dependency, candidate, data, (*visiting, key))
    entries = [registry.get_entry(n) for n in names]
    if any(e is None for e in entries):
        raise EngineError(
            "CAPABILITY_UNAVAILABLE", {"capability": key, "reason": "not_installed"}
        )
    required_env = sorted({v for e in entries for v in e.requires_env})
    from ngertiin_engine.redaction import remember

    for variable in required_env:
        remember({"api_key": os.environ.get(variable)})
    if surface_spec.get("kind") != "scoped_linux" and any(
        not os.environ.get(v) for v in required_env
    ):
        raise EngineError(
            "CAPABILITY_UNAVAILABLE",
            {"capability": key, "reason": "configuration_required"},
        )
    definitions = (
        [
            {"type": "function", "function": {**e.schema, "name": e.name}}
            for e in entries
        ]
        if surface_spec.get("kind") == "scoped_linux"
        else registry.get_definitions(set(names), quiet=True)
    )
    if len(definitions) != len(names):
        raise EngineError(
            "CAPABILITY_UNAVAILABLE",
            {"capability": key, "reason": "native_prerequisite_failed"},
        )
    if redact(definitions) != definitions:
        raise EngineError(
            "CAPABILITY_UNAVAILABLE", {"capability": key, "reason": "private_schema"}
        )
    plugin = entry.get("plugin")
    if plugin:
        from ngertiin_engine.plugins import verify_selected

        verify_selected(plugin)
    return {
        "toolset": name,
        "tools": names,
        "schemas": {d["function"]["name"]: digest(d["function"]) for d in definitions},
        "requires": dependencies,
        "execution_surface": surface,
        "execution_surface_fingerprint": digest(surface_spec),
        "plugin": plugin,
    }


def public_bundle(key, entry, data):
    state = {
        "id": key,
        "label": entry.get("label", key),
        "configured": entry.get("enabled") is True,
    }
    try:
        bundle = inspect_bundle(key, entry, data)
        state.update(
            installed=True, runtime_ready=state["configured"], reason=None, **bundle
        )
    except EngineError as exc:
        reason = exc.details.get("reason", exc.code)
        state.update(
            installed=reason != "not_installed", runtime_ready=False, reason=reason
        )
    return state
