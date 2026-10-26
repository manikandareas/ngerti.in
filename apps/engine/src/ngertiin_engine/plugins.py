"""Pinned native plugin installation for the trusted partition operator."""

import argparse
import hashlib
import importlib.metadata
import json
import os
import re
import shutil
import sqlite3
import tempfile
from functools import wraps
from pathlib import Path

from ngertiin_engine.contracts import EngineError, digest


def install_scope_guard(database, owner):
    """Bind native extension callbacks to the same live capability authority."""
    import inspect

    from hermes_cli.plugins import PluginContext

    original = PluginContext._track_callback
    subscribe = PluginContext.subscribe

    def permitted(plugin_id):
        from gateway.session_policy import active_policy

        from ngertiin_engine.capabilities import authorize, catalog

        policy = active_policy()
        marker = (
            policy.config(secrets=False).get("nma_capabilities") if policy else None
        )
        if marker is None:
            return True
        authorize(marker, database, owner)
        data = catalog().get("tool_grants", {})
        return any(
            data.get(key, {}).get("plugin", {}).get("id") == plugin_id
            for key in marker["grants"].get("tool_grants", [])
        )

    def scoped(plugin_id, callback):
        if inspect.iscoroutinefunction(callback):

            @wraps(callback)
            async def asynchronous(*args, **kwargs):
                if permitted(plugin_id):
                    return await callback(*args, **kwargs)

            return asynchronous

        @wraps(callback)
        def synchronous(*args, **kwargs):
            if permitted(plugin_id):
                return callback(*args, **kwargs)

        return synchronous

    def track(context, kind, key, callback, mapping, valid):
        return original(
            context, kind, key, scoped(context.plugin_id, callback), mapping, valid
        )

    def events(context, event, callback):
        return subscribe(context, event, scoped(context.plugin_id, callback))

    def excluded(context, *args, **kwargs):
        raise EngineError("PLUGIN_EXCLUDED_SURFACE")

    PluginContext._track_callback = track
    PluginContext.subscribe = events
    PluginContext.register_platform = excluded
    PluginContext.register_platform_handler = excluded
    PluginContext.register_slack_action_handler = excluded
    PluginContext.register_telegram_handler = excluded


def fingerprint(directory):
    files = {}
    for path in sorted(directory.rglob("*")):
        if path.is_symlink():
            raise EngineError("PLUGIN_UNSAFE_PATH")
        if path.is_file() and "__pycache__" not in path.parts and path.suffix != ".pyc":
            files[str(path.relative_to(directory))] = hashlib.sha256(
                path.read_bytes()
            ).hexdigest()
    return digest(files)


def manifest(directory):
    from utils import fast_safe_load

    path = directory / "plugin.yaml"
    value = fast_safe_load(path.read_text())
    if not isinstance(value, dict) or not re.fullmatch(
        r"[a-z][a-z0-9_-]{0,63}", str(value.get("name", ""))
    ):
        raise EngineError("PLUGIN_INVALID_MANIFEST")
    if not value.get("version") or not value.get("license"):
        raise EngineError("PLUGIN_PROVENANCE_REQUIRED")
    if value.get("kind", "standalone") not in {
        "standalone",
        "backend",
        "model-provider",
    }:
        raise EngineError("PLUGIN_EXCLUDED_SURFACE")
    # The operator reviews executable code. Manifests cannot silently install
    # channels, an alternate lifecycle owner or unpinned dependencies.
    if value.get("platforms") or value.get("external_dependencies"):
        raise EngineError("PLUGIN_DEPENDENCIES_REQUIRE_PROVISIONING")
    from packaging.requirements import InvalidRequirement, Requirement

    for item in [*value.get("pip_dependencies", []), *value.get("python_dependencies", [])]:
        try:
            requirement = Requirement(item)
            pins = list(requirement.specifier)
            if requirement.url or len(pins) != 1 or pins[0].operator != "==" or "*" in pins[0].version:
                raise ValueError
            if importlib.metadata.version(requirement.name) not in requirement.specifier:
                raise ValueError
        except (InvalidRequirement, ValueError, TypeError, importlib.metadata.PackageNotFoundError):
            raise EngineError("PLUGIN_DEPENDENCIES_REQUIRE_PROVISIONING") from None
    return value


