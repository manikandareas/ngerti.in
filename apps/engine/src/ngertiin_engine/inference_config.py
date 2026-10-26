"""Versioned inference settings resolved exclusively from owner-local model IDs."""

import math

from ngertiin_engine.contracts import EngineError, digest

PARAMETERS = {
    "chat_completions": {
        "temperature",
        "top_p",
        "max_tokens",
        "seed",
        "frequency_penalty",
        "presence_penalty",
        "reasoning_effort",
        "service_tier",
    },
    "codex_responses": {
        "temperature",
        "top_p",
        "max_output_tokens",
        "reasoning",
        "service_tier",
    },
    "anthropic_messages": {"temperature", "top_p", "top_k", "max_tokens", "thinking"},
}


def invalid(field, reason):
    raise EngineError(
        "INVALID_INFERENCE_CONFIGURATION", {"field": field, "reason": reason}
    )


def parameters(value, snapshot):
    if not isinstance(value, dict):
        invalid("parameters", "Expected an object")
    allowed = PARAMETERS.get(snapshot.get("protocol", "chat_completions"), set())
    for key, item in value.items():
        if key not in allowed:
            invalid(key, "This transport does not support the parameter")
        if key in {"temperature", "top_p", "frequency_penalty", "presence_penalty"}:
            bounds = {"temperature": (0, 2), "top_p": (0, 1)}.get(key, (-2, 2))
            if (
                type(item) not in (int, float)
                or not math.isfinite(item)
                or not bounds[0] <= item <= bounds[1]
            ):
                invalid(key, "Value is outside the supported range")
        elif key in {"max_tokens", "max_output_tokens", "top_k", "seed"}:
            if type(item) is not int or (key != "seed" and item <= 0):
                invalid(key, "Expected a positive integer")
        elif key == "reasoning_effort":
            if item not in ("none", "minimal", "low", "medium", "high", "xhigh"):
                invalid(key, "Unknown reasoning effort")
        elif key == "service_tier":
            if item not in ("auto", "default", "flex", "priority"):
                invalid(key, "Unknown service tier")
        elif key == "reasoning":
            if (
                not isinstance(item, dict)
                or not item
                or set(item) - {"effort", "summary"}
            ):
                invalid(key, "Expected reasoning effort or summary")
            if "effort" in item and item["effort"] not in (
                "none",
                "minimal",
                "low",
                "medium",
                "high",
                "xhigh",
            ):
                invalid(key, "Unknown reasoning effort")
            if "summary" in item and item["summary"] not in (
                "auto",
                "concise",
                "detailed",
            ):
                invalid(key, "Unknown reasoning summary")
        elif key == "thinking":
            if (
                not isinstance(item, dict)
                or item.get("type") not in ("enabled", "disabled", "adaptive")
                or set(item) - {"type", "budget_tokens"}
            ):
                invalid(key, "Invalid native thinking configuration")
            if item["type"] == "enabled" and (
                type(item.get("budget_tokens")) is not int
                or item["budget_tokens"] < 1024
                or type(value.get("max_tokens")) is not int
                or item["budget_tokens"] >= value.get("max_tokens", 0)
            ):
                invalid(key, "Thinking requires a budget below max_tokens")
    if snapshot.get("provider_id") == "chatgpt" and set(value) & {
        "temperature",
        "top_p",
    }:
        invalid("parameters", "ChatGPT plan models use provider sampling defaults")
    if "thinking" in value and set(value) & {"temperature", "top_p", "top_k"}:
        invalid("thinking", "Thinking and sampling controls cannot be combined")
    return dict(value)


