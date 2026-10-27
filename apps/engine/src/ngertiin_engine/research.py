"""Native web providers with private credentials and thread-scoped native caches."""

import base64
import hashlib
import importlib
import json
import os
import threading
import time
from contextvars import ContextVar
from pathlib import Path
from uuid import NAMESPACE_URL, uuid5

from ngertiin_engine.contracts import EngineError, digest
from ngertiin_engine.provider_secrets import Vault

PROVIDERS = {
    "firecrawl": ("firecrawl", "FirecrawlWebSearchProvider", "FIRECRAWL_API_KEY", True),
    "exa": ("exa", "ExaWebSearchProvider", "EXA_API_KEY", True),
    "tavily": ("tavily", "TavilyWebSearchProvider", "TAVILY_API_KEY", True),
    "brave-free": (
        "brave_free",
        "BraveFreeWebSearchProvider",
        "BRAVE_SEARCH_API_KEY",
        False,
    ),
    "searxng": ("searxng", "SearXNGWebSearchProvider", "SEARXNG_URL", False),
}
_settings = ContextVar("nma_research_settings", default=None)
_scope = ContextVar("nma_research_scope", default=None)
_page = ContextVar("nma_research_page", default=None)
_metrics = ContextVar("nma_research_metrics", default=None)
_lock = threading.RLock()


class Research:
    def __init__(self, home, owner):
        self.home, self.owner = Path(home), owner
        self.vault = Vault(home, owner, directory="research-secrets")
        self.identity = str(uuid5(NAMESPACE_URL, owner + ":research:v1"))

    def read(self):
        try:
            value = self.vault.read(self.identity)
            from ngertiin_engine.redaction import remember

            for item in value.get("credentials", {}).values():
                remember({"headers": [{"value": item}]})
            return value
        except EngineError as exc:
            if exc.code != "CREDENTIAL_UNAVAILABLE":
                raise
            return None

    def listing(self):
        value = self.read()
        return {
            "providers": [
                {"id": key, "extract": spec[3]} for key, spec in PROVIDERS.items()
            ],
            "configuration": value["metadata"] if value else None,
        }

    def configure(self, payload):
        if set(payload) - {
            "search_backend",
            "extract_backend",
            "credentials",
            "workspace_grant",
            "expected_generation",
        }:
            raise EngineError("INVALID_REQUEST")
        search, extract = payload.get("search_backend"), payload.get("extract_backend")
        credentials = payload.get("credentials", {})
        if (
            search not in PROVIDERS
            or extract not in PROVIDERS
            or not PROVIDERS[extract][3]
            or not isinstance(credentials, dict)
        ):
            raise EngineError("INVALID_CONFIGURATION")
        allowed = {v[2] for v in PROVIDERS.values()} | {
            "FIRECRAWL_API_URL",
            "XAI_API_KEY",
        }
        if set(credentials) - allowed or any(
            not isinstance(v, str) or not 1 <= len(v) <= 16384 or "\n" in v
            for v in credentials.values()
        ):
            raise EngineError("INVALID_CONFIGURATION")
        from ngertiin_engine.app_connections import public_url

        for key in ("FIRECRAWL_API_URL", "SEARXNG_URL"):
            if key in credentials:
                public_url(credentials[key])
        with self.vault.locked(self.identity):
            prior = self.read()
            if prior and prior.get("request_digest") == digest(payload):
                return prior["metadata"]
            if (
                prior
                and payload.get("expected_generation")
                != prior["metadata"]["generation"]
            ):
                raise EngineError("REVISION_CONFLICT")
            secrets = {**(prior or {}).get("credentials", {}), **credentials}
            if not all(secrets.get(PROVIDERS[name][2]) for name in (search, extract)):
                raise EngineError(
                    "INVALID_CONFIGURATION", {"reason": "research_credentials_required"}
                )
            from ngertiin_engine.redaction import remember

            for item in secrets.values():
                remember({"headers": [{"value": item}]})
            metadata = {
                "generation": (prior or {}).get("metadata", {}).get("generation", 0)
                + 1,
                "search_backend": search,
                "extract_backend": extract,
                "workspace_grant": payload.get("workspace_grant"),
                "x_ready": bool(secrets.get("XAI_API_KEY")),
                "version": 1,
            }
            catalog_path = os.environ.get("NMA_CAPABILITIES_FILE")
            catalog = json.loads(Path(catalog_path).read_text()) if catalog_path else {}
            from toolsets import resolve_toolset

            candidates = [
                key
                for key, entry in catalog.get("tool_grants", {}).items()
                if entry.get("enabled") is True
                and "read_file" in resolve_toolset(entry.get("toolset", ""))
                and catalog.get("execution_surfaces", {})
                .get(entry.get("execution_surface"), {})
                .get("kind")
                == "scoped_linux"
            ]
            workspace = payload.get("workspace_grant") or (
                min(candidates) if candidates else None
            )
            if workspace is not None and workspace not in candidates:
                raise EngineError(
                    "INVALID_CONFIGURATION", {"reason": "native_file_tools_required"}
                )
            metadata["workspace_grant"] = workspace
            self.vault.write(
                self.identity,
                {
                    "metadata": metadata,
                    "credentials": secrets,
                    "request_digest": digest(payload),
                },
            )
            return metadata

    def disconnect(self):
        with self.vault.locked(self.identity):
            value = self.read()
            if not value:
                raise EngineError("NOT_FOUND")
            value["metadata"].update(
                status="disconnected",
                x_ready=False,
                generation=value["metadata"]["generation"] + 1,
            )
            self.vault.write(
                self.identity, {"metadata": value["metadata"], "credentials": {}}
            )
            return value["metadata"]

    def catalog(self):
        value = self.read()
        metadata = value["metadata"] if value else {}
        entries = {
            "research_web": {
                "enabled": bool(
                    value
                    and metadata.get("workspace_grant")
                    and metadata.get("status") != "disconnected"
                ),
                "label": "Web research",
                "toolset": "web",
                "requires": [metadata["workspace_grant"]]
                if metadata.get("workspace_grant")
                else [],
                "execution_surface": "nma_research_web",
            },
            "research_x": {
                "enabled": bool(metadata.get("x_ready")),
                "label": "Public X search",
                "toolset": "x_search",
                "execution_surface": "nma_research_x",
            },
        }
        return entries, {
            key: {
                "kind": "scoped_research",
                "ready": entry["enabled"],
                "configuration": metadata,
                "reason": "xai_access_required"
                if key == "nma_research_x"
                else "native_file_tools_required"
                if value
                else "research_credentials_required",
            }
            for key, entry in (
                ("nma_research_web", entries["research_web"]),
                ("nma_research_x", entries["research_x"]),
            )
        }


