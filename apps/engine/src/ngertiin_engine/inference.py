"""Scoped connection references for native fallback, auxiliary, pool and MoA routes."""

import inspect
import json

from ngertiin_engine.contracts import EngineError, digest


class InferenceRoutes:
    def __init__(self, adapter):
        self.adapter = adapter
        self.pools = {}

    def context(self):
        from gateway.session_policy import active_policy

        policy = active_policy()
        return policy.config(secrets=False) if policy else {}

    def resolve(self, alias, model=None, *, config=None):
        from ngertiin_engine.reliability import execution
        from ngertiin_engine.session_controls import control

        config = config if config is not None else self.context()
        frozen = config.get("nma_inference", {})
        snapshot = frozen.get("routes", {}).get(alias)
        if not snapshot or (model is not None and model != snapshot["model"]):
            raise EngineError("MODEL_UNAVAILABLE")
        stamp = execution.get() or {}
        mutation = control.get()
        row = (
            self.adapter.store.write(
                lambda conn: self.adapter.reliability.check(conn, stamp)
            )
            if not mutation
            else None
        )
        if row:
            sid = self.adapter.row(row[0])[2]
        elif mutation:
            sid = self.adapter.store.write(
                lambda conn: conn.execute(
                    "SELECT native_session_id FROM nma_adapter_bindings WHERE owner_id=? AND binding_id=?",
                    (self.adapter.owner, mutation["binding_id"]),
                ).fetchone()[0]
            )
        else:
            raise EngineError("ACCESS_REVOKED")
        _, runtime = self.adapter.provider_transport.runtime(
            snapshot,
            config["nma_provider_thread"],
            row[0] if row else None,
            sid,
            stamp,
            control=mutation,
            route_group=(
                config.get("nma_pool_group")
                or digest([config["nma_provider_thread"], frozen])
            )
            if frozen.get("credential_pool") or config.get("nma_pool_group")
            else None,
        )
        # Native attribution retains the real connection provider. Aliases select
        # owner-scoped routes; neither provider keys nor profile pools are read.
        runtime["requested_provider"] = snapshot["provider_id"]
        if frozen.get("credential_pool") and alias == frozen["primary"]["provider"]:
            runtime["credential_pool"] = self.pool(frozen, config)
        return runtime

    def pool(self, frozen, config):
        from agent.credential_pool import CredentialPool, PooledCredential
        from hermes_cli.auth import _save_private_json

        key = digest([config["nma_provider_thread"], frozen])
        from ngertiin_engine.reliability import execution

        cache_key = digest([key, execution.get()])
        if cache_key in self.pools:
            return self.pools[cache_key]
        path = self.adapter.connections.home / ("inference-pool-" + key + ".json")
        saved = json.loads(path.read_text()) if path.exists() else {}
        entries = []
        # Resolve pool members without recursively constructing the pool itself.
        base = {
            **config,
            "nma_inference": {**frozen, "credential_pool": None},
            "nma_pool_group": key,
        }
        for index, member in enumerate(frozen["credential_pool"]["members"]):
            runtime = self.resolve(member["provider"], member["model"], config=base)
            identity = frozen["routes"][member["provider"]]["connection_id"]
            entry = PooledCredential(
                provider="custom",
                id=identity,
                label=identity,
                auth_type="api_key",
                priority=index,
                source="manual:nma",
                access_token=runtime["api_key"],
                base_url=runtime["base_url"],
                extra={},
            )
            for field in (
                "last_status",
                "last_status_at",
                "last_error_code",
                "last_error_reason",
                "last_error_reset_at",
                "model_cooldowns",
                "request_count",
            ):
                if field in saved.get(identity, {}):
                    setattr(entry, field, saved[identity][field])
            entries.append(entry)

        class ScopedPool(CredentialPool):
            def _persist(self, **kwargs):
                # Native owns selection/cooldown; the connection vault is the only
                # refresh writer. Persist statuses without relay or provider keys.
                with self._lock:
                    fields = (
                        "last_status",
                        "last_status_at",
                        "last_error_code",
                        "last_error_reason",
                        "last_error_reset_at",
                        "model_cooldowns",
                        "request_count",
                    )
                    _save_private_json(
                        path,
                        {
                            e.id: {k: getattr(e, k) for k in fields}
                            for e in self._entries
                        },
                    )

        pool = ScopedPool("custom", entries)
        pool._strategy = frozen["credential_pool"]["strategy"]
        self.pools[cache_key] = pool
        return pool

    def install(self):
        from agent import auxiliary_client, moa_loop
        from hermes_cli import runtime_provider

        from ngertiin_engine.integration import require_signature

        require_signature(
            runtime_provider.resolve_runtime_provider, ("requested", "target_model")
        )
        require_signature(
            auxiliary_client.resolve_provider_client,
            ("provider", "model", "explicit_base_url"),
        )
        original = runtime_provider.resolve_runtime_provider
        original_aux = auxiliary_client.resolve_provider_client
        original_preset = moa_loop._resolve_preset_cached
        original_slot = moa_loop._slot_runtime
        aux_signature = inspect.signature(original_aux)

        def resolve_runtime_provider(
            *,
            requested=None,
            explicit_api_key=None,
            explicit_base_url=None,
            target_model=None,
        ):
            if str(requested).startswith("nma-"):
                if explicit_api_key or explicit_base_url:
                    raise EngineError("ACCESS_REVOKED")
                return self.resolve(requested, target_model)
            return original(
                requested=requested,
                explicit_api_key=explicit_api_key,
                explicit_base_url=explicit_base_url,
                target_model=target_model,
            )

        def resolve_provider_client(*args, **kwargs):
            bound = aux_signature.bind(*args, **kwargs)
            config = self.context()
            frozen = config.get("nma_inference")
            if not frozen:
                return original_aux(*args, **kwargs)
            provider = bound.arguments.get("provider") or "auto"
            if provider == "auto":
                task = bound.arguments.get("task")
                route = frozen["auxiliary"].get(task, frozen["primary"])
                provider = route["provider"]
                bound.arguments["model"] = route["model"]
            if str(provider).startswith("nma-"):
                runtime = self.resolve(provider, bound.arguments.get("model"))
                bound.arguments.update(
                    provider="custom",
                    explicit_base_url=runtime["base_url"],
                    explicit_api_key=runtime["api_key"],
                    api_mode=runtime["api_mode"],
                )
            elif provider != "custom" or not str(
                bound.arguments.get("explicit_base_url", "")
            ).startswith(self.adapter.provider_transport.base + "/inference/"):
                raise EngineError("ACCESS_REVOKED")
            return original_aux(*bound.args, **bound.kwargs)

        def preset(name):
            frozen = self.context().get("nma_inference")
            if frozen:
                from hermes_cli.moa_config import resolve_moa_preset

                if not frozen["moa"] or name != "ngertiin":
                    raise EngineError("MODEL_UNAVAILABLE")
                raw = {
                    "default_preset": "ngertiin",
                    "presets": {"ngertiin": frozen["moa"]},
                }
                return resolve_moa_preset(raw, name), raw
            return original_preset(name)

        def slot(value):
            if str(value.get("provider", "")).startswith("nma-"):
                runtime = self.resolve(value["provider"], value["model"])
                return {
                    "provider": "custom",
                    "model": value["model"],
                    **{k: runtime[k] for k in ("base_url", "api_key", "api_mode")},
                }
            return original_slot(value)

        runtime_provider.resolve_runtime_provider = resolve_runtime_provider
        auxiliary_client.resolve_provider_client = resolve_provider_client
        moa_loop._resolve_preset_cached = preset
        moa_loop._slot_runtime = slot
        # This pin retries pure 5xx auxiliary failures but omits them from its
        # provider-fallback predicates. Extend classification only; the native
        # recovery ladder still chooses and invokes the configured route.
        auxiliary_client._FALLBACK_REASONS = (
            *auxiliary_client._FALLBACK_REASONS,
            (
                lambda error: (
                    bool(self.context().get("nma_inference"))
                    and 500 <= (auxiliary_client._exc_http_status(error) or 0) < 600
                ),
                "provider outage",
            ),
        )
