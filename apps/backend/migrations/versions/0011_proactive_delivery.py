"""Product preferences and atomic proactive chat delivery, without resetting data."""

from alembic import op

revision = "0011_proactive_delivery"
down_revision = "0010_proactive_candidates"
branch_labels = None
depends_on = None


def upgrade():
    op.execute("""
    CREATE TABLE proactive_preferences (
      owner_id uuid PRIMARY KEY REFERENCES accounts(id),
      revision integer NOT NULL DEFAULT 1,
      intensity text NOT NULL DEFAULT 'normal'
        CHECK(intensity IN ('off','quiet','normal','active')),
      timezone text NOT NULL DEFAULT 'UTC',
      quiet_enabled boolean NOT NULL DEFAULT true,
      quiet_start integer NOT NULL DEFAULT 1320 CHECK(quiet_start BETWEEN 0 AND 1439),
      quiet_end integer NOT NULL DEFAULT 480 CHECK(quiet_end BETWEEN 0 AND 1439),
      snoozed_until timestamptz, onboarded_at timestamptz,
      updated_at timestamptz NOT NULL DEFAULT now()
    );
    -- Preview accounts are not delivery consent, including previously enabled previews.
    INSERT INTO proactive_preferences(owner_id,intensity)
      SELECT owner_id,CASE WHEN enabled THEN 'normal' ELSE 'off' END FROM proactive_accounts;
    CREATE TABLE proactive_scope_controls (
      owner_id uuid NOT NULL REFERENCES accounts(id),
      scope text NOT NULL CHECK(scope IN ('thread','goal')), scope_id uuid NOT NULL,
      revision integer NOT NULL DEFAULT 1,
      intensity text CHECK(intensity IN ('off','quiet','normal','active')),
      snoozed_until timestamptz, updated_at timestamptz NOT NULL DEFAULT now(),
      PRIMARY KEY(owner_id,scope,scope_id)
    );
    CREATE TABLE proactive_preference_commands (
      owner_id uuid NOT NULL REFERENCES accounts(id), request_key uuid NOT NULL,
      fingerprint text NOT NULL, response jsonb NOT NULL,
      source_run_id uuid REFERENCES chat_runs(id), created_at timestamptz NOT NULL DEFAULT now(),
      PRIMARY KEY(owner_id,request_key)
    );
    ALTER TABLE proactive_candidates DROP CONSTRAINT proactive_candidates_state_check;
    ALTER TABLE proactive_candidates ADD CONSTRAINT proactive_candidates_state_check
      CHECK(state IN ('eligible','delivered','discarded','expired'));
    ALTER TABLE proactive_candidates ADD COLUMN delivery_due_at timestamptz NOT NULL DEFAULT now();
    ALTER TABLE proactive_evaluations ADD COLUMN signal_version bigint NOT NULL DEFAULT 0;
    CREATE TABLE proactive_deliveries (
      candidate_id uuid PRIMARY KEY REFERENCES proactive_candidates(id),
      owner_id uuid NOT NULL REFERENCES accounts(id),
      message_id uuid NOT NULL UNIQUE REFERENCES chat_messages(id),
      thread_id uuid NOT NULL REFERENCES chat_threads(id), dedup_key text NOT NULL,
      preference_revision integer NOT NULL, created_at timestamptz NOT NULL DEFAULT now()
    );
    CREATE INDEX proactive_delivery_cap ON proactive_deliveries(owner_id,created_at DESC);
    CREATE INDEX proactive_delivery_dedup
      ON proactive_deliveries(owner_id,dedup_key,created_at DESC);
    ALTER TABLE chat_threads ADD COLUMN proactive_read_position bigint NOT NULL DEFAULT 0;
    """)


def downgrade():
    op.execute("ALTER TABLE chat_threads DROP COLUMN proactive_read_position")
    op.drop_table("proactive_deliveries")
    op.execute("ALTER TABLE proactive_evaluations DROP COLUMN signal_version")
    op.execute("UPDATE proactive_candidates SET state='discarded' WHERE state='delivered'")
    op.execute("ALTER TABLE proactive_candidates DROP COLUMN delivery_due_at")
    op.execute("ALTER TABLE proactive_candidates DROP CONSTRAINT proactive_candidates_state_check")
    op.execute(
        "ALTER TABLE proactive_candidates ADD CONSTRAINT proactive_candidates_state_check "
        "CHECK(state IN ('eligible','discarded','expired'))"
    )
    for table in (
        "proactive_preference_commands",
        "proactive_scope_controls",
        "proactive_preferences",
    ):
        op.drop_table(table)