def owner_research():
    return Research(os.environ["HERMES_HOME"], os.environ["NMA_OWNER_ID"])


def invoke(name, arguments, marker, database, owner, dispatch, kwargs):
    if name not in {"web_search", "web_extract", "x_search"}:
        return False, None
    required = "research_x" if name == "x_search" else "research_web"
    if required not in marker["grants"].get("tool_grants", []):
        return False, None
    from agent.secret_scope import reset_secret_scope, set_secret_scope
    from gateway.session_policy import active_policy
    from hermes_constants import reset_hermes_home_override, set_hermes_home_override

    from ngertiin_engine.capabilities import authorize

    value = owner_research().read()
    if not value:
        return False, None
    config = active_policy().config(secrets=False)
    context = config["nma_context"]
    scope = digest(
        [
            owner,
            marker["agent_id"],
            context["thread_id"],
            context["context_generation"],
            value["metadata"],
        ]
    )
    settings = {**value["metadata"], "keyless_rescue": False, "keyless_fallback": False}
    # Native provider selection is explicit. Managed Nous and anonymous rescue
    # paths cannot silently replace the configured direct service.
    settings["provider_tier"] = {key: "paid" for key in ("exa", "firecrawl", "tavily")}
    home = Path(os.environ["HERMES_HOME"]) / "research-cache" / scope
    home.mkdir(mode=0o700, parents=True, exist_ok=True)
    started = time.monotonic()
    metrics = {
        "tool": name,
        "provider": "xai"
        if name == "x_search"
        else settings["search_backend" if name == "web_search" else "extract_backend"],
        "cache_hits": 0,
        "cache_misses": 0,
        "failure_phase": "dispatch",
    }
    with _lock:
        authorize(marker, database, owner)
        st = _settings.set(settings)
        sc = _scope.set(scope)
        page = _page.set((marker, context, database, owner))
        mt = _metrics.set(metrics)
        ht = set_hermes_home_override(home)
        secret = set_secret_scope(value["credentials"], profile_home=str(home))
        try:
            from agent import web_search_registry

            for backend in {settings["search_backend"], settings["extract_backend"]}:
                module, cls, _, _ = PROVIDERS[backend]
                provider = getattr(
                    importlib.import_module("plugins.web." + module + ".provider"), cls
                )()
                web_search_registry.register_provider(provider)
            result = dispatch(name, arguments, **kwargs)
            from ngertiin_engine.outcomes import decode, failed

            metrics["failure_phase"] = (
                "provider_or_extraction" if failed(decode(result)) else None
            )
            return True, result
        finally:
            reset_secret_scope(secret)
            reset_hermes_home_override(ht)
            _page.reset(page)
            _scope.reset(sc)
            _settings.reset(st)
            _metrics.reset(mt)
            metrics["elapsed_ms"] = int((time.monotonic() - started) * 1000)
            record_metrics(metrics)
            import logging

            logging.getLogger(__name__).info(
                "Native research completed: tool=%s elapsed_ms=%d scope=%s",
                name,
                (time.monotonic() - started) * 1000,
                scope[:16],
            )


