"""Personal goals, reviewed changes and revision-bound evidence/work."""

from alembic import op

revision = "0009_personal_goals"
down_revision = "0008_personal_memory"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("""
    CREATE TABLE user_goals (
      id uuid PRIMARY KEY, owner_id uuid NOT NULL REFERENCES accounts(id),
      thread_id uuid NOT NULL REFERENCES chat_threads(id),
      revision integer NOT NULL DEFAULT 1, plan_revision integer NOT NULL DEFAULT 1,
      state text NOT NULL DEFAULT 'active'
        CHECK(state IN ('active','paused','completed','archived')),
      spec jsonb NOT NULL,
      created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
      UNIQUE(id,owner_id)
    );
    CREATE INDEX goals_owner ON user_goals(owner_id,updated_at DESC);
    CREATE TABLE goal_revisions (
      goal_id uuid NOT NULL REFERENCES user_goals(id), revision integer NOT NULL,
      plan_revision integer NOT NULL, state text NOT NULL, spec jsonb NOT NULL,
      operation text NOT NULL, created_at timestamptz NOT NULL DEFAULT now(),
      PRIMARY KEY(goal_id,revision)
    );
    CREATE TABLE goal_proposals (
      id uuid PRIMARY KEY, owner_id uuid NOT NULL REFERENCES accounts(id),
      thread_id uuid NOT NULL REFERENCES chat_threads(id),
      source_run_id uuid REFERENCES chat_runs(id),
      request_key uuid NOT NULL, fingerprint text NOT NULL, operation text NOT NULL,
      goal_id uuid REFERENCES user_goals(id), expected_revision integer,
      payload jsonb NOT NULL, preview jsonb NOT NULL,
      status text NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','applied','rejected')),
      created_at timestamptz NOT NULL DEFAULT now(), expires_at timestamptz NOT NULL,
      UNIQUE(owner_id,request_key)
    );
    CREATE TABLE goal_evidence (
      id uuid PRIMARY KEY, goal_id uuid NOT NULL REFERENCES user_goals(id),
      plan_revision integer NOT NULL, criterion integer NOT NULL CHECK(criterion>=0),
      state text NOT NULL CHECK(state IN ('unmet','in_progress','met')),
      note text NOT NULL, source jsonb NOT NULL,
      proposal_id uuid NOT NULL UNIQUE REFERENCES goal_proposals(id),
      created_at timestamptz NOT NULL DEFAULT now(),
      FOREIGN KEY(goal_id,plan_revision) REFERENCES goal_revisions(goal_id,revision)
    );
    CREATE INDEX goal_evidence_current
      ON goal_evidence(goal_id,plan_revision,criterion,created_at DESC);
    ALTER TABLE background_tasks ADD COLUMN goal_id uuid REFERENCES user_goals(id);
    ALTER TABLE background_tasks ADD COLUMN goal_revision integer;
    ALTER TABLE background_tasks ADD CONSTRAINT task_goal_revision
      FOREIGN KEY(goal_id,goal_revision) REFERENCES goal_revisions(goal_id,revision);
    ALTER TABLE background_tasks ADD CONSTRAINT task_goal_pair
      CHECK((goal_id IS NULL)=(goal_revision IS NULL));
    CREATE INDEX tasks_goal ON background_tasks(goal_id);
    """)


def downgrade() -> None:
    op.execute("ALTER TABLE background_tasks DROP COLUMN goal_revision, DROP COLUMN goal_id")
    for table in ("goal_evidence", "goal_proposals", "goal_revisions", "user_goals"):
        op.drop_table(table)
