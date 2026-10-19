"""Library access, exact-revision and chat-reference contracts on disposable resources."""

import json
import sys
from datetime import UTC, datetime, timedelta
from uuid import UUID, uuid4

import httpx
import inspect_files as fixture
from langchain_core.messages import ToolMessage
from ngertiin.async_db import close_pool, transaction
from ngertiin.chat import store as chat
from ngertiin.chat.projection import Projection
from ngertiin.files import deletion
from ngertiin.files import store as files
from ngertiin.goals.contracts import GoalSpec
from ngertiin.library import capabilities, guard, reader, search, selection
from ngertiin.library.contracts import ResourceRef, SearchInput
from ngertiin.library.tools import tools_for
from ngertiin.tasks import creation, workflow

check, reject = fixture.check, fixture.reject


async def find(owner, query="", **kwargs):
    return await search.search(owner, SearchInput(query=query, **kwargs))


async def scenarios():
    original = workflow.ChatOpenAI
    workflow.ChatOpenAI = fixture.Model
    try:
        a, thread = await fixture.owner()
        b, other = await fixture.owner()
        uploaded = await files.upload(
            a,
            uuid4(),
            "laporan-penjualan-NG039.txt",
            b"Kuncikonten039 Januari 100 Februari 120",
        )
        rid = uploaded["uploaded_revision_id"]
        file_id = uploaded["id"]
        ref = ResourceRef(kind="file", id=file_id, revision=1, revision_id=rid)
        await files.upload(b, uuid4(), "rahasia-akun-b039.txt", b"PrivateKeyword039")
        task = await creation.create(
            a,
            thread,
            uuid4(),
            "Laporan NG039",
            False,
            inputs=[{"revision_id": str(rid)}],
            outputs=[{"filename": "laporan.md", "format": "md"}],
        )
        task = await fixture.run(a, task)
        check("controlled_task_published", task["status"] == "succeeded")
        result_id = task["result_id"]
        result_ref = ResourceRef(kind="result", id=result_id, revision=1)
        gid, sid = uuid4(), uuid4()
        goal = GoalSpec(
            title="Tujuan NG039", target="Rilis laporan", criteria=["Laporan tersedia"]
        )
        async with transaction() as conn:
            await conn.execute(
                "UPDATE chat_threads SET title='Percakapan NG039' WHERE id=%s",
                (thread,),
            )
            await conn.execute(
                "INSERT INTO user_goals(id,owner_id,thread_id,spec) VALUES (%s,%s,%s,%s)",
                (gid, a, thread, chat.json_value(goal.model_dump())),
            )
            await conn.execute(
                "INSERT INTO user_schedules(id,owner_id,thread_id,state,spec) "
                "VALUES (%s,%s,%s,'paused',%s)",
                (
                    sid,
                    a,
                    thread,
                    chat.json_value(
                        {"title": "Jadwal NG039", "instruction": "Perbarui laporan"}
                    ),
                ),
            )
        rows = (await find(a, "NG039"))["items"]
        check(
            "all_six_resource_kinds",
            {i["ref"]["kind"] for i in rows}
            == {"thread", "task", "file", "result", "goal", "schedule"},
        )
        check(
            "cross_account_no_title_or_count",
            (await find(a, "rahasia-akun-b039"))["items"] == [],
        )
        check(
            "cross_account_no_content",
            (await find(a, "PrivateKeyword039"))["items"] == [],
        )
        check(
            "filename_punctuation_is_searchable",
            bool((await find(a, "laporan penjualan NG039", kinds=["file"]))["items"]),
        )
        check(
            "snippet_is_plain_text",
            all(
                ",StopSel=" not in row["snippet"]
                for row in (await find(a, "Kuncikonten039"))["items"]
            ),
        )
        check(
            "existing_file_text_searchable",
            any(
                i["ref"]["kind"] == "file"
                for i in (await find(a, "Kuncikonten039"))["items"]
            ),
        )
        check("sql_input_is_literal", (await find(a, "' OR 1=1 --"))["items"] == [])
        for kind in ("thread", "task", "file", "result", "goal", "schedule"):
            hits = (await find(a, "NG039", kinds=[kind]))["items"]
            check(
                f"filter_{kind}",
                bool(hits) and all(i["ref"]["kind"] == kind for i in hits),
            )
            await reject(
                f"read_other_owner_{kind}",
                reader.read(b, ResourceRef.model_validate(hits[0]["ref"])),
                404,
            )
        first = await find(a, "", limit=2, sort="title")
        second = await find(a, "", limit=2, offset=first["next_offset"], sort="title")
        check(
            "pagination_has_more",
            first["next_offset"] == 2 and len(second["items"]) == 2,
        )
        check(
            "pagination_no_duplicate",
            not (
                {str(v["ref"]) for v in first["items"]}
                & {str(v["ref"]) for v in second["items"]}
            ),
        )
        check(
            "future_date_filter",
            (await find(a, since=datetime.now(UTC) + timedelta(days=1)))["items"] == [],
        )
        check("empty_state", (await find(a, "noSuchResource039"))["items"] == [])
        read = await reader.read(a, ref)
        check(
            "read_file_content_and_identity",
            "Kuncikonten039" in read["content"]
            and read["ref"]["revision_id"] == str(rid),
        )
        check("no_storage_paths", "object_key" not in json.dumps(read, default=str))
        await reject(
            "wrong_file_revision_pair",
            reader.read(a, ResourceRef(kind="file", id=uuid4(), revision_id=rid)),
            404,
        )
        await reject(
            "wrong_revision_number",
            reader.read(
                a, ResourceRef(kind="file", id=file_id, revision=2, revision_id=rid)
            ),
            409,
        )
        await files.upload(
            a, uuid4(), "laporan-NG039-v2.txt", b"Revisibaru039", file_id
        )
        hits = (await find(a, "Revisibaru039", kinds=["file"]))["items"]
        check("search_uses_ready_revision", hits[0]["ref"]["revision"] == 2)
        check(
            "historical_revision_still_exact",
            "Kuncikonten039" in (await reader.read(a, ref))["content"],
        )
        pending_file = await files.upload(
            a, uuid4(), "laporan-pending.txt", b"PendingOnly039", file_id
        )
        async with transaction() as conn:
            await conn.execute(
                "UPDATE file_revisions SET status='uploading' WHERE id=%s",
                (pending_file["uploaded_revision_id"],),
            )
        check(
            "unfinished_upload_preserves_searchable_ready_revision",
            bool((await find(a, "Revisibaru039", kinds=["file"]))["items"]),
        )
        check(
            "default_read_uses_latest_ready_revision",
            (await reader.read(a, ResourceRef(kind="file", id=file_id)))["ref"][
                "revision"
            ]
            == 2,
        )
        async with transaction() as conn:
            for index in range(35):
                await conn.execute(
                    "INSERT INTO chat_messages(id,thread_id,role,parts,position) "
                    "VALUES (%s,%s,'user',%s,%s)",
                    (
                        uuid4(),
                        thread,
                        chat.json_value(
                            [
                                {
                                    "id": "text",
                                    "type": "text",
                                    "text": "OldMessage039"
                                    if index == 0
                                    else "other text",
                                }
                            ]
                        ),
                        10000 + index,
                    ),
                )
        check(
            "search_finds_messages_outside_recent_context",
            bool((await find(a, "OldMessage039", kinds=["thread"]))["items"]),
        )
        async with transaction() as conn:
            source = await chat.one(
                conn,
                "SELECT id FROM chat_messages WHERE thread_id=%s AND position=10000",
                (thread,),
            )
            await conn.execute(
                "INSERT INTO memory_excluded_sources(owner_id,source_kind,source_id,source_revision,reason) "
                "VALUES (%s,'message',%s,'v1','forgotten')",
                (a, source["id"]),
            )
        check(
            "forgotten_source_turn_excluded",
            not (await find(a, "OldMessage039", kinds=["thread"]))["items"],
        )
        large = await files.upload(
            a, uuid4(), "besar039.txt", ("Aksara039 é " * 3000).encode()
        )
        data = await reader.read(a, ResourceRef(kind="file", id=large["id"]))
        check(
            "read_byte_limit",
            len(data["content"].encode()) <= 12000 and data["truncated"],
        )
        await selection.select(a, thread, ref)
        await reject("select_foreign_thread", selection.select(a, other, ref), 404)
        async with transaction() as conn:
            current = await selection.current(conn, a, thread)
        check("selection_is_durable", current["ref"]["revision_id"] == str(rid))
        submitted = await chat.submit(a, thread, uuid4(), "Ringkas pilihan ini.")
        run = await chat.claim(UUID(str(submitted["id"])))
        assert run is not None
        check(
            "submission_captures_exact_ref",
            run["resource_context"] == ref.model_dump(mode="json"),
        )
        check("submission_tracks_ref", len(run["resource_refs"]) == 1)
        tool = tools_for(run)[1]
        read = await tool.ainvoke({"ref": ref.model_dump(mode="json")})
        check("agent_read_tool_content", read["content_available"])
        search_tool = tools_for(run)[0]
        result = await search_tool.ainvoke({"query": "NG039", "kinds": ["result"]})
        check(
            "agent_search_tool_shared_service",
            result["items"][0]["ref"]["kind"] == "result",
        )
        projection = Projection()
        projection.message(
            ToolMessage(
                name="search_resources",
                content=json.dumps(result),
                tool_call_id="search039",
            )
        )
        card = next(p for p in projection.parts if p["type"] == "resources")
        check(
            "cards_persist_only_refs",
            bool(card["refs"]) and "snippet" not in json.dumps(card),
        )
        thread_tool = tools_for(run)[1]
        await thread_tool.ainvoke({"ref": {"kind": "thread", "id": str(thread)}})
        check("thread_read_tracks_current_privacy_generation", await guard.ensure(run))
        async with transaction() as conn:
            await conn.execute(
                "UPDATE memory_settings SET generation=generation+1 WHERE owner_id=%s",
                (a,),
            )
        check("privacy_change_revokes_thread_context", not await guard.ensure(run))
        await chat.cancel(a, UUID(str(submitted["id"])))
        try:
            await tool.ainvoke({"ref": ref.model_dump(mode="json")})
        except chat.StaleRun:
            pass
        else:
            raise AssertionError("Cancelled agent tool must not persist context")
        # Existing result update can be requested from another owned conversation.
        target = await chat.create_thread(a, uuid4())
        new_task = await creation.create(
            a,
            target["id"],
            uuid4(),
            "Revisi NG039",
            False,
            outputs=[{"filename": "laporan.md", "format": "md"}],
            result_id=result_id,
            expected_result_revision=1,
        )
        new_task = await fixture.run(a, new_task)
        check("cross_thread_result_revision", new_task["status"] == "succeeded")
        await reject(
            "stale_result_update",
            creation.create(
                a,
                thread,
                uuid4(),
                "stale",
                False,
                outputs=[{"filename": "laporan.md", "format": "md"}],
                result_id=result_id,
                expected_result_revision=1,
            ),
            409,
        )
        check(
            "old_result_read_exact",
            (await reader.read(a, result_ref))["ref"]["revision"] == 1,
        )
        await deletion.file(a, file_id)
        async with transaction() as conn:
            removed = await chat.one(
                conn,
                "SELECT bool_and(search_text='') AS cleared "
                "FROM file_revisions WHERE file_id=%s",
                (file_id,),
            )
            assert removed["cleared"], "Deletion must clear derived search text"
        check(
            "deleted_file_not_searchable",
            (await find(a, "Revisibaru039", kinds=["file"]))["items"] == [],
        )
        await reject("deleted_file_ref_denied", reader.read(a, ref), 404)
        check("tracked_source_revocation", not await guard.ensure(run))
        async with transaction() as conn:
            selected = await selection.current(conn, a, thread)
        check("stale_selection_visible", selected["unavailable"])
        await reject(
            "stale_selection_blocks_submission",
            chat.submit(a, thread, uuid4(), "Pakai ini."),
            409,
        )
        await selection.select(a, thread, None)
        async with transaction() as conn:
            check(
                "selection_can_be_cleared",
                await selection.current(conn, a, thread) is None,
            )
            await conn.execute(
                "UPDATE user_schedules SET state='deleted' WHERE id=%s", (sid,)
            )
        check(
            "deleted_schedule_not_searchable",
            (await find(a, "Jadwal NG039", kinds=["schedule"]))["items"] == [],
        )
        await reject(
            "deleted_schedule_read_denied",
            reader.read(a, ResourceRef(kind="schedule", id=sid)),
            404,
        )
        await deletion.result(a, result_id)
        check(
            "deleted_result_not_searchable",
            (await find(a, "", kinds=["result"]))["items"] == [],
        )
        await reject("deleted_result_read_denied", reader.read(a, result_ref), 404)
        check(
            "capabilities_have_no_connectors",
            not any(
                "connector" in c["id"] for c in capabilities.inventory()["capabilities"]
            ),
        )
        from ngertiin.config import get_settings
        from pydantic import SecretStr

        settings = get_settings()
        original_key = settings.daytona_api_key
        settings.daytona_api_key = SecretStr("")
        try:
            check(
                "disabled_runtime_not_offered",
                all(
                    not c["available"]
                    for c in capabilities.inventory()["capabilities"]
                    if c["id"] in ("browser", "code")
                ),
            )
        finally:
            settings.daytona_api_key = original_key
        # Exercise actual HTTP authentication and request validation.
        from ngertiin.accounts.auth import current_account
        from ngertiin.api.app import app
        from ngertiin.models import Account

        async with httpx.AsyncClient(
            transport=httpx.ASGITransport(app=app), base_url="http://test"
        ) as client:
            check(
                "unauthenticated_search_denied",
                (
                    await client.post("/library/search", json={"query": "NG039"})
                ).status_code
                == 401,
            )
            app.dependency_overrides[current_account] = lambda: Account(
                id=b, clerk_user_id="probe-b"
            )
            try:
                response = await client.post(
                    "/library/read", json=ref.model_dump(mode="json")
                )
                check("http_owner_is_server_bound", response.status_code == 404)
                check(
                    "invalid_kind_rejected",
                    (
                        await client.post(
                            "/library/search", json={"kinds": ["connector"]}
                        )
                    ).status_code
                    == 422,
                )
                check(
                    "invalid_page_rejected",
                    (
                        await client.post("/library/search", json={"limit": 10000})
                    ).status_code
                    == 422,
                )
                check(
                    "naive_date_rejected",
                    (
                        await client.post(
                            "/library/search", json={"since": "2026-01-01T00:00:00"}
                        )
                    ).status_code
                    == 422,
                )
                check(
                    "hits_hide_invalid_refs",
                    (
                        await client.post(
                            "/library/hits",
                            json={"refs": [ref.model_dump(mode="json")]},
                        )
                    ).json()["items"]
                    == [],
                )
            finally:
                app.dependency_overrides.clear()
    finally:
        workflow.ChatOpenAI = original
        await close_pool()


if __name__ == "__main__":
    fixture.scenarios = scenarios
    if "--output" not in sys.argv:
        sys.argv.extend(["--output", ".dev/library-contracts.json"])
    fixture.main()
