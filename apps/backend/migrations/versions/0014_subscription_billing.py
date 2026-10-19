"""Provider-scoped subscriptions, durable webhook inbox and verified cycle receipts."""

from alembic import op

revision = "0014_subscription_billing"
down_revision = "0013_compute_usage"
branch_labels = None
depends_on = None


def upgrade():
    op.execute("""
    ALTER TABLE quota_grants ADD COLUMN policy_snapshot jsonb;
    CREATE TABLE billing_orders (
      id uuid PRIMARY KEY, owner_id uuid NOT NULL REFERENCES accounts(id),
      request_key uuid NOT NULL,
      provider text NOT NULL CHECK(provider IN ('duitku','lemonsqueezy')),
      mode text NOT NULL CHECK(mode IN ('test','live')), contract jsonb NOT NULL,
      status text NOT NULL DEFAULT 'creating', contact jsonb NOT NULL,
      checkout_id text, payment_url text, subscription_id text, binding_token text NOT NULL,
      paid_through timestamptz, cancel_requested boolean NOT NULL DEFAULT false,
      expires_at timestamptz NOT NULL DEFAULT now()+interval '1 hour',
      lease_token uuid, lease_until timestamptz, last_error text,
      next_check_at timestamptz NOT NULL DEFAULT now(),
      created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
      UNIQUE(owner_id,request_key), UNIQUE(provider,mode,subscription_id),
      CHECK(status IN ('creating','pending','unknown','active','past_due','cancel_pending',
        'cancelled','expired','failed','review'))
    );
    CREATE INDEX billing_due ON billing_orders(next_check_at);
    CREATE TABLE billing_events (
      id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
      provider text NOT NULL, mode text NOT NULL, fingerprint text NOT NULL,
      order_id uuid REFERENCES billing_orders(id), payload jsonb NOT NULL,
      processed_at timestamptz, attempts integer NOT NULL DEFAULT 0, last_error text,
      created_at timestamptz NOT NULL DEFAULT now(), UNIQUE(provider,mode,fingerprint)
    );
    CREATE INDEX billing_inbox ON billing_events(created_at) WHERE processed_at IS NULL;
    CREATE TABLE billing_payments (
      id uuid PRIMARY KEY, order_id uuid NOT NULL REFERENCES billing_orders(id),
      provider text NOT NULL, mode text NOT NULL, receipt_id text NOT NULL,
      cycle_start timestamptz NOT NULL, cycle_end timestamptz NOT NULL,
      amount bigint NOT NULL, tax bigint NOT NULL DEFAULT 0, currency text NOT NULL,
      grant_id uuid REFERENCES quota_grants(id), evidence jsonb NOT NULL,
      created_at timestamptz NOT NULL DEFAULT now(), UNIQUE(provider,mode,receipt_id),
      UNIQUE(order_id,cycle_start), CHECK(cycle_end>cycle_start)
    );
    CREATE TABLE billing_audit (
      id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
      order_id uuid NOT NULL REFERENCES billing_orders(id), action text NOT NULL,
      detail jsonb NOT NULL DEFAULT '{}', created_at timestamptz NOT NULL DEFAULT now()
    );
    """)


def downgrade():
    for table in ("billing_audit", "billing_payments", "billing_events", "billing_orders"):
        op.drop_table(table)
    op.execute("ALTER TABLE quota_grants DROP COLUMN policy_snapshot")
