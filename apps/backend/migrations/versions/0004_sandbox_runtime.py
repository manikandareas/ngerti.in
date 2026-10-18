"""Provider-independent sandbox ownership, dispatch receipts and durable candidates."""

from alembic import op

revision = "0004_sandbox_runtime"
down_revision = "0003_product_files"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("""
    ALTER TABLE background_tasks ADD COLUMN runtime_kind text NOT NULL DEFAULT 'text'
      CHECK (runtime_kind IN ('text','code'));
    CREATE TABLE sandbox_sessions (
      id uuid PRIMARY KEY, owner_id uuid NOT NULL REFERENCES accounts(id),
      task_id uuid NOT NULL REFERENCES background_tasks(id),
      execution_id uuid NOT NULL REFERENCES task_executions(id),
      task_revision integer NOT NULL, provider text NOT NULL, resource_name text NOT NULL,
      resource_id text, state text NOT NULL DEFAULT 'reserved'
        CHECK(state IN
          ('reserved','provisioning','ready','running','deleting','deleted','unknown')),
      policy jsonb NOT NULL, budget_day date NOT NULL,
      reserved_microusd bigint NOT NULL CHECK(reserved_microusd>0),
      charged_microusd bigint NOT NULL CHECK(charged_microusd>=0),
      cost_state text NOT NULL DEFAULT 'reserved'
        CHECK(cost_state IN ('reserved','estimated','unknown')),
      usage jsonb NOT NULL DEFAULT '{}', error text,
      created_at timestamptz NOT NULL DEFAULT now(), deadline timestamptz NOT NULL,
      deleted_at timestamptz, UNIQUE(provider,resource_name), UNIQUE(id,owner_id)
    );
    CREATE INDEX sandbox_sessions_budget ON sandbox_sessions(budget_day,owner_id);
    CREATE TABLE sandbox_steps (
      id uuid PRIMARY KEY, session_id uuid NOT NULL REFERENCES sandbox_sessions(id),
      position integer NOT NULL, code text NOT NULL, code_sha256 text NOT NULL,
      state text NOT NULL CHECK(state IN ('dispatched','complete','unknown')),
      receipt jsonb NOT NULL DEFAULT '{}', created_at timestamptz NOT NULL DEFAULT now(),
      finished_at timestamptz, UNIQUE(session_id,position)
    );
    CREATE TABLE sandbox_outputs (
      id uuid PRIMARY KEY, session_id uuid NOT NULL REFERENCES sandbox_sessions(id),
      task_id uuid NOT NULL REFERENCES background_tasks(id), owner_id uuid NOT NULL,
      filename text NOT NULL, content_type text NOT NULL, size bigint NOT NULL CHECK(size>0),
      sha256 text NOT NULL, object_key text NOT NULL UNIQUE, preview text NOT NULL,
      created_at timestamptz NOT NULL DEFAULT now(), purged_at timestamptz,
      FOREIGN KEY(session_id,owner_id) REFERENCES sandbox_sessions(id,owner_id),
      UNIQUE(session_id,filename)
    );
    """)


def downgrade() -> None:
    for table in ("sandbox_outputs", "sandbox_steps", "sandbox_sessions"):
        op.drop_table(table)
    op.execute("ALTER TABLE background_tasks DROP COLUMN runtime_kind")
