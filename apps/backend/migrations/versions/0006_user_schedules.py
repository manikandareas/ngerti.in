"""Reviewed schedules, immutable revisions and uniquely admitted occurrences."""

from alembic import op

revision = "0006_user_schedules"
down_revision = "0005_browser_workspace"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("""
    CREATE TABLE user_schedules (
      id uuid PRIMARY KEY, owner_id uuid NOT NULL REFERENCES accounts(id),
      thread_id uuid NOT NULL REFERENCES chat_threads(id),
      revision integer NOT NULL DEFAULT 1,
      state text NOT NULL DEFAULT 'active' CHECK(state IN ('active','paused','deleted')),
      spec jsonb NOT NULL, next_due timestamptz,
      created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
      UNIQUE(id,owner_id)
    );
    CREATE INDEX schedules_due ON user_schedules(next_due) WHERE state='active';
    CREATE TABLE schedule_revisions (
      schedule_id uuid NOT NULL REFERENCES user_schedules(id), revision integer NOT NULL,
      spec jsonb NOT NULL, input_snapshot jsonb NOT NULL,
      created_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY(schedule_id,revision)
    );
    CREATE TABLE schedule_proposals (
      id uuid PRIMARY KEY, owner_id uuid NOT NULL REFERENCES accounts(id),
      thread_id uuid NOT NULL REFERENCES chat_threads(id),
      source_run_id uuid REFERENCES chat_runs(id),
      request_key uuid NOT NULL, fingerprint text NOT NULL,
      operation text NOT NULL
        CHECK(operation IN ('create','update','pause','resume','delete','run')),
      schedule_id uuid REFERENCES user_schedules(id), expected_revision integer,
      payload jsonb NOT NULL, preview jsonb NOT NULL,
      status text NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','applied','rejected')),
      created_at timestamptz NOT NULL DEFAULT now(), expires_at timestamptz NOT NULL,
      UNIQUE(owner_id,request_key)
    );
    CREATE TABLE schedule_occurrences (
      id uuid PRIMARY KEY, schedule_id uuid NOT NULL REFERENCES user_schedules(id),
      revision integer NOT NULL, intended_at timestamptz NOT NULL,
      trigger text NOT NULL CHECK(trigger IN ('scheduled','manual')),
      status text NOT NULL
        CHECK(status IN ('pending','queued','skipped','blocked_budget','failed')),
      reason text, task_id uuid UNIQUE REFERENCES background_tasks(id),
      created_at timestamptz NOT NULL DEFAULT now(),
      UNIQUE(schedule_id,revision,intended_at,trigger),
      FOREIGN KEY(schedule_id,revision) REFERENCES schedule_revisions(schedule_id,revision)
    );
    CREATE INDEX schedule_occurrences_history ON schedule_occurrences(schedule_id,created_at DESC);
    ALTER TABLE background_tasks ADD COLUMN schedule_occurrence_id uuid UNIQUE
      REFERENCES schedule_occurrences(id);
    """)


def downgrade() -> None:
    op.execute("ALTER TABLE background_tasks DROP COLUMN schedule_occurrence_id")
    for table in (
        "schedule_occurrences",
        "schedule_proposals",
        "schedule_revisions",
        "user_schedules",
    ):
        op.drop_table(table)
