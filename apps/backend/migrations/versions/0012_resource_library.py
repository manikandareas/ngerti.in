"""Searchable file text and durable per-thread resource selection."""

from alembic import op

revision = "0012_resource_library"
down_revision = "0011_proactive_delivery"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("""
    ALTER TABLE file_revisions ADD COLUMN search_text text NOT NULL DEFAULT '';
    CREATE INDEX file_search_text ON file_revisions USING gin(to_tsvector('simple', search_text));
    CREATE TABLE thread_resource_selections (
      thread_id uuid PRIMARY KEY REFERENCES chat_threads(id),
      owner_id uuid NOT NULL REFERENCES accounts(id), ref jsonb NOT NULL,
      updated_at timestamptz NOT NULL DEFAULT now()
    );
    ALTER TABLE chat_runs ADD COLUMN resource_context jsonb;
    ALTER TABLE chat_runs ADD COLUMN resource_refs jsonb NOT NULL DEFAULT '[]';
    """)


def downgrade() -> None:
    op.execute("ALTER TABLE chat_runs DROP COLUMN resource_context, DROP COLUMN resource_refs")
    op.execute("DROP TABLE thread_resource_selections")
    op.execute("ALTER TABLE file_revisions DROP COLUMN search_text")
