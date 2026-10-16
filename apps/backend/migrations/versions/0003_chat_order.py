"""Order transcript rows by durable thread position rather than equal timestamps."""

from alembic import op

revision = "0003_chat_order"
down_revision = "0002_chat"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("""
      ALTER TABLE chat_messages ADD COLUMN position bigint;
      UPDATE chat_messages m SET position=(
        SELECT min(e.seq) FROM chat_events e WHERE e.thread_id=m.thread_id
        AND e.payload->'message'->>'id'=m.id::text
      );
      ALTER TABLE chat_messages ALTER COLUMN position SET NOT NULL;
      CREATE UNIQUE INDEX chat_message_position ON chat_messages(thread_id,position);
    """)


def downgrade() -> None:
    op.execute("ALTER TABLE chat_messages DROP COLUMN position")
