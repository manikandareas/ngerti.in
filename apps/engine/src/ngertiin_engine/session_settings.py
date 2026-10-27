"""Validated native context settings frozen with each product configuration."""

import json
import math

from ngertiin_engine.contracts import EngineError


def validate(value):
    if not isinstance(value, dict) or set(value) - {
        "max_turns",
        "compression",
        "context_engine",
    }:
        raise EngineError("INVALID_CONFIGURATION")
    turns = value.get("max_turns")
    if turns is not None and (type(turns) is not int or turns < 0):
        raise EngineError("INVALID_CONFIGURATION")
    engine = value.get("context_engine", "compressor")
    # Plugins are selected by the operator's installed native configuration,
    # never by accepting an import path from an agent or a browser request.
    if engine != "compressor":
        raise EngineError("CONTEXT_ENGINE_UNAVAILABLE")
    compression = value.get("compression", {})
    if not isinstance(compression, dict) or set(compression) - {
        "enabled",
        "threshold",
        "threshold_tokens",
        "micro_compact",
        "micro_compact_every_n_turns",
        "micro_compact_defrag_threshold_tokens",
    }:
        raise EngineError("INVALID_CONFIGURATION")
    for key, item in compression.items():
        if key in {"enabled", "micro_compact"}:
            valid = type(item) is bool
        elif key == "threshold":
            valid = type(item) in (int, float) and math.isfinite(item) and 0 < item < 1
        else:
            valid = type(item) is int and item > 0
        if not valid:
            raise EngineError("INVALID_CONFIGURATION")
    return {"max_turns": turns, "compression": compression, "context_engine": engine}


def frozen(value):
    settings = validate(value)
    return {
        "agent": {"max_turns": settings["max_turns"]},
        "compression": settings["compression"],
        "context": {"engine": settings["context_engine"]},
    }


def install():
    """Give native config readers the frozen assignment in in-process turns.

    The native managed worker already binds this snapshot process-wide. Its
    in-process policy scope binds tools and auxiliary tasks but does not bind
    config readers. Adapt the same native snapshot seam with a task-local policy;
    native defaults/merging and compression remain entirely upstream-owned.
    """
    import inspect

    from gateway.session_policy import active_policy
    from hermes_cli import config

    original = config._worker_config_snapshot
    if inspect.signature(original).parameters:
        raise EngineError("RUNTIME_SEAM_MISMATCH")

    def snapshot():
        policy = active_policy()
        if policy is not None and not policy.follows_profile:
            frozen = json.loads(policy.config_json)
            if any(
                name in frozen
                for name in (
                    "nma_context",
                    "nma_persona",
                    "nma_capabilities",
                    "nma_provider",
                )
            ):
                # Model transport is resolved separately through the scoped
                # credential relay. Exposing the upstream URL to generic config
                # readers permits unauthenticated local-server metadata probes.
                # Keep selection metadata, but never an alternate network route.
                if isinstance(frozen.get("model"), dict):
                    frozen["model"] = {**frozen["model"], "base_url": ""}
                from ngertiin_engine.research import _settings

                if _settings.get() is not None:
                    frozen["web"] = _settings.get()
                from ngertiin_engine.skill_packages import settings

                if settings.get() is not None:
                    frozen["skills"] = settings.get()
                return frozen
        return original()

    config._worker_config_snapshot = snapshot
