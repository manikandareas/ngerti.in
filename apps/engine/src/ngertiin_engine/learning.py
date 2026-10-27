"""Native learning tools and owner inspection under one Hermes execution authority."""

import json

from ngertiin_engine.context import Context
from ngertiin_engine.contracts import EngineError, canonical, digest, uuid
from ngertiin_engine.learning_store import Memories, once
from ngertiin_engine.skill_packages import Skills, catalog, decode

TOOLS = {
    "memory",
    "session_search",
    "skills_list",
    "skill_view",
    "skill_manage",
    "skill_install",
    "hindsight_recall",
}
PROMPT = """You can remember stable facts with memory, recall authorized old work with
session_search, and discover reusable workflows with skills_list and skill_view.
Use skill_install for a relevant catalog workflow that is not installed. Skills
include executable scripts and references; load their instructions before use.
Use skill_manage to retain successful non-trivial methods and incorporate user
corrections naturally. Learn from sources you actually inspected; record source
references in the skill. Never copy credentials into memories or skills. Private
DM knowledge belongs to this agent; group learning belongs to this exact group.
New skills require a short frontmatter description of at most 60 characters.
Office/PDF deliverables must be actual files, validated with the skill's scripts
and rendered when appropriate, then published with workspace. A missing renderer,
credential or binary is an actionable setup issue, not a successful result.
Save document JSON specifications with write_file as JSON, then invoke the native
scripts in separate steps. Do not paste JSON literals into Python expressions:
JSON true/false/null are not Python True/False/None. Prefer the skill's renderer;
when calling LibreOffice directly, give each conversion its own temporary
UserInstallation profile so concurrent conversions cannot share a lock.
Workspace publish_file paths are relative to /work: use project/report.docx for
/work/project/report.docx. Native skill assets are under the skill_dir returned
by skill_view, never a gateway cache or host home directory.
"""


def schemas():
    from tools.memory_tool import MEMORY_SCHEMA
    from tools.session_search_tool import SESSION_SEARCH_SCHEMA
    from tools.skill_manager_tool import SKILL_MANAGE_SCHEMA
    from tools.skills_tool import SKILL_VIEW_SCHEMA, SKILLS_LIST_SCHEMA

    from ngertiin_engine.memory_provider import SCHEMA as PROVIDER_SCHEMA

    return [
        MEMORY_SCHEMA,
        PROVIDER_SCHEMA,
        SESSION_SEARCH_SCHEMA,
        SKILLS_LIST_SCHEMA,
        SKILL_VIEW_SCHEMA,
        SKILL_MANAGE_SCHEMA,
        {
            "name": "skill_install",
            "description": "Install a pinned workflow from skills_list's catalog into this authorized learning scope. Existing customized skills require a merge; they are never overwritten.",
            "parameters": {
                "type": "object",
                "properties": {"catalog_id": {"type": "string"}},
                "required": ["catalog_id"],
                "additionalProperties": False,
            },
        },
    ]


