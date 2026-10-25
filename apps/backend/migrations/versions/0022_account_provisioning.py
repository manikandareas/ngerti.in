"""Durable account provisioning intent, independent of agent execution."""

from alembic import op

revision = "0022_account_provisioning"
down_revision = "0021_browser_metering"
branch_labels = None
depends_on = None


def upgrade():
    op.execute("""
        CREATE TABLE account_provisioning (
            owner_id uuid PRIMARY KEY REFERENCES accounts(id),
            status text NOT NULL DEFAULT 'pending'
                CHECK(status IN ('pending','provisioning','ready',
                                 'retryable_failure','operator_required')),
            generation bigint NOT NULL DEFAULT 0,
            lease_until timestamptz,
            next_attempt_at timestamptz NOT NULL DEFAULT now(),
            attempts integer NOT NULL DEFAULT 0,
            error_code text,
            result jsonb,
            updated_at timestamptz NOT NULL DEFAULT now()
        );
        CREATE INDEX account_provisioning_due ON account_provisioning(next_attempt_at)
            WHERE status != 'operator_required';
        CREATE TABLE account_registration_receipts (
            delivery_id text PRIMARY KEY,
            payload_digest text NOT NULL,
            owner_id uuid NOT NULL REFERENCES accounts(id),
            created_at timestamptz NOT NULL DEFAULT now()
        );
    """)


def downgrade():
    raise RuntimeError(
        "Preserve provisioning receipts; restore an isolated verified backup instead"
    )
