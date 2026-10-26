"""Versioned provider contracts; catalog presence never claims live acceptance."""

OPENAI_DOCS = "https://developers.openai.com/siwc/token-sharing-open-source"
OPENCODE_DOCS = "https://opencode.ai/v2/docs/console"
PROVIDERS = {
    "chatgpt": {
        "label": "ChatGPT plan",
        "auth_methods": ["oauth"],
        "billing": "Selected ChatGPT registration and plan allowance",
        "base_url": "https://api.openai.com/v1",
        "catalog_url": "https://api.openai.com/v1/models",
        "protocol": "codex_responses",
        "deployment": "Local OSS installation; hosted access requires provider admission",
        "workload": "Eligible public Responses requests",
        "refresh": "Serialized rotating OAuth refresh; issued registration retained",
        "revocation": "Attempt renewable-session revocation; always stop local future dispatch",
        "integration_deployments": ["local_loopback"],
        "source": OPENAI_DOCS,
    },
    "openrouter": {
        "label": "OpenRouter",
        "auth_methods": ["oauth", "api_key"],
        "billing": "Selected account's OpenRouter credits",
        "base_url": "https://openrouter.ai/api/v1",
        "catalog_url": "https://openrouter.ai/api/v1/models/user",
        "protocol": "chat_completions",
        "deployment": "Local or hosted, subject to provider terms",
        "workload": "Provider-authorized models and requests",
        "refresh": "Issued API key does not rotate automatically; explicit replacement or PKCE reconnect",
        "revocation": "Local disconnect; remote key removal is not asserted",
        "integration_deployments": ["local_loopback"],
        "source": "https://openrouter.ai/docs/guides/overview/auth/oauth",
    },
    "opencode-zen": {
        "label": "OpenCode Zen",
        "auth_methods": ["api_key"],
        "billing": "OpenCode pay-as-you-go balance",
        "base_url": "https://opencode.ai/inference/openai/v1",
        "catalog_url": "https://opencode.ai/inference/v1/models",
        "protocol": "model_specific",
        "deployment": "Personal API key; free chat models restricted to OpenCode",
        "workload": "Paid models only",
        "refresh": "Explicit personal-key replacement",
        "revocation": "Local disconnect; remote key removal is not asserted",
        "integration_deployments": ["owner_partition"],
        "source": OPENCODE_DOCS + "/harnesses/hermes/",
    },
    "opencode-go": {
        "label": "OpenCode Go",
        "auth_methods": ["api_key"],
        "billing": "Selected personal workspace's Go subscription",
        "base_url": "https://opencode.ai/inference/go/openai/v1",
        "catalog_url": "https://opencode.ai/inference/go/v1/models",
        "protocol": "model_specific",
        "deployment": "Single-member workspace; provider-authorized coding traffic",
        "workload": "Coding agents only; own user agent and stable conversation session",
        "refresh": "Explicit personal-key replacement",
        "revocation": "Local disconnect; remote key removal is not asserted",
        "integration_deployments": ["owner_partition"],
        "source": OPENCODE_DOCS + "/go/",
    },
    "custom": {
        "label": "API key / custom endpoint",
        "auth_methods": ["api_key"],
        "billing": "Selected endpoint account",
        "base_url": "",
        "catalog_url": "",
        "protocol": "declared",
        "deployment": "Owner-declared endpoint and entitlement",
        "workload": "Endpoint-authorized requests",
        "refresh": "Explicit key replacement",
        "revocation": "Local disconnect; endpoint-specific remote revocation is not asserted",
        "integration_deployments": ["owner_partition"],
        "source": "https://platform.openai.com/docs/api-reference",
    },
}

# These are dispositions, not enabled login options.
CANDIDATES = {
    "github-copilot": "Deferred: documented SDK authentication does not prove standalone Hermes inference entitlement.",
    "xai": "Deferred: native OAuth adapter exists; deployment/workload and live acceptance remain unverified.",
    "minimax": "Deferred: provider-specific OAuth eligibility and live Hermes inference remain unverified.",
    "claude-subscription": "Excluded: consumer subscription token reuse is not an onboarding option.",
    "qwen-oauth": "Excluded: discontinued flow.",
    "nous": "Excluded by product scope.",
}

PROTOCOLS = {"chat_completions", "codex_responses", "anthropic_messages"}


def opencode_route(provider, model):
    """Use inspected exact endpoint tables, never guess a model's protocol or billing route."""
    import json
    from pathlib import Path

    manifest = json.loads(
        Path(__file__).with_name("provider-opencode.json").read_text()
    )
    route = manifest["providers"][provider].get(model)
    return (route["base_url"], route["protocol"]) if route else None
