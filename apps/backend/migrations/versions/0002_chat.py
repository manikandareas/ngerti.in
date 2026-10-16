"""Owned conversations, resumable public events, and durable human decisions."""

from alembic import op

revision = "0002_chat"
down_revision = "0001_foundation"
branch_labels = None
depends_on = None


def upgrade() -> None:
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
      created_at timestamptz NOT NULL DEFAULT now()
    );
    CREATE INDEX chat_message_history ON chat_messages(thread_id, created_at, id);
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
    CREATE TABLE course_requests (
      id uuid PRIMARY KEY REFERENCES chat_approvals(id),
      owner_id uuid NOT NULL REFERENCES accounts(id),
      thread_id uuid NOT NULL REFERENCES chat_threads(id), goal text NOT NULL,
      background text NOT NULL, created_at timestamptz NOT NULL DEFAULT now()
    );
    """)


def downgrade() -> None:
    for name in (
        "course_requests",
        "chat_approvals",
        "chat_events",
        "chat_messages",
        "chat_runs",
        "chat_threads",
        "agent_profiles",
    ):
        op.execute(f"DROP TABLE {name}")
