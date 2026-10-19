"""Private reusable browser profiles, exclusive control and bounded computer work."""

from alembic import op

revision = "0005_browser_workspace"
down_revision = "0004_sandbox_runtime"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("""
    ALTER TABLE background_tasks DROP CONSTRAINT background_tasks_runtime_kind_check;
    ALTER TABLE background_tasks ADD CHECK(runtime_kind IN ('text','code','browser'));
    CREATE TABLE browser_workspaces (
      id uuid PRIMARY KEY, owner_id uuid NOT NULL REFERENCES accounts(id),
      provider text NOT NULL, resource_name text NOT NULL UNIQUE, resource_id text,
      state text NOT NULL DEFAULT 'new' CHECK(state IN
        ('new','starting','ready','stopping','stopped','unknown','deleting','deleted')),
      active_task_id uuid REFERENCES background_tasks(id),
      control text NOT NULL DEFAULT 'agent'
        CHECK(control IN ('agent','handoff','human','resuming')),
      control_version bigint NOT NULL DEFAULT 1, busy uuid,
      unknown_effect boolean NOT NULL DEFAULT false,
      policy jsonb NOT NULL, error text,
      created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
      retain_until timestamptz NOT NULL, deadline timestamptz,
      UNIQUE(id,owner_id)
    );
    CREATE UNIQUE INDEX browser_one_profile ON browser_workspaces(owner_id) WHERE state<>'deleted';
    CREATE TABLE computer_sessions (
      id uuid PRIMARY KEY, workspace_id uuid NOT NULL REFERENCES browser_workspaces(id),
      owner_id uuid NOT NULL REFERENCES accounts(id),
      task_id uuid NOT NULL REFERENCES background_tasks(id),
      task_revision integer NOT NULL, state text NOT NULL DEFAULT 'reserved'
        CHECK(state IN ('reserved','active','stopping','stopped','unknown')),
      policy jsonb NOT NULL, budget_day date NOT NULL, reserved_microusd bigint NOT NULL,
      charged_microusd bigint NOT NULL, storage_microusd bigint NOT NULL DEFAULT 0,
      cost_state text NOT NULL DEFAULT 'reserved', usage jsonb NOT NULL DEFAULT '{}',
      created_at timestamptz NOT NULL DEFAULT now(), deadline timestamptz NOT NULL,
      stopped_at timestamptz, UNIQUE(id,owner_id)
    );
    CREATE UNIQUE INDEX computer_one_task_session ON computer_sessions(task_id)
      WHERE state<>'stopped';
    CREATE TABLE computer_steps (
      id uuid PRIMARY KEY, session_id uuid NOT NULL REFERENCES computer_sessions(id),
      task_id uuid NOT NULL REFERENCES background_tasks(id), control_version bigint NOT NULL,
      kind text NOT NULL, action jsonb NOT NULL, screen_hash text NOT NULL,
      state text NOT NULL CHECK(state IN
        ('observing','proposed','approved','dispatched','complete','unknown','rejected','stale')),
      created_at timestamptz NOT NULL DEFAULT now(), expires_at timestamptz NOT NULL,
      finished_at timestamptz
    );
    CREATE TABLE computer_outputs (
      id uuid PRIMARY KEY, session_id uuid NOT NULL REFERENCES computer_sessions(id),
      task_id uuid NOT NULL REFERENCES background_tasks(id), owner_id uuid NOT NULL,
      filename text NOT NULL, content_type text NOT NULL, size bigint NOT NULL CHECK(size>0),
      sha256 text NOT NULL, object_key text NOT NULL UNIQUE, preview text NOT NULL,
      created_at timestamptz NOT NULL DEFAULT now(), purged_at timestamptz,
      FOREIGN KEY(session_id,owner_id) REFERENCES computer_sessions(id,owner_id),
      UNIQUE(session_id,filename)
    );
    CREATE TABLE computer_viewers (
      id uuid PRIMARY KEY, workspace_id uuid NOT NULL REFERENCES browser_workspaces(id),
      owner_id uuid NOT NULL REFERENCES accounts(id), control_version bigint NOT NULL,
      secret_hash text NOT NULL, expires_at timestamptz NOT NULL,
      connected boolean NOT NULL DEFAULT false, closed boolean NOT NULL DEFAULT false,
      channel_deadline timestamptz NOT NULL DEFAULT now()
    );
    CREATE UNIQUE INDEX computer_one_viewer ON computer_viewers(workspace_id) WHERE NOT closed;
    CREATE INDEX computer_session_budget ON computer_sessions(budget_day,owner_id);
    CREATE INDEX computer_steps_task ON computer_steps(task_id,created_at);
    """)


def downgrade() -> None:
    for table in (
        "computer_viewers",
        "computer_outputs",
        "computer_steps",
        "computer_sessions",
        "browser_workspaces",
    ):
        op.drop_table(table)
    op.execute("ALTER TABLE background_tasks DROP CONSTRAINT background_tasks_runtime_kind_check")
    op.execute("ALTER TABLE background_tasks ADD CHECK(runtime_kind IN ('text','code'))")
