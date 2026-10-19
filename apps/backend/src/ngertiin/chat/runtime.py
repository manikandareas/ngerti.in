"""One bounded async agent turn, independent of any browser connection."""

import asyncio
import time
from contextlib import suppress
from typing import Any
from uuid import UUID

import psycopg
import structlog
from langchain.agents import create_agent
from langchain.agents.middleware import (
    HumanInTheLoopMiddleware,
    ModelCallLimitMiddleware,
    ToolCallLimitMiddleware,
    wrap_tool_call,
)
from langchain_core.messages import AIMessageChunk
from langchain_core.tools import tool
from langchain_openai import ChatOpenAI
from langgraph.types import Command
from psycopg.rows import dict_row

from ngertiin.async_db import transaction
from ngertiin.chat.approvals import save_interrupts
from ngertiin.chat.checkpoints import RunSaver
from ngertiin.chat.projection import Projection
from ngertiin.chat.store import StaleRun, claim, one, publish
from ngertiin.config import get_settings

logger = structlog.get_logger()


def build_agent(run: dict, saver, projection: Projection):
    settings = get_settings()

    @tool
    async def read_recent_messages() -> dict:
        """Baca pesan terbaru dari thread ini bila konteks percakapan perlu diperiksa."""
        async with transaction() as conn:
            rows = await (
                await conn.execute(
                    "SELECT role,parts FROM chat_messages WHERE thread_id=%s AND run_id<>%s "
                    "AND status='complete' "
                    "ORDER BY position DESC LIMIT 20",
                    (run["thread_id"], run["id"]),
                )
            ).fetchall()
        messages, remaining = [], 12000
        for row in rows:
            text = "\n".join(p.get("text", "") for p in row["parts"] if p["type"] == "text")
            if not text or remaining <= 0:
                continue
            messages.append({"role": row["role"], "content": text[:remaining]})
            remaining -= len(messages[-1]["content"])
        return {
            "messages": list(reversed(messages)),
            "message": "Riwayat percakapan ini telah dibaca.",
        }

    @tool
    async def read_agent_profile() -> dict:
        """Baca identitas agent personal yang dipakai bersama oleh thread pengguna ini."""
        return {
            "name": run["profile"]["name"],
            "revision": run["profile"]["revision"],
            "message": "Profil agent personal telah dibaca.",
        }

    @tool
    async def read_thread_files() -> dict:
        """Temukan revision file yang benar-benar dilampirkan pada percakapan ini.

        Hanya metadata; gunakan referensi exact untuk pekerjaan file melalui start_background_task.
        """
        async with transaction() as conn:
            rows = await (
                await conn.execute(
                    "SELECT DISTINCT r.id AS revision_id,r.filename,r.revision,r.sha256 "
                    "FROM task_file_inputs i JOIN background_tasks t ON t.id=i.task_id "
                    "JOIN file_revisions r ON r.id=i.revision_id "
                    "JOIN product_files f ON f.id=r.file_id WHERE t.owner_id=%s "
                    "AND t.thread_id=%s AND r.status='ready' AND f.deleted_at IS NULL LIMIT 20",
                    (run["owner_id"], run["thread_id"]),
                )
            ).fetchall()
        return {"files": [{**row, "revision_id": str(row["revision_id"])} for row in rows]}

    @tool
    async def start_background_task(
        instruction: str,
        review_before_finish: bool = False,
        file_inputs: list[dict] | None = None,
        output_files: list[dict] | None = None,
        use_computation: bool = False,
        use_browser: bool = False,
    ) -> dict:
        """Titipkan satu pekerjaan teks/file atas permintaan eksplisit pengguna.

        Gunakan untuk menulis, merangkum, atau menyusun rencana dari konteks chat.
        review_before_finish=True bila pengguna meminta review sebelum finalisasi.
        file_inputs: [{revision_id,start:1,end:null}] dari read_thread_files, tanpa menebak ID.
        output_files: [{filename:'hasil.md',format:'md'}]; format md/txt/csv/json/html statis.
        use_computation=True untuk menghitung/mengolah data dengan Python offline di sandbox.
        use_browser=True untuk pekerjaan situs/browser yang diminta eksplisit; login lewat takeover.
        Browser pribadi dipakai lintas Task, klik/ketik/tombol memerlukan keputusan pengguna.
        Jangan gabungkan use_browser dengan use_computation atau lampiran. Jadwal belum tersedia.
        """
        from uuid import uuid5

        from ngertiin.tasks.creation import create

        if use_browser and use_computation:
            raise ValueError("Pilih browser atau Python offline untuk satu Task.")

        task = await create(
            run["owner_id"],
            run["thread_id"],
            uuid5(run["id"], "background-task"),
            instruction,
            review_before_finish,
            source_run=run,
            inputs=file_inputs,
            outputs=output_files,
            runtime_kind="browser" if use_browser else "code" if use_computation else "text",
        )
        return {
            "task_id": str(task["id"]),
            "status": task["status"],
            "message": "Task tersimpan dan berjalan di background. Pengguna "
            "dapat melanjutkan chat.",
        }

    @wrap_tool_call
    async def track_tool(request, handler):
        call = request.tool_call
        projection.upsert(
            {
                "id": call["id"],
                "type": "tool",
                "name": call["name"],
                "input": call["args"],
                "status": "running",
            }
        )
        await publish(run, projection.parts, "running", usage=projection.usage)
        return await handler(request)

    model = ChatOpenAI(
        model=settings.openai_model,
        api_key=settings.openai_api_key,
        base_url=settings.openai_base_url,
        use_responses_api=True,
        reasoning={"effort": "low", "summary": "auto"},
        max_tokens=settings.chat_max_output_tokens,
        max_retries=0,
        timeout=90,
        output_version="responses/v1",
        stream_usage=True,
    )
    middleware: list[Any] = [
        HumanInTheLoopMiddleware(
            interrupt_on={},
            interrupt_mode="per_call",
        ),
        ModelCallLimitMiddleware(thread_limit=settings.chat_max_model_calls, exit_behavior="error"),
        ToolCallLimitMiddleware(thread_limit=10, exit_behavior="error"),
        track_tool,
    ]
    return create_agent(
        model,
        tools=[read_recent_messages, read_agent_profile, read_thread_files, start_background_task],
        system_prompt=run["profile"]["soul"]
        + (
            "\nJika pengguna secara eksplisit meminta pekerjaan teks di background, gunakan "
            "start_background_task satu kali, lalu beri konfirmasi singkat dan akhiri giliran. "
            "Pertanyaan biasa dijawab langsung. Pesan baru tidak mengubah instruksi task lama. "
            "Untuk mengolah file yang pernah dilampirkan, baca read_thread_files lalu buat satu "
            "Task dengan revision exact dan output_files. Jangan mengklaim isi sudah dibaca hanya "
            "dari metadata. Untuk hitungan/analisis data nyata gunakan use_computation=True. "
            "Untuk permintaan eksplisit membuka/menggunakan situs, gunakan use_browser=True; "
            "pengguna dapat login melalui takeover dan memakai login lagi lintas Task. "
            "Jangan mengklaim telah membaca situs sebelum hasil Task tersedia. "
            "Browser tidak mengubah tujuan/izin Task lain; jadwal belum tersedia."
        ),
        middleware=middleware,
        checkpointer=saver,
    )


