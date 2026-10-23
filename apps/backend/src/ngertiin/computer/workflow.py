"""Versioned browser workflow dispatch; existing Task snapshots retain their contract."""


async def draft(execution):
    version = execution["budget_policy"]["computer"].get("workflow_version", 1)
    if version == 2:
        from ngertiin.computer.supervisor import draft as run
    elif version == 1:
        from ngertiin.computer.legacy_workflow import draft as run
    else:
        raise ValueError("Versi workflow browser belum didukung.")
    await run(execution)