class Learning:
    def __init__(self, store, threads):
        self.store, self.threads = store, threads
        self.context = Context(store, threads)
        self.memories = Memories(self.context)
        self.skills = Skills(store, self.context)

    def scope(self, payload):
        return {key: uuid(payload[key]) for key in ("agent_id", "thread_id")}

    def _inline(self, conn, scope):
        from ngertiin_engine.capabilities import catalog as capabilities

        agent = self.threads.agents.get(conn, scope["agent_id"])
        entries = capabilities().get("skill_refs", {})
        installed = {i["name"] for i in self.skills.listing(conn, scope, archived=True)}
        import base64
        import hashlib

        for name in agent["config"].get("skill_refs", []):
            entry = entries.get(name, {})
            if name in installed or not isinstance(entry.get("content"), str):
                continue
            # Keep the original instruction text verbatim inside a versioned skill.
            data = (
                "---\nname: "
                + name
                + "\ndescription: Assigned workflow\n---\n\n"
                + entry["content"]
            ).encode()
            files = {
                "SKILL.md": {
                    "data": base64.b64encode(data).decode(),
                    "sha256": hashlib.sha256(data).hexdigest(),
                    "executable": False,
                }
            }
            from pathlib import Path

            from ngertiin_engine.skill_assets import manifest

            for asset, metadata in manifest(entry).items():
                data = Path(entry["native_assets"][asset]["path"]).read_bytes()
                files[asset] = {
                    **metadata,
                    "data": base64.b64encode(data).decode(),
                }
            self.skills.save(
                conn,
                scope,
                name,
                files,
                {
                    "source": "assigned_instruction",
                    "config_revision": agent["config_revision"],
                },
                origin="inline",
            )

    def assigned_prompt(self, conn, scope):
        """Resolve current authored revisions instead of freezing legacy text."""
        scope = self.scope(scope)
        self._inline(conn, scope)
        assigned = self.threads.agents.get(conn, scope["agent_id"])["config"].get(
            "skill_refs", []
        )
        return "\n\n".join(
            "Assigned workflow: "
            + item["name"]
            + "\n"
            + decode(item["files"]["SKILL.md"]).decode()
            + "\nNative skill directory: /work/imports/skills/"
            + digest(item["files"])[:24]
            + "/"
            + item["name"]
            + "/\n"
            + "\n".join(item["files"])
            for item in self.skills.listing(conn, scope)
            if item["name"] in assigned
        )

    def readiness(self, conn, scope, item):
        if item["origin"] == "inline":
            return {"runtime_ready": True, "reason": None}
        entry = next(
            (e for e in catalog()["entries"] if e["id"] == item["catalog_id"]), None
        )
        if entry and not set(entry["assets"]).issubset(item["files"]):
            return {"runtime_ready": False, "reason": "skill_assets_required"}
        if entry and entry["classification"] != "supported":
            return {"runtime_ready": False, "reason": "workflow_setup_required"}
        from ngertiin_engine.capabilities import catalog as capabilities

        data = capabilities()
        agent = self.threads.agents.get(conn, scope["agent_id"])
        images = [
            data.get("execution_surfaces", {}).get(
                data.get("tool_grants", {}).get(key, {}).get("execution_surface"), {}
            )
            for key in agent["config"].get("tool_grants", [])
        ]
        images = [
            image
            for image in images
            if image.get("kind") == "scoped_linux" and image.get("ready") is True
        ]
        if not images:
            return {"runtime_ready": False, "reason": "native_workspace_required"}
        if entry and item["name"] in {
            "docx",
            "xlsx",
            "powerpoint",
            "pdf",
            "codebase-inspection",
            "systematic-debugging",
        }:
            from ngertiin_engine.native_executor import IsolatedTools
            from ngertiin_engine.native_surface import verify_image

            try:
                for image in images:
                    verify_image(image.get("image"))
                    details = json.loads(
                        IsolatedTools._docker("image", "inspect", image["image"])
                    )[0]
                    labels = details["Config"].get("Labels", {})
                    if labels.get(
                        "org.ngertiin.native.documents"
                    ) == "office-pdf.v2" and (
                        item["name"]
                        not in {"codebase-inspection", "systematic-debugging"}
                        or labels.get("org.ngertiin.native.learning") == "skills.v1"
                    ):
                        return {"runtime_ready": True, "reason": None}
            except (EngineError, RuntimeError):
                pass
            return {"runtime_ready": False, "reason": "document_dependencies_required"}
        return {"runtime_ready": True, "reason": None}

    def inventory(self, conn, scope):
        self._inline(conn, scope)

        def source_links(ids):
            links = []
            for message_id in ids:
                row = conn.execute(
                    "SELECT thread_id FROM nma_messages WHERE owner_id=? AND message_id=?",
                    (self.store.owner, message_id),
                ).fetchone()
                if row:
                    links.append(
                        {
                            "message_id": message_id,
                            "href": "/conversations/"
                            + row[0]
                            + "#message-"
                            + message_id,
                        }
                    )
            return links

        items = self.skills.listing(conn, scope, archived=True)
        for item in items:
            item.update(self.readiness(conn, scope, item))
            files = item.pop("files")
            item["content"] = decode(files["SKILL.md"]).decode()
            item["assets"] = list(files)
            item["sources"] = source_links(
                item["provenance"].get("source_message_ids", [])
            )
            item["history"] = []
            for revision, saved, provenance, created_at in conn.execute(
                "SELECT revision,files,provenance,created_at FROM nma_skill_revisions WHERE owner_id=? AND skill_id=? ORDER BY revision DESC",
                (self.store.owner, item["skill_id"]),
            ):
                saved = json.loads(saved)
                item["history"].append(
                    {
                        "revision": str(revision),
                        "content": decode(saved["SKILL.md"]).decode(),
                        "assets": list(saved),
                        "provenance": json.loads(provenance),
                        "created_at": created_at,
                    }
                )
            item["usage_count"] = conn.execute(
                "SELECT count(*) FROM nma_skill_usage WHERE owner_id=? AND skill_id=?",
                (self.store.owner, item["skill_id"]),
            ).fetchone()[0]
            item["usage"] = [
                {
                    "revision": str(revision),
                    "run_id": run_id,
                    "status": status or "running",
                    "created_at": created_at,
                    "href": "/conversations/" + thread_id,
                }
                for revision, run_id, status, created_at, thread_id in conn.execute(
                    "SELECT u.revision,u.run_id,t.status,u.created_at,json_extract(b.config,'$.thread_id') FROM nma_skill_usage u JOIN nma_adapter_runs r ON r.owner_id=u.owner_id AND r.run_id=u.run_id JOIN nma_adapter_bindings b USING(owner_id,binding_id) LEFT JOIN nma_run_terminals t ON t.owner_id=u.owner_id AND t.run_id=u.run_id WHERE u.owner_id=? AND u.skill_id=? ORDER BY u.created_at DESC LIMIT 10",
                    (self.store.owner, item["skill_id"]),
                )
            ]
        memories = self.memories.inventory(conn, scope)
        for memory in memories:
            memory["sources"] = source_links(memory["source_message_ids"])
            memory["history"] = [
                json.loads(row[0])
                for row in conn.execute(
                    "SELECT snapshot FROM nma_memory_revisions WHERE owner_id=? AND memory_id=? ORDER BY revision DESC",
                    (self.store.owner, memory["memory_id"]),
                )
            ]
        from ngertiin_engine.memory_provider import configuration

        try:
            provider = {"configured": configuration() is not None, "error": None}
        except EngineError as exc:
            provider = {"configured": False, "error": exc.code}

        return {
            "memories": memories,
            "memory_provider": {
                "provider": "hindsight",
                **provider,
            },
            "skills": items,
            "catalog": [
                {key: value for key, value in entry.items() if key != "assets"}
                for entry in catalog()["entries"]
            ],
        }

    def command(self, body):
        payload, kind = body["payload"], body["type"]
        scope = self.scope(payload)
        allowed = {
            "learning.read": {"agent_id", "thread_id"},
            "learning.memory": {
                "agent_id",
                "thread_id",
                "memory_id",
                "action",
                "content",
            },
            "learning.install": {"agent_id", "thread_id", "catalog_id"},
            "learning.skill": {
                "agent_id",
                "thread_id",
                "skill_id",
                "action",
                "source_revision",
                "content",
            },
            "learning.recall": {"agent_id", "thread_id", "arguments"},
            "learning.maintain": {"agent_id", "thread_id"},
            "learning.provider": {"agent_id", "thread_id", "action", "query"},
        }
        if kind not in allowed or set(payload) - allowed[kind]:
            raise EngineError("INVALID_REQUEST")
        if kind == "learning.maintain":
            self.store.write(lambda conn: self.context.scope(conn, **scope))
            from ngertiin_engine.learning_curator import maintain

            return maintain(self, force=True)
        if kind == "learning.recall":
            from ngertiin_engine.recall import search

            return search(self.store, self.context, scope, payload.get("arguments", {}))
        if kind == "learning.provider":
            from ngertiin_engine.memory_provider import HindsightMemoryProvider

            provider = HindsightMemoryProvider(self, scope)
            if payload.get("action") == "export":
                return provider.export()
            if payload.get("action") == "sync":
                _, bank, _ = provider.sync()
                return {"provider": "hindsight", "bank_id": bank, "status": "ready"}
            if payload.get("action") == "recall":
                return json.loads(
                    provider.handle_tool_call(
                        "hindsight_recall", {"query": payload.get("query")}
                    )
                )
            raise EngineError("INVALID_REQUEST")

        def apply(conn):
            self.context.scope(conn, **scope)
            if kind == "learning.read":
                return self.inventory(conn, scope)
            provenance = {
                "source": "owner",
                "operation_id": body["command_id"],
                "thread_id": scope["thread_id"],
            }

            def mutate():
                if kind == "learning.memory":
                    return self.memories.correct(
                        conn,
                        scope,
                        payload,
                        body["expected_revision"],
                        body["command_id"],
                    )
                if kind == "learning.install":
                    return self.skills.install(
                        conn, scope, payload, provenance, body["expected_revision"]
                    )
                return self.skills.action(
                    conn, scope, payload, body["expected_revision"], provenance
                )

            return once(conn, self.store.owner, body["command_id"], body, mutate)

        result = self.store.write(apply)
        return (
            self.sync_provider(scope, result) if kind == "learning.memory" else result
        )

    def sync_provider(self, scope, result):
        from ngertiin_engine.memory_provider import HindsightMemoryProvider

        try:
            provider = HindsightMemoryProvider(self, scope)
            if provider.is_available():
                provider.sync()
                return {**result, "provider_status": "ready"}
        except EngineError as exc:
            return {**result, "provider_status": "pending", "provider_error": exc.code}
        return result

    def tool(self, stamp, name, arguments, ids):
        from ngertiin_engine.reliability import Reliability

        operation_id = digest([ids.turn_id, ids.tool_call_id, name])
        current_scope = None

        def apply(conn):
            nonlocal current_scope
            row = Reliability(self.store).check(conn, stamp)
            if row is None:
                raise EngineError("ACCESS_REVOKED")
            config = json.loads(row[1])
            scope = self.scope(config)
            current_scope = scope
            self.threads.check_binding(conn, config)
            provenance = {
                "source": "agent",
                "run_id": row[0],
                "thread_id": scope["thread_id"],
                "operation_id": operation_id,
            }
            sources = [
                r[0]
                for r in conn.execute(
                    "SELECT message_id FROM nma_messages WHERE owner_id=? AND run_id=? AND author_kind='user'",
                    (self.store.owner, row[0]),
                )
            ]
            provenance["source_message_ids"] = sources

            def mutate():
                if name == "memory":
                    return self.memories.apply_native(
                        conn, scope, arguments, operation_id, sources, row[0]
                    )
                if name == "skill_manage":
                    return self.skills.manage(conn, scope, arguments, provenance)
                if name == "skill_install":
                    return self.skills.install(conn, scope, arguments, provenance)
                if name == "skill_view":
                    return self.skills.view(
                        conn, scope, arguments, operation_id, row[0]
                    )
                if name == "skills_list":
                    inventory = self.inventory(conn, scope)
                    category = arguments.get("category")
                    available = inventory["catalog"]
                    return {
                        "success": True,
                        "hint": "Default catalog lists supported workflows. Pass a category for other workflows; install with catalog_id before viewing.",
                        "categories": sorted(
                            {
                                entry["id"].split(":", 1)[1].split("/")[0]
                                for entry in available
                            }
                        ),
                        "skills": [
                            {
                                key: value
                                for key, value in item.items()
                                if key
                                in {
                                    "skill_id",
                                    "name",
                                    "revision",
                                    "origin",
                                    "runtime_ready",
                                    "reason",
                                }
                            }
                            for item in inventory["skills"]
                            if item["status"] == "active"
                        ],
                        "catalog": [
                            {
                                key: entry[key]
                                for key in (
                                    "id",
                                    "name",
                                    "description",
                                    "classification",
                                    "requirements",
                                )
                            }
                            for entry in available
                            if (
                                entry["id"].split(":", 1)[1].split("/")[0] == category
                                if category
                                else entry["classification"] == "supported"
                            )
                        ],
                    }
                return {"scope": scope}

            return once(conn, self.store.owner, operation_id, [name, arguments], mutate)

        try:
            result = self.store.write(apply)
            if name == "hindsight_recall":
                from ngertiin_engine.memory_provider import HindsightMemoryProvider

                return HindsightMemoryProvider(self, result["scope"]).handle_tool_call(
                    name, arguments
                )
            if name == "memory" and result.get("success"):
                result = self.sync_provider(current_scope, result)
            if name == "session_search":
                from ngertiin_engine.recall import search

                result = search(self.store, self.context, result["scope"], arguments)
            return canonical(result)
        except EngineError as exc:
            return canonical(
                {"error": exc.code, "details": exc.details, "outcome": "rejected"}
            )


