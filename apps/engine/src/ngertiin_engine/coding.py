"""Thin exact-pin adapters for native checkpoints, LSP and isolated Git worktrees.

Handlers run only inside the secret-free worker. Project paths never select a
gateway host mount. Worktree cleanup is deliberately stricter than upstream's
archive-and-remove default: active, dirty and committed task work stays intact.
"""

import hashlib
import json
import os
from pathlib import Path
from uuid import uuid4

_before = {}

SCHEMA = {
    "name": "coding",
    "description": "Manage this private native workspace: select a named project and optional relative folders, inspect instructions, create/list shadow-git checkpoints, inspect diff and hashes, restore selected files with expected_hashes from inspect, run real LSP diagnostics, or create/release/cleanup an isolated worktree. Use terminal and native file tools to edit. Restore changes files only; it never rewinds external receipts. Worktree cleanup refuses active or dirty work.",
    "parameters": {
        "type": "object",
        "properties": {
            "action": {
                "type": "string",
                "enum": [
                    "inspect",
                    "project",
                    "checkpoint",
                    "diff",
                    "restore",
                    "diagnostics",
                    "worktree",
                    "release",
                    "cleanup",
                ],
            },
            "project": {"type": "string"},
            "folders": {"type": "array", "items": {"type": "string"}, "maxItems": 10},
            "path": {"type": "string"},
            "checkpoint": {"type": "string"},
            "expected_hashes": {
                "type": "object",
                "additionalProperties": {"type": ["string", "null"]},
            },
            "worktree_id": {"type": "string"},
        },
        "required": ["action"],
        "additionalProperties": False,
    },
}


def path_in(root, relative="."):
    if (
        not isinstance(relative, str)
        or "\\" in relative
        or "\x00" in relative
        or Path(relative).is_absolute()
        or ".." in Path(relative).parts
    ):
        raise ValueError("Use a relative workspace path")
    result = (root / relative).resolve()
    if not result.is_relative_to(root.resolve()):
        raise ValueError("Workspace symlink escape refused")
    return result


def state():
    location = Path("/work/state/workspaces.json")
    if location.exists():
        return json.loads(location.read_text())
    return {
        "project": "Default",
        "root": "/work/project",
        "folders": ["."],
        "worktrees": {},
    }


def save(value):
    location = Path("/work/state/workspaces.json")
    temporary = location.with_suffix(".tmp")
    with temporary.open("w") as stream:
        json.dump(value, stream)
        stream.flush()
        os.fsync(stream.fileno())
    temporary.replace(location)


def root():
    selected = Path(state()["root"])
    if not selected.resolve().is_relative_to(Path("/work")):
        raise ValueError("Invalid workspace binding")
    selected.mkdir(parents=True, exist_ok=True)
    return selected


def prepare(task_id):
    from tools.terminal_tool import register_task_env_overrides

    selected = root()
    register_task_env_overrides(task_id, {"cwd": str(selected)})
    os.chdir(selected)
    return selected


def hashes(directory):
    result = {}
    for current, dirs, names in os.walk(directory, followlinks=False):
        dirs[:] = [
            d
            for d in dirs
            if d not in {".git", ".worktrees", "node_modules", ".venv", "__pycache__"}
            and not (Path(current) / d).is_symlink()
        ]
        for name in names:
            if name == ".git":
                continue
            path = Path(current) / name
            if path.is_symlink() or not path.is_file():
                continue
            if path.stat().st_size <= 10 * 1024 * 1024:
                result[str(path.relative_to(directory))] = hashlib.sha256(
                    path.read_bytes()
                ).hexdigest()
            if len(result) > 10000:
                raise ValueError("Workspace inspection exceeds 10000 files")
    return result


def before_edit(name):
    global _before
    if name in {"write_file", "patch", "terminal", "execute_code"}:
        from tools.checkpoint_manager import CheckpointManager

        CheckpointManager(enabled=True).ensure_checkpoint(
            str(root()), "Before native " + name
        )
        _before = hashes(root())


def after_edit(name, args):
    if name in {"write_file", "patch", "terminal", "execute_code"}:
        from tools.checkpoint_manager import CheckpointManager

        current = hashes(root())
        manager = CheckpointManager(enabled=True)
        for path, sha in current.items():
            if _before.get(path) != sha:
                manager.record_agent_write(str(root() / path))


