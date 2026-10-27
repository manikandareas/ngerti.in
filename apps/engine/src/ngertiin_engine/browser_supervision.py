"""Exact-pin adaptation: supervise newly created top-level Chromium tabs too.

Upstream supervises its initial page and child frames. Browser-harness creates
additional background page targets; their dialogs otherwise escape that session.
Reuse native page-domain/bridge handlers and pause new targets only until attached.
"""

import asyncio
from contextvars import ContextVar
from functools import wraps


def install():
    from tools.browser_supervisor import CDPSupervisor

    from ngertiin_engine.browser_load import INITIALIZE

    install_download_transport()

    original_attach = CDPSupervisor._attach_initial_page
    original_target = CDPSupervisor._EVENT_HANDLERS["Target.attachedToTarget"]

    async def attach(supervisor):
        await original_attach(supervisor)
        await initialize(supervisor, supervisor._page_session_id)
        info = await supervisor._cdp(
            "Target.getTargetInfo", session_id=supervisor._page_session_id
        )
        supervisor._nma_initial_target = info["result"]["targetInfo"]["targetId"]
        await supervisor._cdp(
            "Target.setAutoAttach",
            {
                "autoAttach": True,
                "waitForDebuggerOnStart": True,
                "flatten": True,
                "filter": [{"type": "page", "exclude": False}, {"exclude": True}],
            },
        )

    async def initialize(supervisor, session):
        await supervisor._cdp(
            "Page.addScriptToEvaluateOnNewDocument",
            {"source": INITIALIZE, "runImmediately": True},
            session_id=session,
        )

    async def target(supervisor, params, parent_session=None):
        info = params.get("targetInfo", {})
        session = params.get("sessionId")
        if info.get("type") != "page" or not session:
            return await original_target(supervisor, params, parent_session)

        async def prepare():
            try:
                if info.get("targetId") != getattr(
                    supervisor, "_nma_initial_target", None
                ):
                    await supervisor._enable_child_domains(session)
                    await initialize(supervisor, session)
            finally:
                await supervisor._cdp(
                    "Runtime.runIfWaitingForDebugger", session_id=session
                )

        # CDP replies are resolved by the reader that calls this handler.
        asyncio.create_task(prepare())

    CDPSupervisor._attach_initial_page = attach
    CDPSupervisor._EVENT_HANDLERS = {
        **CDPSupervisor._EVENT_HANDLERS,
        "Target.attachedToTarget": target,
    }


def install_download_transport():
    """Keep Chromium download policy alive on the native task supervisor.

    Chromium resets Browser.setDownloadBehavior when its CDP connection closes.
    Intercept only that transport call, after native validation/private-page
    guards and before native output redaction. Lost replies are never retried.
    """
    from tools import browser_cdp_tool
    from tools.browser_session_cdp import get_dialog_policy_config
    from tools.browser_supervisor import SUPERVISOR_REGISTRY

    original = browser_cdp_tool.browser_cdp
    transport = browser_cdp_tool._cdp_call
    task = ContextVar("nma_browser_cdp_task", default=None)

    @wraps(original)
    def scoped(
        method, params=None, target_id=None, frame_id=None, timeout=30.0, task_id=None
    ):
        token = task.set(task_id or "default")
        try:
            return original(method, params, target_id, frame_id, timeout, task_id)
        finally:
            task.reset(token)

    async def call(endpoint, method, params, target_id, timeout):
        if method != "Browser.setDownloadBehavior" or target_id or task.get() is None:
            return await transport(endpoint, method, params, target_id, timeout)
        task_id = task.get()

        def dispatch():
            policy, dialog_timeout = get_dialog_policy_config()
            SUPERVISOR_REGISTRY.get_or_start(
                task_id,
                endpoint,
                dialog_policy=policy,
                dialog_timeout_s=dialog_timeout,
                start_timeout=timeout,
            )
            channel = SUPERVISOR_REGISTRY.capture(task_id, timeout=timeout)
            if channel.cdp_url != endpoint:
                raise RuntimeError(
                    "Browser supervisor endpoint changed before dispatch"
                )
            return channel.call(method, params, timeout=timeout).get("result", {})

        return await asyncio.to_thread(dispatch)

    browser_cdp_tool.browser_cdp = scoped
    browser_cdp_tool._cdp_call = call