def record_metrics(metrics):
    from ngertiin_engine.app_interactions import _store_factory
    from ngertiin_engine.reliability import Reliability, execution

    if _store_factory is None or execution.get() is None:
        return
    store = _store_factory()

    def record(conn):
        row = Reliability(store).check(conn, execution.get())
        if row is not None:
            Reliability(store).append(
                conn, row[0], json.loads(row[1]), "research.completed", metrics
            )

    store.write(record)


def install():
    from tools import web_result_cache, web_tools, web_tools_truncate

    original_config = web_tools._load_web_config
    original_key = web_result_cache.SearchMemo._key
    original_store = web_tools_truncate._store_full_text
    original_lookup = web_result_cache.SearchMemo.lookup
    original_extract_get = web_result_cache.extract_cache_get

    def note_cache(value):
        metrics = _metrics.get()
        if metrics is not None:
            field = "cache_hits" if value is not None else "cache_misses"
            metrics[field] += 1
        return value

    def lookup(memo, provider, query, limit):
        return note_cache(original_lookup(memo, provider, query, limit))

    def extract_get(url, format=None, provider=""):
        return note_cache(original_extract_get(url, format, provider))

    def config():
        return _settings.get() if _settings.get() is not None else original_config()

    def key(provider, query, limit):
        return (_scope.get(), *original_key(provider, query, limit))

    def store(url, content):
        path = original_store(url, content)
        current = _page.get()
        if not path or current is None:
            return path
        marker, context, database, owner = current
        from ngertiin_engine.capabilities import authorize
        from ngertiin_engine.native_surface import binding

        _, broker, scope = binding(marker, context, database, owner)
        data = Path(path).read_bytes()
        sha = hashlib.sha256(data).hexdigest()
        relative = "imports/web/" + sha + ".md"
        from ngertiin_engine.files import PART_BYTES

        for offset in range(0, max(1, len(data)), PART_BYTES):
            broker.invoke(
                scope,
                "research:" + digest([_scope.get(), sha, offset]),
                "_nma_file",
                {
                    "path": relative,
                    "sha256": sha,
                    "byte_count": len(data),
                    "offset": offset,
                    "data_base64": base64.b64encode(
                        data[offset : offset + PART_BYTES]
                    ).decode(),
                },
                schema_hash="nma.workspace.v1",
                allowed_tools={"_nma_file"},
                authorize=lambda: authorize(marker, database, owner),
            )
        from ngertiin_engine.agents import Agents
        from ngertiin_engine.app_interactions import _store_factory
        from ngertiin_engine.files import Files
        from ngertiin_engine.reliability import Reliability, execution
        from ngertiin_engine.threads import Threads

        if _store_factory is not None and execution.get() is not None:
            store = _store_factory()
            operation = "research:" + digest([_scope.get(), sha])
            identity = str(uuid5(NAMESPACE_URL, owner + ":file:" + operation))

            def publish(conn):
                row = Reliability(store).check(conn, execution.get())
                if row is None:
                    raise EngineError("ACCESS_REVOKED")
                run_id, config = row[0], json.loads(row[1])
                Threads(store, Agents(store, {})).check_binding(conn, config)
                if conn.execute(
                    "SELECT 1 FROM nma_files WHERE owner_id=? AND artifact_id=?",
                    (owner, identity),
                ).fetchone():
                    return
                item = Files(store).publish(
                    conn,
                    operation,
                    config,
                    run_id,
                    "source-" + sha[:12] + ".md",
                    "text/markdown",
                    data,
                )
                Reliability(store).append(conn, run_id, config, "artifact.ready", item)

            store.write(publish)
        return "/work/" + relative

    web_tools._load_web_config = config
    web_result_cache.SearchMemo._key = staticmethod(key)
    web_result_cache.SearchMemo.lookup = lookup
    web_result_cache.extract_cache_get = extract_get
    web_tools_truncate._store_full_text = store