def install():
    import model_tools
    from gateway.session_policy import active_policy
    from tools.registry import registry

    from ngertiin_engine.learning_curator import install as install_curator

    install_curator()

    for schema in schemas():
        if schema["name"] in {"skill_install", "hindsight_recall"}:
            registry.register(
                name=schema["name"],
                toolset="nma_learning",
                schema=schema,
                handler=lambda *_a, **_k: canonical({"error": "NOT_FOUND"}),
            )
    original = model_tools.get_tool_definitions

    def definitions(*args, **kwargs):
        values = original(*args, **kwargs)
        policy = active_policy()
        if policy and policy.config(secrets=False).get("nma_context"):
            return [v for v in values if v["function"]["name"] not in TOOLS] + [
                {"type": "function", "function": schema} for schema in schemas()
            ]
        return values

    model_tools.get_tool_definitions = definitions

    # Hermes deliberately dispatches memory/recall inline before the registry.
    # Adapt that shared table too, including AIAgent.invoke_tool and batches.
    from types import SimpleNamespace

    from agent.inline_tool_executors import INLINE_TOOL_EXECUTORS

    def inline(name, original):
        def execute(agent, arguments, ctx):
            policy = active_policy()
            if not policy or not policy.config(secrets=False).get("nma_context"):
                return original(agent, arguments, ctx)
            from ngertiin_engine.agents import Agents
            from ngertiin_engine.app_interactions import _store_factory
            from ngertiin_engine.reliability import execution
            from ngertiin_engine.threads import Threads

            if _store_factory is None or execution.get() is None:
                return canonical({"error": "ACCESS_REVOKED", "outcome": "rejected"})
            store = _store_factory()
            ids = SimpleNamespace(
                turn_id=agent._current_turn_id, tool_call_id=ctx.tool_call_id
            )
            return Learning(store, Threads(store, Agents(store, {}))).tool(
                execution.get(), name, arguments, ids
            )

        return execute

    for name in ("memory", "session_search"):
        INLINE_TOOL_EXECUTORS[name] = inline(name, INLINE_TOOL_EXECUTORS[name])
