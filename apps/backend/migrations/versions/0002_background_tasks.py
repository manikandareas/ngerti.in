"""Durable text tasks, exact review, executions and internal compute reservations."""

from alembic import op

revision = "0002_background_tasks"
down_revision = "0001_v1_baseline"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("""
    CREATE TABLE background_tasks (
      id uuid PRIMARY KEY, owner_id uuid NOT NULL REFERENCES accounts(id),
      thread_id uuid NOT NULL REFERENCES chat_threads(id),
      source_run_id uuid REFERENCES chat_runs(id),
      request_key uuid NOT NULL, fingerprint text NOT NULL,
      title text NOT NULL, instruction text NOT NULL, input_snapshot jsonb NOT NULL,
      revision integer NOT NULL DEFAULT 1, review_required boolean NOT NULL,
      status text NOT NULL DEFAULT 'queued'
        CHECK (status IN ('queued','running','waiting_user','succeeded','failed','cancelled')),
      stage text NOT NULL DEFAULT 'queued', draft text NOT NULL DEFAULT '', result text,
      error text, resume jsonb, lease_token uuid, job_id bigint,
      attempt integer NOT NULL DEFAULT 0, model_calls integer NOT NULL DEFAULT 0,
      budget_day date NOT NULL DEFAULT (now() AT TIME ZONE 'UTC')::date,
      budget_cap integer NOT NULL CHECK (budget_cap > 0),
      budget_policy jsonb NOT NULL, usage_units integer NOT NULL DEFAULT 0,
      created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
      UNIQUE(owner_id,request_key), CHECK (usage_units >= 0 AND usage_units <= budget_cap)
    );
    CREATE INDEX background_tasks_owner ON background_tasks(owner_id,created_at DESC);
    CREATE INDEX background_tasks_thread ON background_tasks(thread_id,created_at DESC);
    CREATE TABLE task_executions (
      id uuid PRIMARY KEY, task_id uuid NOT NULL REFERENCES background_tasks(id),
      revision integer NOT NULL, attempt integer NOT NULL, lease_token uuid NOT NULL UNIQUE,
      status text NOT NULL CHECK
        (status IN ('running','waiting_user','succeeded','failed','cancelled','interrupted')),
      draft text NOT NULL DEFAULT '',
      started_at timestamptz NOT NULL DEFAULT now(), finished_at timestamptz,
      UNIQUE(task_id,attempt)
    );
    CREATE TABLE task_revisions (
      task_id uuid NOT NULL REFERENCES background_tasks(id), revision integer NOT NULL,
      draft text NOT NULL, request_key uuid NOT NULL, fingerprint text NOT NULL,
      created_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY(task_id,revision),
      UNIQUE(task_id,request_key)
    );
    CREATE TABLE task_actions (
      id uuid PRIMARY KEY, task_id uuid NOT NULL REFERENCES background_tasks(id),
      revision integer NOT NULL, kind text NOT NULL CHECK (kind='finalize_text'),
      target_id uuid NOT NULL, content_hash text NOT NULL, content text NOT NULL,
      status text NOT NULL DEFAULT 'proposed'
        CHECK (status IN
          ('proposed','approved','rejected','expired','executing','succeeded','unknown','cancelled')),
      decision_key uuid, expires_at timestamptz NOT NULL DEFAULT (now()+interval '7 days'),
      outcome jsonb, created_at timestamptz NOT NULL DEFAULT now(), decided_at timestamptz,
      UNIQUE(task_id,revision)
    );
    CREATE TABLE task_cost_events (
      id uuid PRIMARY KEY, task_id uuid NOT NULL REFERENCES background_tasks(id),
      execution_id uuid NOT NULL REFERENCES task_executions(id),
      provider text NOT NULL, model text NOT NULL, policy_version text NOT NULL,
      reserved_units integer NOT NULL CHECK (reserved_units > 0),
      charged_units integer NOT NULL CHECK (charged_units >= 0),
      state text NOT NULL CHECK (state IN ('reserved','confirmed','unknown')),
      usage jsonb NOT NULL DEFAULT '{}', created_at timestamptz NOT NULL DEFAULT now(),
      settled_at timestamptz
    );
    CREATE TABLE task_deliveries (
      task_id uuid PRIMARY KEY REFERENCES background_tasks(id),
      action_id uuid NOT NULL UNIQUE REFERENCES task_actions(id),
      message_id uuid NOT NULL UNIQUE REFERENCES chat_messages(id),
      created_at timestamptz NOT NULL DEFAULT now()
    );
    CREATE TABLE task_commands (
      task_id uuid NOT NULL REFERENCES background_tasks(id), request_key uuid NOT NULL,
      command text NOT NULL, created_at timestamptz NOT NULL DEFAULT now(),
      PRIMARY KEY(task_id,request_key)
    );
    """)


def downgrade() -> None:
    for table in (
        "task_commands",
        "task_deliveries",
        "task_cost_events",
        "task_actions",
        "task_revisions",
        "task_executions",
        "background_tasks",
    ):
        op.drop_table(table)