def reference(args, task_id, allowed):
    directory = prepare(task_id)
    kind, target = args["kind"], args["target"]
    if kind == "instructions" and "coding" in allowed:
        return {"instructions": instructions(directory, state()["folders"])}
    if kind == "file" and "read_file" in allowed:
        from tools.registry import registry

        path = path_in(directory, target)
        return registry.dispatch(
            "read_file", {"path": str(path), "limit": 300}, task_id=task_id
        )
    if kind == "folder" and "read_file" in allowed:
        path = path_in(directory, target)
        return {
            "folder": target,
            "entries": sorted(
                p.name + ("/" if p.is_dir() else "")
                for p in path.iterdir()
                if not p.is_symlink()
            )[:100],
        }
    if (
        kind == "git"
        and "coding" in allowed
        and str(target).isdecimal()
        and 1 <= int(target) <= 10
    ):
        from tools.subagent_worktree import _run_git

        result = _run_git(["diff", "HEAD~" + target, "--", "."], cwd=str(directory))
        return {
            "diff": result.stdout[:64000],
            "error": result.stderr[:1000] if result.returncode else None,
        }
    return {"error": "WORKSPACE_REFERENCE_UNAVAILABLE", "outcome": "rejected"}


def instructions(directory, folders):
    result = []
    for folder in folders:
        selected = path_in(directory, folder)
        for parent in [
            directory,
            *list(selected.relative_to(directory).parents)[::-1],
            selected,
        ]:
            parent = parent if parent.is_absolute() else directory / parent
            for name in ("AGENTS.md", "CLAUDE.md", ".hermes.md", ".cursorrules"):
                candidate = path_in(
                    directory, str((parent / name).relative_to(directory))
                )
                if (
                    candidate.is_file()
                    and candidate.stat().st_size <= 100000
                    and str(candidate) not in {i["path"] for i in result}
                ):
                    from agent.prompt_builder import _scan_context_content

                    # Instruction scanning remains the pinned native behavior.
                    text = candidate.read_text(errors="replace")
                    result.append(
                        {
                            "path": str(candidate),
                            "content": _scan_context_content(text, name),
                        }
                    )
    return result


