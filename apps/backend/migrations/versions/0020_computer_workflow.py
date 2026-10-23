"""Durable browser evidence, candidate verification, and dispatch metadata."""

from alembic import op

revision = "0020_computer_workflow"
down_revision = "0019_browser_continuation"
branch_labels = None
depends_on = None


def upgrade():
    op.execute(
        "ALTER TABLE computer_outputs DROP CONSTRAINT computer_outputs_session_id_filename_key"
    )
    op.execute("ALTER TABLE computer_outputs ADD UNIQUE(session_id,filename,sha256)")
    op.execute("ALTER TABLE browser_workspaces ADD COLUMN capability jsonb NOT NULL DEFAULT '{}'")
    op.execute("ALTER TABLE computer_steps ADD COLUMN decision jsonb NOT NULL DEFAULT '{}'")
    op.execute("ALTER TABLE computer_steps ADD COLUMN outcome jsonb NOT NULL DEFAULT '{}'")
    op.execute("ALTER TABLE task_cost_events ADD COLUMN role text NOT NULL DEFAULT 'task'")
    op.execute("""
        CREATE TABLE computer_evidence (
            id uuid PRIMARY KEY, owner_id uuid NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
            task_id uuid NOT NULL REFERENCES background_tasks(id) ON DELETE CASCADE,
            revision integer NOT NULL, url text NOT NULL, title text NOT NULL,
            excerpt text NOT NULL, content_hash text NOT NULL, metadata jsonb NOT NULL DEFAULT '{}',
            created_at timestamptz NOT NULL DEFAULT now(),
            UNIQUE(task_id, revision, url, content_hash)
        );
        CREATE INDEX computer_evidence_task ON computer_evidence(task_id, revision);
        CREATE TABLE computer_candidates (
            id uuid PRIMARY KEY, owner_id uuid NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
            task_id uuid NOT NULL REFERENCES background_tasks(id) ON DELETE CASCADE,
            revision integer NOT NULL, content_hash text NOT NULL, manifest jsonb NOT NULL,
            evidence_ids jsonb NOT NULL DEFAULT '[]', verdict jsonb NOT NULL DEFAULT '{}',
            state text NOT NULL DEFAULT 'unverified'
                CHECK (state IN ('unverified','passed','failed','inconclusive','partial')),
            created_at timestamptz NOT NULL DEFAULT now(),
            UNIQUE(task_id, revision, content_hash)
        );
    """)


def downgrade():
    raise RuntimeError(
        "Computer evidence migration is forward-only: collapsing candidate revisions "
        "would lose evidence. Disable v2 admission without downgrading the schema."
    )