def validate(value, models, primary_id):
    if (
        not isinstance(value, dict)
        or set(value)
        - {
            "version",
            "parameters",
            "fallback_models",
            "auxiliary",
            "credential_pool",
            "provider_routing",
            "moa",
        }
        or value.get("version", 1) != 1
    ):
        invalid("inference", "Unsupported configuration version or field")
    routes = {}

    def select(identity):
        if not isinstance(identity, str) or identity not in models:
            raise EngineError("MODEL_UNAVAILABLE", {"field": "inference.model"})
        snapshot = models[identity]
        if not snapshot.get("connection_id"):
            raise EngineError("PROVIDER_CONNECTION_REQUIRED")
        alias = "nma-" + digest([identity, snapshot])[:32]
        routes.setdefault(alias, dict(snapshot))
        return {"provider": alias, "model": snapshot["model"]}

    def selections(items, field):
        if (
            not isinstance(items, list)
            or len(items) > 16
            or any(not isinstance(i, str) for i in items)
            or len(set(items)) != len(items)
        ):
            invalid(field, "Expected up to sixteen distinct model selections")
        return [select(i) for i in items]

    primary = select(primary_id)
    wire = parameters(value.get("parameters", {}), models[primary_id])
    routes[primary["provider"]]["parameters"] = wire
    fallback = selections(value.get("fallback_models", []), "fallback_models")
    for route in fallback:
        # A fallback cannot silently drop the primary generation requirements.
        parameters(wire, routes[route["provider"]])
        routes[route["provider"]]["parameters"] = wire
    auxiliary = value.get("auxiliary", {})
    if not isinstance(auxiliary, dict) or set(auxiliary) - {
        "compression",
        "vision",
        "review",
    }:
        invalid("auxiliary", "Supported slots are compression, vision and review")
    frozen_aux = {}
    for task, spec in auxiliary.items():
        if (
            not isinstance(spec, dict)
            or set(spec) - {"model", "fallback_models"}
            or "model" not in spec
        ):
            invalid("auxiliary." + task, "Select a model and optional fallback models")
        frozen_aux[task] = {
            **select(spec["model"]),
            "fallback_chain": selections(
                spec.get("fallback_models", []), "auxiliary." + task
            ),
        }
    pool = value.get("credential_pool")
    frozen_pool = None
    if pool is not None:
        if (
            not isinstance(pool, dict)
            or set(pool) != {"models", "strategy"}
            or pool["strategy"] not in ("fill_first", "round_robin", "random")
        ):
            invalid("credential_pool", "Select models and a native pool strategy")
        members = selections(pool["models"], "credential_pool.models")
        for member in members:
            candidate, original = routes[member["provider"]], models[primary_id]
            if any(
                candidate.get(k) != original.get(k)
                for k in ("provider_id", "model", "protocol", "base_url")
            ):
                invalid(
                    "credential_pool",
                    "Pool members must share provider, model, transport and endpoint",
                )
            routes[member["provider"]]["parameters"] = wire
        frozen_pool = {
            "members": [primary, *[m for m in members if m != primary]],
            "strategy": pool["strategy"],
        }
    routing = value.get("provider_routing", {})
    if not isinstance(routing, dict) or set(routing) - {
        "only",
        "ignore",
        "order",
        "sort",
        "require_parameters",
        "data_collection",
    }:
        invalid("provider_routing", "Unknown native ranking field")
    if routing and models[primary_id].get("provider_id") != "openrouter":
        invalid(
            "provider_routing", "Provider ranking requires an OpenRouter connection"
        )
    for key, item in routing.items():
        if key in ("only", "ignore", "order"):
            if not isinstance(item, list) or any(
                not isinstance(i, str) or not i or len(i) > 128 for i in item
            ):
                invalid("provider_routing." + key, "Expected provider names")
        elif key == "require_parameters":
            if type(item) is not bool:
                invalid(key, "Expected a boolean")
        elif key == "sort" and item not in ("price", "throughput", "latency"):
            invalid(key, "Unknown ranking policy")
        elif key == "data_collection" and item not in ("allow", "deny"):
            invalid(key, "Unknown data collection policy")
    moa = value.get("moa")
    for route in routes.values():
        if route.get("provider_id") == "openrouter":
            route["provider_routing"] = dict(routing)
    frozen_moa = None
    if moa is not None:
        if (
            not isinstance(moa, dict)
            or set(moa) - {"references", "fanout", "reference_timeout"}
            or not moa.get("references")
        ):
            invalid("moa", "Select at least one reference model")
        if moa.get("fanout", "user_turn") not in ("user_turn", "per_iteration"):
            invalid("moa.fanout", "Expected user_turn or per_iteration")
        timeout = moa.get("reference_timeout", 120)
        if (
            type(timeout) not in (int, float)
            or not math.isfinite(timeout)
            or timeout <= 0
        ):
            invalid("moa.reference_timeout", "Expected a positive duration")
        frozen_moa = {
            "enabled": True,
            "aggregator": primary,
            "reference_models": selections(moa["references"], "moa.references"),
            "fanout": moa.get("fanout", "user_turn"),
            "reference_timeout": timeout,
        }
    return {
        "version": 1,
        "routes": routes,
        "primary": primary,
        "fallback_providers": fallback,
        "auxiliary": frozen_aux,
        "credential_pool": frozen_pool,
        "provider_routing": routing,
        "moa": frozen_moa,
    }


def frozen(snapshot):
    result = {
        "nma_inference": snapshot,
        "fallback_providers": snapshot["fallback_providers"],
        "provider_routing": snapshot["provider_routing"],
    }
    if snapshot["moa"]:
        result["moa"] = {
            "default_preset": "ngertiin",
            "presets": {"ngertiin": snapshot["moa"]},
        }
    return result
