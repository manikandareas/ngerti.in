"""Native web result fidelity, scoped long-page storage and direct-provider failures."""

# ruff: noqa: F811 - shared gateway fixture

import json
import os
import sqlite3
import subprocess
from pathlib import Path

import pytest
from test_app_connections import app_server, restart
from test_capabilities import capability_agent, capability_submit
from test_runtime import command, runtime, settle  # noqa: F401


def test_native_research_cache_long_pages_and_revoke(runtime):
    image = os.environ.get("NMA_TEST_NATIVE_IMAGE")
    if not image:
        pytest.skip("The pinned native workspace image is required")
    root, model, call, start, *_ = runtime
    with app_server(root) as (origin, receipts):
        restart(start, origin)
        (root / "capabilities.json").write_text(
            json.dumps(
                {
                    "version": 2,
                    "execution_surfaces": {
                        "linux": {"kind": "scoped_linux", "ready": True, "image": image}
                    },
                    "tool_grants": {
                        "native_files": {
                            "enabled": True,
                            "toolset": "file",
                            "execution_surface": "linux",
                        }
                    },
                }
            )
        )
        configured = call(
            command(
                "research.configure",
                {
                    "search_backend": "firecrawl",
                    "extract_backend": "firecrawl",
                    "credentials": {
                        "FIRECRAWL_API_KEY": "nma-research-disposable-key",
                        "FIRECRAWL_API_URL": origin,
                    },
                },
            )
        )
        assert "result" in configured, configured
        agent = capability_agent(
            call, "research-agent", tool_grants=["native_files", "research_web"]
        )
        second = capability_agent(
            call, "research-isolated", tool_grants=["native_files", "research_web"]
        )
        thread = agent["primary_dm_thread_id"]
        page_arguments = {}

        def script(body, text):
            actions = {
                "RESEARCH_SEARCH": (
                    "web_search",
                    {"query": "verified source", "limit": 3},
                ),
                "RESEARCH_EXTRACT": (
                    "web_extract",
                    {"urls": ["https://example.org/source"], "char_limit": 2000},
                ),
                "RESEARCH_FAILURE": ("web_search", {"query": "rate-limit", "limit": 1}),
                "RESEARCH_MALFORMED": (
                    "web_search",
                    {"query": "malformed", "limit": 1},
                ),
                "RESEARCH_PAGE": ("read_file", page_arguments),
            }
            if text not in actions or body["messages"][-1]["role"] == "tool":
                return None
            name, args = actions[text]
            return {
                "role": "assistant",
                "content": None,
                "tool_calls": [
                    {
                        "id": "research-call",
                        "type": "function",
                        "function": {"name": name, "arguments": json.dumps(args)},
                    }
                ],
            }

        model.goal_script = script
        try:
            for _ in range(2):
                settle(call, capability_submit(call, agent, "RESEARCH_SEARCH", thread))
            assert receipts.read_text().count('"operation": "web_search"') == 1, (
                json.dumps(model.requests)[-12000:]
            )
            assert "SOURCE_ATTRIBUTION_PROOF" in json.dumps(model.requests)
            settle(
                call,
                capability_submit(
                    call, second, "RESEARCH_SEARCH", second["primary_dm_thread_id"]
                ),
            )
            assert receipts.read_text().count('"operation": "web_search"') == 2
            settle(call, capability_submit(call, agent, "RESEARCH_EXTRACT", thread))
            assert "[TRUNCATED]" in json.dumps(model.requests), [
                m for r in model.requests for m in r["messages"] if m["role"] == "tool"
            ][-1]
            assert "/work/imports/web/" in json.dumps(model.requests)
            with sqlite3.connect(root / "state/state.db") as db:
                artifact = db.execute(
                    "SELECT sha256,thread_id FROM nma_files WHERE media_type='text/markdown' ORDER BY rowid DESC LIMIT 1"
                ).fetchone()
            assert artifact and artifact[1] == thread
            stored = root / "state/files/objects" / artifact[0][:2] / artifact[0]
            assert "LONG_PAGE_FINAL_PROOF" in stored.read_text()
            page_arguments.update(
                path="/work/imports/web/" + artifact[0] + ".md", offset=1595, limit=20
            )
            settle(call, capability_submit(call, agent, "RESEARCH_PAGE", thread))
            last_tool = [
                m for m in model.requests[-1]["messages"] if m["role"] == "tool"
            ][-1]["content"]
            assert "LONG_PAGE_FINAL_PROOF" in last_tool
            for text in ("RESEARCH_FAILURE", "RESEARCH_MALFORMED"):
                settle(call, capability_submit(call, agent, text, thread))
                last_tool = [
                    m
                    for r in model.requests
                    for m in r["messages"]
                    if m["role"] == "tool"
                ][-1]["content"]
                assert "error" in last_tool.lower()
                assert "rescued_from" not in last_tool
            with sqlite3.connect(root / "state/state.db") as db:
                diagnostics = db.execute(
                    "SELECT payload FROM nma_events WHERE json_extract(payload,'$.type')='research.completed'"
                ).fetchall()
            assert any(
                json.loads(row[0])["payload"]["cache_hits"] for row in diagnostics
            )
            assert any(
                json.loads(row[0])["payload"]["failure_phase"] for row in diagnostics
            )
            assert "nma-research-disposable-key" not in json.dumps(model.requests)
            assert "XAI_API_KEY" not in json.dumps(
                call(command("agent.list", {"after": None, "limit": 100}))
            )
            direct_home = root / "direct-research"
            direct_home.mkdir()
            (direct_home / "config.yaml").write_text(
                json.dumps(
                    {
                        "web": {
                            "search_backend": "firecrawl",
                            "keyless_rescue": False,
                            "keyless_fallback": False,
                        }
                    }
                )
            )
            direct = subprocess.run(
                [
                    os.environ["NMA_TEST_RUNTIME_PYTHON"],
                    "-c",
                    "import json,time; from tools.web_tools import web_search_tool; started=time.monotonic(); result=web_search_tool('verified source',3); print(json.dumps({'result':json.loads(result),'elapsed_ms':int((time.monotonic()-started)*1000)}))",
                ],
                env={
                    **os.environ,
                    "HERMES_HOME": str(direct_home),
                    "FIRECRAWL_API_URL": origin,
                    "FIRECRAWL_API_KEY": "nma-research-disposable-key",
                },
                capture_output=True,
                text=True,
                timeout=30,
                check=True,
            )
            direct = json.loads(direct.stdout)
            native = next(
                m["content"]
                for r in model.requests
                for m in r["messages"]
                if m["role"] == "tool"
                and 'source="web_search"' in m.get("content", "")
                and "SOURCE_ATTRIBUTION_PROOF" in m["content"]
            )
            native = json.loads(native[native.index("{") : native.rindex("}") + 1])
            assert native == direct["result"]
            evidence_dir = os.environ.get("NMA_EVIDENCE_DIR")
            if evidence_dir:
                evidence = {
                    "scope": "Single controlled HTTP case; no live provider or SLO claim",
                    "exact_native_result_equality": True,
                    "source_urls": [v["url"] for v in native["data"]["web"]],
                    "direct_native_elapsed_ms": direct["elapsed_ms"],
                    "adapter_calls": [
                        json.loads(row[0])["payload"] for row in diagnostics
                    ],
                }
                Path(evidence_dir, "research-parity.json").write_text(
                    json.dumps(evidence, indent=2) + "\n"
                )
            result = call(command("research.disconnect", {}))
            assert "result" in result, result
            assert "error" in call(
                command(
                    "runtime.submit",
                    {
                        "agent_id": agent["agent_id"],
                        "thread_id": thread,
                        "config_revision": agent["config_revision"],
                        "context_generation": "1",
                        "text": "RESEARCH_SEARCH",
                    },
                )
            )
        finally:
            model.goal_script = None
