"""Clean development baseline: auth, chat, approvals, storage and chat ledger."""

import sqlalchemy as sa
from alembic import op

revision = "0001_v1_baseline"
down_revision = None
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("CREATE EXTENSION IF NOT EXISTS vector")
    op.create_table(
        "accounts",
        sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column("clerk_user_id", sa.String(255), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.UniqueConstraint("clerk_user_id"),
    )
    op.create_index("ix_accounts_clerk_user_id", "accounts", ["clerk_user_id"], unique=True)
    op.create_table(
        "diagnostic_runs",
        sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column("owner_id", sa.Uuid(), sa.ForeignKey("accounts.id"), nullable=False),
        sa.Column("request_key", sa.Uuid(), nullable=False),
        sa.Column("job_id", sa.BigInteger()),
        sa.Column("status", sa.String(32), nullable=False),
        sa.Column("delay_seconds", sa.Integer(), nullable=False),
        sa.Column("artifact_id", sa.Uuid()),
        sa.Column("error", sa.String(1000)),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.UniqueConstraint("owner_id", "request_key"),
    )
    op.create_index("ix_diagnostic_runs_owner_id", "diagnostic_runs", ["owner_id"])
    op.create_table(
        "stored_objects",
        sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column("owner_id", sa.Uuid(), sa.ForeignKey("accounts.id"), nullable=False),
        sa.Column("object_key", sa.String(1024), nullable=False, unique=True),
        sa.Column("filename", sa.String(255), nullable=False),
        sa.Column("content_type", sa.String(255), nullable=False),
        sa.Column("size", sa.BigInteger(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
    )
    op.create_index("ix_stored_objects_owner_id", "stored_objects", ["owner_id"])
    op.create_table(
        "runtime_schema_versions",
        sa.Column("component", sa.String(100), primary_key=True),
        sa.Column("version", sa.String(100), nullable=False),
    )

    op.execute("""
    CREATE TABLE agent_profiles (
      owner_id uuid PRIMARY KEY REFERENCES accounts(id),
      name text NOT NULL DEFAULT 'Gwen', soul text NOT NULL, revision integer NOT NULL DEFAULT 1
    );
    CREATE TABLE chat_threads (
      id uuid PRIMARY KEY, owner_id uuid NOT NULL REFERENCES accounts(id),
      kind text NOT NULL CHECK (kind IN ('main','side')),
      title text NOT NULL, seq bigint NOT NULL DEFAULT 0,
      created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
    );
    CREATE UNIQUE INDEX chat_one_main ON chat_threads(owner_id) WHERE kind='main';
    CREATE INDEX chat_owner_threads ON chat_threads(owner_id, updated_at DESC);
    CREATE TABLE chat_runs (
      id uuid PRIMARY KEY, thread_id uuid NOT NULL REFERENCES chat_threads(id),
      owner_id uuid NOT NULL REFERENCES accounts(id), request_key uuid NOT NULL,
      input text NOT NULL, status text NOT NULL DEFAULT 'queued',
      attempt integer NOT NULL DEFAULT 0, lease_token uuid, job_id bigint,
      resume jsonb, cancel_requested boolean NOT NULL DEFAULT false,
      error text, usage jsonb NOT NULL DEFAULT '{}',
      created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
      UNIQUE(owner_id, request_key)
    );
    CREATE UNIQUE INDEX chat_one_active_run ON chat_runs(thread_id)
      WHERE status IN ('queued','running','waiting_approval','cancelling');
    CREATE TABLE chat_messages (
      id uuid PRIMARY KEY, thread_id uuid NOT NULL REFERENCES chat_threads(id),
      run_id uuid REFERENCES chat_runs(id), role text NOT NULL CHECK (role IN ('user','assistant')),
      parts jsonb NOT NULL DEFAULT '[]', status text NOT NULL DEFAULT 'complete',
      position bigint NOT NULL,
      created_at timestamptz NOT NULL DEFAULT now()
    );
    CREATE UNIQUE INDEX chat_message_position ON chat_messages(thread_id, position);
    CREATE UNIQUE INDEX chat_run_role ON chat_messages(run_id, role);
    CREATE TABLE chat_events (
      thread_id uuid NOT NULL REFERENCES chat_threads(id), seq bigint NOT NULL,
      payload jsonb NOT NULL, created_at timestamptz NOT NULL DEFAULT now(),
      PRIMARY KEY(thread_id, seq)
    );
    CREATE TABLE chat_approvals (
      id uuid PRIMARY KEY, thread_id uuid NOT NULL REFERENCES chat_threads(id),
      run_id uuid NOT NULL REFERENCES chat_runs(id), interrupt_id text NOT NULL,
      action jsonb NOT NULL, revision integer NOT NULL DEFAULT 1,
      status text NOT NULL DEFAULT 'pending', decision_key uuid, comment text,
      expires_at timestamptz NOT NULL DEFAULT (now()+interval '7 days'),
      created_at timestamptz NOT NULL DEFAULT now(), decided_at timestamptz,
      UNIQUE(run_id, interrupt_id)
    );
    """)
    op.execute("""
    CREATE TABLE quota_grants (
      id uuid PRIMARY KEY, owner_id uuid NOT NULL REFERENCES accounts(id),
      request_key uuid NOT NULL, source text NOT NULL CHECK (length(source) BETWEEN 1 AND 512),
      starts_at timestamptz NOT NULL, ends_at timestamptz NOT NULL,
      created_at timestamptz NOT NULL DEFAULT now(),
      CHECK (ends_at = starts_at + interval '720 hours'), UNIQUE(owner_id, request_key)
    );
    CREATE INDEX quota_grant_period ON quota_grants(owner_id, starts_at, ends_at);
    CREATE TABLE quota_periods (
      id uuid PRIMARY KEY, owner_id uuid NOT NULL REFERENCES accounts(id),
      plan text NOT NULL CHECK (plan IN ('free','plus')),
      starts_at timestamptz NOT NULL, ends_at timestamptz NOT NULL,
      policy_version text NOT NULL, limits jsonb NOT NULL,
      grant_id uuid REFERENCES quota_grants(id),
      CHECK (ends_at >= starts_at), UNIQUE(owner_id, plan, starts_at), UNIQUE(owner_id, id)
    );
    CREATE INDEX quota_owner_period ON quota_periods(owner_id, starts_at, ends_at);
    CREATE TABLE quota_operations (
      id uuid PRIMARY KEY, owner_id uuid NOT NULL REFERENCES accounts(id),
      period_id uuid NOT NULL, meter text NOT NULL
        CHECK (meter IN ('chat')),
      resource_key text NOT NULL CHECK (length(resource_key) BETWEEN 1 AND 512),
      fingerprint text NOT NULL CHECK (length(fingerprint) = 64),
      amount integer NOT NULL CHECK (amount > 0), token uuid NOT NULL,
      state text NOT NULL CHECK (state IN ('reserved','committed','released','reversed')),
      revision integer NOT NULL DEFAULT 1 CHECK (revision > 0),
      created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
      FOREIGN KEY(owner_id, period_id) REFERENCES quota_periods(owner_id, id),
      UNIQUE(owner_id, meter, resource_key)
    );
    CREATE INDEX quota_usage ON quota_operations(period_id, meter, state);
    CREATE TABLE quota_events (
      id bigserial PRIMARY KEY, operation_id uuid NOT NULL REFERENCES quota_operations(id),
      period_id uuid NOT NULL REFERENCES quota_periods(id), revision integer NOT NULL,
      token uuid NOT NULL, amount integer NOT NULL, action text NOT NULL
        CHECK (action IN ('reserve','commit','release','reverse')),
      reason text NOT NULL CHECK (length(reason) BETWEEN 1 AND 512),
      created_at timestamptz NOT NULL DEFAULT now(), UNIQUE(operation_id, revision)
    );
    ALTER TABLE chat_runs ADD COLUMN quota_operation_id uuid REFERENCES quota_operations(id);
    ALTER TABLE chat_runs ADD COLUMN quota_token uuid;
    ALTER TABLE chat_runs ADD CONSTRAINT chat_quota_pair CHECK
      ((quota_operation_id IS NULL) = (quota_token IS NULL));
    """)


def downgrade() -> None:
    op.execute("ALTER TABLE chat_runs DROP COLUMN quota_operation_id, DROP COLUMN quota_token")
    for name in (
        "quota_events",
        "quota_operations",
        "quota_periods",
        "quota_grants",
        "chat_approvals",
        "chat_events",
        "chat_messages",
        "chat_runs",
        "chat_threads",
        "agent_profiles",
        "runtime_schema_versions",
        "stored_objects",
        "diagnostic_runs",
        "accounts",
    ):
        op.drop_table(name)
