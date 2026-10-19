"""Evidence-bound proactive evaluation, separate from message delivery."""

from alembic import op

revision = "0010_proactive_candidates"
down_revision = "0009_personal_goals"
branch_labels = None
depends_on = None


def upgrade():
    op.execute("""
    CREATE TABLE proactive_accounts (
      owner_id uuid PRIMARY KEY REFERENCES accounts(id),
      enabled boolean NOT NULL DEFAULT false, revision integer NOT NULL DEFAULT 1,
      signal_version bigint NOT NULL DEFAULT 0, evaluated_version bigint NOT NULL DEFAULT -1,
      due_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
    );
    CREATE TABLE proactive_evaluations (
      id uuid PRIMARY KEY, owner_id uuid NOT NULL REFERENCES accounts(id),
      input_hash text NOT NULL, pipeline_version text NOT NULL,
      status text NOT NULL DEFAULT 'queued' CHECK(status IN
        ('queued','running','selected','no_op','failed','invalidated')),
      reason text, snapshot jsonb NOT NULL, generated jsonb, judgments jsonb,
      selected_candidate_id uuid, lease_token uuid, lease_until timestamptz,
      created_at timestamptz NOT NULL DEFAULT now(), finished_at timestamptz,
      expires_at timestamptz NOT NULL DEFAULT now()+interval '24 hours',
      UNIQUE(owner_id,input_hash,pipeline_version)
    );
    CREATE INDEX proactive_evaluations_owner
      ON proactive_evaluations(owner_id,created_at DESC);
    CREATE TABLE proactive_candidates (
      id uuid PRIMARY KEY, evaluation_id uuid NOT NULL REFERENCES proactive_evaluations(id),
      owner_id uuid NOT NULL REFERENCES accounts(id),
      thread_id uuid NOT NULL REFERENCES chat_threads(id),
      state text NOT NULL CHECK(state IN ('eligible','discarded','expired')),
      payload jsonb NOT NULL, evidence_refs jsonb NOT NULL, judgment jsonb NOT NULL,
      rank_score double precision NOT NULL, dedup_key text NOT NULL,
      reason text NOT NULL, expires_at timestamptz NOT NULL,
      created_at timestamptz NOT NULL DEFAULT now()
    );
    CREATE UNIQUE INDEX proactive_one_eligible_per_evaluation
      ON proactive_candidates(evaluation_id) WHERE state='eligible';
    CREATE INDEX proactive_candidates_owner ON proactive_candidates(owner_id,created_at DESC);
    CREATE TABLE proactive_cost_events (
      id uuid PRIMARY KEY, owner_id uuid NOT NULL REFERENCES accounts(id),
      evaluation_id uuid NOT NULL REFERENCES proactive_evaluations(id),
      stage text NOT NULL CHECK(stage IN ('generate','judge')), model text NOT NULL,
      reserved_units integer NOT NULL CHECK(reserved_units>0),
      charged_units integer NOT NULL CHECK(charged_units>=0),
      state text NOT NULL CHECK(state IN ('reserved','confirmed','unknown')),
      usage jsonb NOT NULL DEFAULT '{}', created_at timestamptz NOT NULL DEFAULT now(),
      settled_at timestamptz, UNIQUE(evaluation_id,stage)
    );
    CREATE INDEX proactive_cost_daily ON proactive_cost_events(created_at,owner_id);
    """)


def downgrade():
    for table in (
        "proactive_cost_events",
        "proactive_candidates",
        "proactive_evaluations",
        "proactive_accounts",
    ):
        op.drop_table(table)