async def initial_history(run: dict):
    async with transaction() as conn:
        rows = await (
            await conn.execute(
                "SELECT role,parts FROM chat_messages WHERE thread_id=%s AND status='complete' "
                "AND created_at <= (SELECT created_at FROM chat_runs WHERE id=%s) "
                "ORDER BY position DESC LIMIT 24",
                (run["thread_id"], run["id"]),
            )
        ).fetchall()
    history, remaining = [], 36000
    for row in rows:
        text = "\n".join(p.get("text", "") for p in row["parts"] if p["type"] == "text")
        if not text or remaining <= 0:
            continue
        text = text[:remaining]
        remaining -= len(text)
        history.append({"role": row["role"], "content": text})
    return list(reversed(history))


async def watch_cancellation(run: dict, task: asyncio.Task):
    while not task.done():
        await asyncio.sleep(0.75)
        async with transaction() as conn:
            valid = await one(
                conn,
                "SELECT id FROM chat_runs WHERE id=%s AND lease_token=%s AND NOT cancel_requested",
                (run["id"], run["lease_token"]),
            )
        if not valid:
            task.cancel()
            return


async def execute(run: dict):
    projection = Projection()
    projection.usage = {
        key: value for key, value in run["usage"].items() if not key.startswith("lc_run--")
    }
    # A graph per turn keeps abandoned approvals independent of later turns and workflows.
    config = {"configurable": {"thread_id": f"chat:{run['id']}"}, "recursion_limit": 30}
    settings = get_settings()
    async with await psycopg.AsyncConnection.connect(
        settings.database_url.get_secret_value(),
        autocommit=True,
        prepare_threshold=0,
        row_factory=dict_row,
    ) as connection:
        saver = RunSaver(connection, run)
        agent = build_agent(run, saver, projection)
        saved = await agent.aget_state(config)
        if saved.values:
            projection.reconcile(saved.values.get("messages", []))
        await publish(run, projection.parts, "running", usage=projection.usage)
        if saved.interrupts and not run["resume"]:
            await save_interrupts(run, list(saved.interrupts), projection.parts, projection.usage)
            return
        value: Any = (
            Command(resume=run["resume"])
            if run["resume"] and saved.interrupts
            else (None if saved.values else {"messages": await initial_history(run)})
        )
        flushed = time.monotonic()
        async for part in agent.astream(
            value,
            config=config,
            stream_mode=["messages", "updates", "custom"],
            version="v2",
            durability="sync",
        ):
            if part["type"] == "messages":
                chunk, metadata = part["data"]
                if isinstance(chunk, AIMessageChunk):
                    projection.chunk(chunk, source=metadata.get("langgraph_checkpoint_ns"))
            elif part["type"] == "updates":
                for update in part["data"].values():
                    if isinstance(update, dict):
                        for message in update.get("messages", []):
                            projection.message(message)
            if time.monotonic() - flushed >= 0.06:
                await publish(run, projection.parts, "running", usage=projection.usage)
                flushed = time.monotonic()
        state = await agent.aget_state(config)
        projection.reconcile(state.values.get("messages", []))
        async with transaction() as conn:
            decisions = await (
                await conn.execute(
                    "SELECT action,status FROM chat_approvals WHERE run_id=%s",
                    (run["id"],),
                )
            ).fetchall()
        for decision in decisions:
            for part in projection.parts:
                if (
                    part["id"] == decision["action"].get("tool_call_id")
                    and decision["status"] == "rejected"
                ):
                    part["status"] = "denied"
        if state.interrupts:
            await save_interrupts(run, list(state.interrupts), projection.parts, projection.usage)
        else:
            await publish(run, projection.parts, "complete", usage=projection.usage)


