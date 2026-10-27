"""Authenticated conversation screen and native vault projection; no public CDP."""

import json

from ngertiin_engine.contracts import EngineError
from ngertiin_engine.native_executor import (
    NativeUnavailable,
    ScopeRefused,
    UnknownOutcome,
)
from ngertiin_engine.workspaces import Workspaces

ASSISTANCE_SCHEMA = {
    "name": "request_human",
    "description": "Request the owner's help on this conversation's isolated screen for login, passkeys, verification or blocked input. Suspends further agent input until the owner explicitly returns control. Never request secrets in chat; ask the owner to open Screen and login assistance.",
    "parameters": {
        "type": "object",
        "properties": {"reason": {"type": "string", "maxLength": 1000}},
        "required": ["reason"],
        "additionalProperties": False,
    },
}


def install():
    from tools.registry import registry

    registry.register(
        name="request_human",
        toolset="nma_assistance",
        schema=ASSISTANCE_SCHEMA,
        handler=lambda args, **kwargs: json.dumps(
            {"error": "ACCESS_REVOKED", "outcome": "rejected"}
        ),
    )


class Screens:
    def __init__(self, adapter):
        self.adapter = adapter

    def selected(self, payload):
        return Workspaces(self.adapter).selected(
            payload, required=("browser", "computer_use")
        )

    def action(self, body):
        payload = body["payload"]
        if body["expected_revision"] is not None or not {
            "thread_id",
            "agent_id",
            "action",
        } <= set(payload):
            raise EngineError("INVALID_REQUEST")
        broker, scope, _ = self.selected(payload)
        action = payload["action"]
        expected = {
            "connect": set(),
            "takeover": {"grant"},
            "frame": {"grant"},
            "input": {"grant", "input"},
            "resume": {"grant"},
            "revoke": {"grant"},
            "diagnostics": {"grant"},
            "pause": {"grant"},
        }
        if (
            action not in expected
            or set(payload) != {"thread_id", "agent_id", "action"} | expected[action]
        ):
            raise EngineError("INVALID_REQUEST")
        authorize = lambda: self.selected(payload)
        if action == "input" and isinstance(payload.get("input"), dict):
            from ngertiin_engine.browser_vault import register

            register(payload["input"].get("text"))
        try:
            if action == "connect":
                info = json.loads(broker._docker("image", "inspect", broker.image))[0]
                if (
                    info["Config"].get("Labels", {}).get("org.ngertiin.native.desktop")
                    != "x11-cua.v1"
                ):
                    raise EngineError(
                        "CAPABILITY_UNAVAILABLE",
                        {"reason": "isolated_display_required"},
                    )
                return broker.screen.issue(scope)
            token = payload["grant"]
            if action == "takeover":
                return broker.screen.takeover(scope, token, authorize)
            if action == "resume":
                return broker.screen.release(scope, token, authorize)
            if action == "revoke":
                return broker.screen.revoke(scope, token)
            if action == "pause":
                broker.screen.revoke(scope, token, suspend=True)
                return broker.pause(scope)
            value = broker.screen.invoke(
                scope,
                token,
                action,
                payload.get("input", {}),
                body["command_id"],
                authorize,
            )
            authorize()
            return json.loads(value)
        except NativeUnavailable:
            raise EngineError(
                "CAPABILITY_UNAVAILABLE", {"reason": "isolated_display_unavailable"}
            ) from None
        except ScopeRefused:
            raise EngineError("SCREEN_ACCESS_REFUSED") from None
        except UnknownOutcome:
            raise EngineError("INDETERMINATE") from None

    def vault(self, body):
        from ngertiin_engine.browser_vault import manage

        payload = body["payload"]
        if body["expected_revision"] is not None or set(payload) != {
            "thread_id",
            "agent_id",
            "action",
            "item",
        }:
            raise EngineError("INVALID_REQUEST")
        self.selected(payload)
        # No vault request body enters nma_commands, run history or effect rows.
        # Only the upstream encrypted vault writes the secret payload.
        return manage(payload["action"], payload["item"], body["command_id"])