def verify_selected(selection):
    if not isinstance(selection, dict) or set(selection) != {"id", "version", "sha256"}:
        raise EngineError("PLUGIN_INVALID_SELECTION")
    if not re.fullmatch(r"[a-z][a-z0-9_-]{0,63}", str(selection["id"])):
        raise EngineError("PLUGIN_INVALID_SELECTION")
    directory = Path(os.environ["HERMES_HOME"]) / "plugins" / selection["id"]
    try:
        value = manifest(directory)
        if (
            str(value["version"]) != selection["version"]
            or fingerprint(directory) != selection["sha256"]
        ):
            raise EngineError("PLUGIN_PIN_MISMATCH")
        from hermes_cli.plugins import get_plugin_manager

        loaded = get_plugin_manager()._plugins.get(selection["id"])
        if loaded is None or not loaded.enabled:
            raise EngineError("PLUGIN_NOT_ENABLED")
    except OSError:
        raise EngineError("PLUGIN_NOT_INSTALLED") from None


def install(source, expected, home):
    """Install/update only while stopped; archive previous bytes for external rollback."""
    require_drained(home)
    value = manifest(source)
    actual = fingerprint(source)
    if actual != expected:
        raise EngineError("PLUGIN_PIN_MISMATCH")
    plugins = home / "plugins"
    plugins.mkdir(mode=0o700, parents=True, exist_ok=True)
    target = plugins / value["name"]
    with tempfile.TemporaryDirectory(dir=home) as stage:
        staged = Path(stage) / value["name"]
        shutil.copytree(
            source, staged, ignore=shutil.ignore_patterns("__pycache__", "*.pyc")
        )
        if fingerprint(staged) != expected:
            raise EngineError("PLUGIN_PIN_MISMATCH")
        if target.exists():
            archive = home / "plugin-archive" / fingerprint(target)
            archive.parent.mkdir(mode=0o700, exist_ok=True)
            if not archive.exists():
                shutil.copytree(target, archive)
            shutil.rmtree(target)
        os.replace(staged, target)
    return {"id": value["name"], "version": str(value["version"]), "sha256": actual}


def configure_plugin(identity, enabled, home):
    """Native opt-in after a drained gateway; live catalog revocation comes first."""
    from hermes_cli.auth import _save_private_json
    from utils import fast_safe_load

    if not re.fullmatch(r"[a-z][a-z0-9_-]{0,63}", identity):
        raise EngineError("PLUGIN_INVALID_SELECTION")
    require_drained(home)
    path = home / "config.yaml"
    config = fast_safe_load(path.read_text()) if path.exists() else {}
    settings = config.setdefault("plugins", {})
    for field, include in (("enabled", enabled), ("disabled", not enabled)):
        names = set(settings.get(field, []))
        names.add(identity) if include else names.discard(identity)
        settings[field] = sorted(names)
    _save_private_json(path, config)


def require_drained(home):
    if (home / "nma.sock").exists():
        raise EngineError("PLUGIN_UPDATE_REQUIRES_DRAINED_GATEWAY")
    database = home / "state.db"
    if database.exists():
        with sqlite3.connect(f"file:{database}?mode=ro", uri=True) as conn:
            exists = conn.execute("SELECT 1 FROM sqlite_master WHERE name='session_admissions'").fetchone()
            if exists and conn.execute("SELECT 1 FROM session_admissions WHERE status<>'terminal' LIMIT 1").fetchone():
                raise EngineError("PLUGIN_UPDATE_REQUIRES_DRAINED_GATEWAY")


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "operation", choices=("inspect", "install", "enable", "disable")
    )
    parser.add_argument("source", type=Path)
    parser.add_argument("--sha256")
    args = parser.parse_args()
    home = Path(os.environ["HERMES_HOME"])
    if args.operation == "inspect":
        print(
            json.dumps(
                {"manifest": manifest(args.source), "sha256": fingerprint(args.source)}
            )
        )
    elif args.operation == "install":
        print(json.dumps(install(args.source, args.sha256, home)))
    else:
        configure_plugin(args.source.name, args.operation == "enable", home)
        print(
            json.dumps({"id": args.source.name, "enabled": args.operation == "enable"})
        )


if __name__ == "__main__":
    main()