async def run_turn(run_id: str):
    run = await claim(UUID(run_id))
    if not run:
        return
    logger.info("chat.started", run_id=run_id, attempt=run["attempt"])
    execution = asyncio.create_task(execute(run))
    watcher = asyncio.create_task(watch_cancellation(run, execution))
    try:
        async with asyncio.timeout(get_settings().chat_run_timeout_seconds):
            await execution
    except StaleRun:
        # Ownership is already revoked by the durable cancel command or a newer attempt.
        execution.cancel()
        await asyncio.gather(execution, return_exceptions=True)
    except asyncio.CancelledError:
        execution.cancel()
        await asyncio.gather(execution, return_exceptions=True)
        async with transaction() as conn:
            valid = await one(
                conn, "SELECT cancel_requested FROM chat_runs WHERE id=%s", (run["id"],)
            )
            if valid and not valid["cancel_requested"]:
                await conn.execute(
                    "UPDATE chat_runs SET status='queued',lease_token=NULL "
                    "WHERE id=%s AND lease_token=%s",
                    (run["id"], run["lease_token"]),
                )
                raise
    except Exception as error:
        execution.cancel()
        await asyncio.gather(execution, return_exceptions=True)
        logger.error("chat.failed", run_id=run_id, error_type=type(error).__name__)
        async with transaction() as conn:
            message = await one(
                conn,
                "SELECT parts FROM chat_messages WHERE run_id=%s AND role='assistant'",
                (run["id"],),
            )
        with suppress(StaleRun):
            await publish(
                run,
                message["parts"],
                "failed",
                error="Respons terhenti. Pesanmu tersimpan; kamu dapat mencoba lagi.",
            )
    finally:
        watcher.cancel()
        await asyncio.gather(watcher, return_exceptions=True)
    logger.info("chat.finished", run_id=run_id)
