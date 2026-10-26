"""A counted external action remains distinct from failed post-action observation."""

import asyncio
from datetime import UTC, datetime, timedelta
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from threading import Thread
from types import SimpleNamespace
from urllib.request import Request, urlopen

import pytest

from ngertiin.agent_engine import computer_bridge
from ngertiin.computer.contracts import DomUnavailable, NeedsHuman, StaleTarget


@pytest.fixture
def actuator(monkeypatch):
    class Counter(BaseHTTPRequestHandler):
        count = 0

        def log_message(self, *args):
            pass

        def do_POST(self):
            assert self.rfile.read(int(self.headers["Content-Length"])) == b"click"
            Counter.count += 1
            payload = b"effect-completed"
            self.send_response(200)
            self.send_header("Content-Length", str(len(payload)))
            self.end_headers()
            self.wfile.write(payload)

    server = ThreadingHTTPServer(("127.0.0.1", 0), Counter)
    worker = Thread(target=server.serve_forever, daemon=True)
    worker.start()

    class Provider:
        reject = False
        lost_ack = False
        bad_observation = False
        reject_input = False
        receipt_rejection = None

        async def control(self, workspace):
            pass

        async def target(self, workspace, action):
            if self.reject:
                raise StaleTarget("Target changed before dispatch")
            return SimpleNamespace(fingerprint="current-target")

        async def act(self, workspace, action, **kwargs):
            if self.reject_input:
                raise StaleTarget("Target changed at the guarded input boundary")

            def post():
                with urlopen(
                    Request(f"http://127.0.0.1:{server.server_port}", data=b"click")
                ) as response:
                    assert response.read() == b"effect-completed"

            await asyncio.to_thread(post)
            if self.lost_ack:
                raise TimeoutError("Action acknowledgement was lost")

        async def observe_dom(self, workspace):
            if self.bad_observation:
                raise DomUnavailable("DOM observation unavailable")
            return {"count": Counter.count}

        async def dispatch_receipt(self, workspace, operation):
            if self.receipt_rejection:
                raise self.receipt_rejection("Saved receipt proves input was rejected")
            return {"completed": True, "operation_id": operation}

    provider = Provider()

    async def resource(workspace):
        return SimpleNamespace(
            state="running", sandbox_id="fixture", end_at=datetime.now(UTC) + timedelta(seconds=300)
        )

    monkeypatch.setattr(computer_bridge, "E2BComputer", lambda: provider)
    monkeypatch.setattr(computer_bridge, "resource", resource)
    try:
        yield provider, Counter
    finally:
        server.shutdown()
        server.server_close()
        worker.join(timeout=5)


def request():
    return {
        "operation": "act",
        "operation_id": "stable-dispatch",
        "workspace": {"id": "fixture"},
        "action": {"kind": "navigate", "url": "https://example.com", "description": "Open fixture"},
    }


def test_completed_action_and_failed_observation_are_not_rejection(actuator):
    provider, counter = actuator
    provider.bad_observation = True
    result = asyncio.run(computer_bridge.execute(request()))
    assert counter.count == 1
    assert result["outcome"] == "completed"
    assert result["execution"]["outcome"] == "completed"
    assert result["observation"]["outcome"] == "failed"


def test_lost_action_ack_reuses_durable_receipt_without_another_post(actuator):
    provider, counter = actuator
    provider.lost_ack = True
    unknown = asyncio.run(computer_bridge.execute(request()))
    assert unknown["outcome"] == "indeterminate" and counter.count == 1
    receipt = asyncio.run(
        computer_bridge.execute(
            {
                "operation": "receipt",
                "receipt_operation_id": "stable-dispatch",
                "workspace": {"id": "fixture"},
            }
        )
    )
    assert receipt["outcome"] == "completed" and counter.count == 1


def test_pre_dispatch_rejection_has_no_external_effect(actuator):
    provider, counter = actuator
    provider.reject = True
    result = asyncio.run(computer_bridge.execute(request()))
    assert result["outcome"] == "rejected" and counter.count == 0
    assert result["execution"]["outcome"] == "not_dispatched"


def test_guarded_input_rejection_can_be_repaired_without_unknown_effect(actuator):
    provider, counter = actuator
    provider.reject_input = True
    result = asyncio.run(computer_bridge.execute(request()))
    assert result["outcome"] == "rejected" and counter.count == 0
    assert result["execution"]["outcome"] == "not_dispatched"
    assert result["next_step"]
    provider.reject_input = False
    repaired = asyncio.run(computer_bridge.execute({**request(), "operation_id": "repaired-input"}))
    assert repaired["outcome"] == "completed" and counter.count == 1, repaired


@pytest.mark.parametrize("rejection", [StaleTarget, NeedsHuman])
def test_saved_guard_rejection_is_a_receipt_without_repeating_input(actuator, rejection):
    provider, counter = actuator
    provider.receipt_rejection = rejection
    result = asyncio.run(
        computer_bridge.execute(
            {
                "operation": "receipt",
                "receipt_operation_id": "original-input",
                "workspace": {"id": "fixture"},
            }
        )
    )
    assert result["outcome"] == "rejected" and counter.count == 0
    assert result["execution"]["outcome"] == "not_dispatched"
    assert result["receipt_ref"] == "original-input"