def execute(args, task_id):
    from tools.checkpoint_manager import CheckpointManager
    from tools.subagent_worktree import _run_git, resolve_repo_root

    directory = root()
    manager = CheckpointManager(enabled=True)
    action = args["action"]
    selected = state()
    if action == "project":
        name = args.get("project", "")
        if not isinstance(name, str) or not 1 <= len(name) <= 120:
            raise ValueError("Project name must contain 1-120 characters")
        folders = args.get("folders", ["."])
        if not folders or len(folders) > 10:
            raise ValueError("Select between one and ten project folders")
        directory = (
            Path("/work/projects") / hashlib.sha256(name.encode()).hexdigest()[:24]
        )
        directory.mkdir(parents=True, exist_ok=True)
        for folder in folders:
            path_in(directory, folder).mkdir(parents=True, exist_ok=True)
        selected.update(project=name, root=str(directory), folders=folders)
        save(selected)
        prepare(task_id)
        action = "inspect"
    if action == "inspect":
        return {
            **selected,
            "hashes": hashes(directory),
            "checkpoints": manager.list_checkpoints(str(directory)),
            "instructions": instructions(directory, selected["folders"]),
            "files_persist": True,
            "ram_persists": "only while the scoped container remains running",
            "execution_user": os.getuid(),
        }
    if action == "checkpoint":
        taken = manager.ensure_checkpoint(
            str(directory), "Ngertiin explicit checkpoint"
        )
        return {
            "created": taken,
            "checkpoints": manager.list_checkpoints(str(directory)),
        }
    if action in {"diff", "restore"}:
        checkpoint = args.get("checkpoint", "")
        if checkpoint not in {
            c["hash"] for c in manager.list_checkpoints(str(directory))
        }:
            raise ValueError("Checkpoint does not belong to this project")
        if action == "diff":
            return {
                **manager.diff(str(directory), checkpoint),
                "hashes": hashes(directory),
            }
        expected = args.get("expected_hashes")
        current = hashes(directory)
        path = args.get("path")
        if path:
            path_in(directory, path)
            if (
                not isinstance(expected, dict)
                or path not in expected
                or current.get(path) != expected[path]
            ):
                return {"error": "RESTORE_CONFLICT", "outcome": "rejected"}
        elif not isinstance(expected, dict) or expected != current:
            return {"error": "RESTORE_CONFLICT", "outcome": "rejected"}
        manager.ensure_checkpoint(str(directory), "Before user restore")
        if not path and manager._safe_restore_plan(str(directory), checkpoint).get(
            "ledger_empty"
        ):
            return {
                "error": "NO_AGENT_WRITES_RECORDED",
                "outcome": "rejected",
                "recovery": "Select an individual file to restore after inspecting its hash.",
            }
        return manager.restore(
            str(directory), checkpoint, file_path=path, safe=not bool(path)
        )
    if action == "diagnostics":
        from types import SimpleNamespace

        from agent.lsp import get_service
        from agent.lsp.deferred import settle_for_agent

        path = path_in(directory, args.get("path", ""))
        settle_for_agent(SimpleNamespace(session_id=task_id), timeout=20)
        service = get_service()
        if not path.is_file() or not service:
            return {
                "error": "LANGUAGE_SERVER_UNAVAILABLE",
                "outcome": "rejected",
                "recovery": "Install the language server in the reviewed native image and select a Git project.",
            }
        # The public sync helper returns [] for both clean and timed-out requests.
        # Preserve the exact-pin native None sentinel so no verdict is not a pass.
        diags = service._loop.run(
            service._open_and_wait_async(str(path), budget=15), timeout=17
        )
        status = service.get_status()
        return {
            "path": str(path),
            "diagnostics": diags,
            "language_server": status,
            "verified": diags is not None
            and bool(status["clients"])
            and not status["broken"],
        }
    if action == "worktree":
        repo = resolve_repo_root(str(directory))
        if not repo or not Path(repo).resolve().is_relative_to(Path("/work")):
            raise ValueError("Select a committed Git repository inside this workspace")
        from hermes_cli._subprocess_compat import noninteractive_repo_git_env

        identity = uuid4().hex
        target = Path("/work/worktrees") / identity
        env = noninteractive_repo_git_env(repo)
        if env is None:
            raise ValueError("Git filter inspection failed")
        target.parent.mkdir(exist_ok=True)
        result = _run_git(
            ["worktree", "add", "-b", "ngertiin/" + identity, str(target), "HEAD"],
            cwd=repo,
            env=env,
        )
        if result.returncode:
            return {
                "error": "WORKTREE_CREATE_FAILED",
                "detail": result.stderr[:2000],
                "outcome": "rejected",
            }
        selected["worktrees"][identity] = {
            "path": str(target),
            "repo": repo,
            "base": _run_git(["rev-parse", "HEAD"], cwd=repo).stdout.strip(),
            "active": True,
        }
        selected["root"] = str(target)
        selected["folders"] = ["."]
        save(selected)
        prepare(task_id)
        return {"worktree_id": identity, **selected["worktrees"][identity]}
    if action in {"release", "cleanup"}:
        identity = args.get("worktree_id")
        item = selected["worktrees"].get(identity)
        if not item:
            raise ValueError("Unknown workspace worktree")
        if action == "release":
            item["active"] = False
            if selected["root"] == item["path"]:
                selected["root"] = item["repo"]
            save(selected)
            prepare(task_id)
            return item
        dirty = _run_git(
            ["status", "--porcelain", "--untracked-files=all"], cwd=item["path"]
        )
        head = _run_git(["rev-parse", "HEAD"], cwd=item["path"])
        if (
            item["active"]
            or dirty.returncode
            or head.returncode
            or dirty.stdout
            or head.stdout.strip() != item["base"]
        ):
            return {
                "error": "WORKTREE_IN_USE",
                "outcome": "rejected",
                "recovery": "Release the task and retain or commit/merge its work before cleanup.",
            }
        result = _run_git(["worktree", "remove", item["path"]], cwd=item["repo"])
        if result.returncode:
            return {"error": "WORKTREE_CLEANUP_FAILED", "outcome": "rejected"}
        item["removed"] = True
        save(selected)
        return item
    raise ValueError("Unknown coding action")


def install(*, worker=False):
    from tools.registry import registry

    def handler(args, **kwargs):
        if not worker:
            return json.dumps({"error": "WORKSPACE_UNAVAILABLE", "outcome": "rejected"})
        try:
            return json.dumps(execute(args, kwargs.get("task_id", "default")))
        except (ValueError, OSError) as exc:
            return json.dumps(
                {
                    "error": "WORKSPACE_OPERATION_FAILED",
                    "detail": str(exc)[:2000],
                    "outcome": "rejected",
                }
            )

    registry.register(
        name="coding", toolset="nma_coding", schema=SCHEMA, handler=handler
    )
