"""Meter standalone browser work without the legacy token-work ceiling."""

from alembic import op

revision = "0021_browser_metering"
down_revision = "0020_computer_workflow"
branch_labels = None
depends_on = None


def upgrade():
    op.execute("ALTER TABLE background_tasks DROP CONSTRAINT background_tasks_check")
    op.execute("""
        ALTER TABLE background_tasks ADD CONSTRAINT background_tasks_check
        CHECK (usage_units >= 0 AND (
            (runtime_kind='browser'
             AND COALESCE(budget_policy->>'unit'='metered_browser_work',false))
            OR usage_units <= budget_cap
        ))
    """)


def downgrade():
    op.execute("ALTER TABLE background_tasks DROP CONSTRAINT background_tasks_check")
    op.execute("""
        ALTER TABLE background_tasks ADD CONSTRAINT background_tasks_check
        CHECK (usage_units >= 0 AND usage_units <= budget_cap)
    """)
