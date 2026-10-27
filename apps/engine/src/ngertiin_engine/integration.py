"""Ordered installation of the exact-pin native adaptations.

Native plugins at this pin fail open after middleware errors, so authorization
and durable effects retain final-dispatch wrappers. This module owns installation
order and checks the signatures before any wrapper can obscure them.
"""

import inspect

from ngertiin_engine.contracts import EngineError

_installed = False


def require_signature(function, names):
    if not set(names) <= set(inspect.signature(function).parameters):
        raise EngineError("RUNTIME_SEAM_MISMATCH", {"seam": function.__qualname__})


def install(database, owner):
    global _installed
    if _installed:
        raise EngineError("RUNTIME_ALREADY_INSTALLED")
    from ngertiin_engine.plugins import install_scope_guard

    install_scope_guard(database, owner)
    import model_tools
    from gateway import run
    from gateway.session_events import SessionEvents
    from gateway.session_local import stage_local_session
    from hermes_state import SessionDB

    for function, names in (
        (
            model_tools._execute_tool,
            ("function_name", "function_args", "original_args", "ids"),
        ),
        (SessionEvents.publish, ("session_id", "payload", "event_type", "execution")),
        (
            stage_local_session,
            ("authority", "actor", "params", "trusted_policy", "skills_prompt"),
        ),
        (
            run.GatewayRunner._run_agent,
            ("message", "context_prompt", "history", "source", "session_id"),
        ),
        (SessionDB._append_messages_in_transaction, ("conn", "session_id", "messages")),
    ):
        require_signature(function, names)

    from ngertiin_engine import (
        artifacts,
        browser_vault,
        capabilities,
        coding,
        computer,
        context_references,
        diagnostics,
        goals,
        native_surface,
        redaction,
        screens,
        session_settings,
    )

    redaction.install()
    from ngertiin_engine import app_interactions, app_runtime, research

    app_runtime.install()
    research.install()
    app_interactions.install()
    browser_vault.install()
    capabilities.install_dispatch_guard(database, owner)
    capabilities.install_discovery_guard()
    goals.install()
    from ngertiin_engine import learning

    learning.install()
    artifacts.install()
    coding.install()
    screens.install()
    computer.install()
    diagnostics.install_usage()
    context_references.install(database, owner)
    session_settings.install()
    native_surface.install()
    _installed = True


def install_runner(runner, owner):
    from ngertiin_engine.reliability import install as install_reliability

    install_reliability(runner, owner)
    from ngertiin_engine.app_interactions import attach

    attach(runner, owner)
