"""Immutable product files, bounded extraction and durable result publication."""

from alembic import op

revision = "0003_product_files"
down_revision = "0002_background_tasks"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("""
    CREATE TABLE product_files (
      id uuid PRIMARY KEY, owner_id uuid NOT NULL REFERENCES accounts(id),
      current_revision integer NOT NULL DEFAULT 1,
      created_at timestamptz NOT NULL DEFAULT now(), deleted_at timestamptz,
      UNIQUE(id,owner_id)
    );
    CREATE INDEX product_files_owner ON product_files(owner_id,created_at DESC);
    CREATE TABLE file_revisions (
      id uuid PRIMARY KEY, file_id uuid NOT NULL, owner_id uuid NOT NULL,
      revision integer NOT NULL CHECK (revision > 0),
      request_key uuid NOT NULL, fingerprint text NOT NULL,
      filename text NOT NULL, content_type text NOT NULL,
      size bigint NOT NULL CHECK (size > 0), sha256 text NOT NULL,
      object_key text NOT NULL UNIQUE, page_count integer NOT NULL CHECK (page_count > 0),
      source text NOT NULL CHECK (source IN ('upload','result')),
      status text NOT NULL CHECK (status IN ('uploading','ready','failed','deleted')),
      created_at timestamptz NOT NULL DEFAULT now(), purged_at timestamptz,
      FOREIGN KEY(file_id,owner_id) REFERENCES product_files(id,owner_id),
      UNIQUE(file_id,revision), UNIQUE(owner_id,request_key), UNIQUE(id,owner_id)
    );
    CREATE TABLE file_extractions (
      id uuid PRIMARY KEY, revision_id uuid NOT NULL, owner_id uuid NOT NULL,
      config_hash text NOT NULL, policy jsonb NOT NULL,
      status text NOT NULL DEFAULT 'queued'
        CHECK (status IN ('queued','running','ready','failed','unknown')),
      lease_token uuid, job_id bigint, provider_request_id text, retry_key uuid,
      budget_day date NOT NULL DEFAULT (now() AT TIME ZONE 'UTC')::date,
      reserved_pages integer NOT NULL DEFAULT 0 CHECK (reserved_pages >= 0),
      charged_pages integer NOT NULL DEFAULT 0 CHECK (charged_pages >= 0),
      usage jsonb NOT NULL DEFAULT '{}', object_key text, error text,
      created_at timestamptz NOT NULL DEFAULT now(), started_at timestamptz,
      finished_at timestamptz, purged_at timestamptz,
      FOREIGN KEY(revision_id,owner_id) REFERENCES file_revisions(id,owner_id),
      UNIQUE(revision_id,config_hash), UNIQUE(owner_id,retry_key)
    );
    CREATE INDEX file_extractions_budget ON file_extractions(budget_day,owner_id);
    CREATE TABLE task_file_inputs (
      task_id uuid NOT NULL REFERENCES background_tasks(id), position integer NOT NULL,
      owner_id uuid NOT NULL, revision_id uuid NOT NULL, extraction_id uuid,
      selection jsonb NOT NULL DEFAULT '{}',
      FOREIGN KEY(revision_id,owner_id) REFERENCES file_revisions(id,owner_id),
      FOREIGN KEY(extraction_id) REFERENCES file_extractions(id),
      PRIMARY KEY(task_id,position), UNIQUE(task_id,revision_id)
    );
    CREATE TABLE product_results (
      id uuid PRIMARY KEY, owner_id uuid NOT NULL REFERENCES accounts(id),
      thread_id uuid NOT NULL REFERENCES chat_threads(id),
      active_task_id uuid REFERENCES background_tasks(id),
      status text NOT NULL DEFAULT 'constructing'
        CHECK (status IN ('constructing','ready','updating','failed','interrupted')),
      current_revision integer, next_revision integer NOT NULL DEFAULT 1,
      created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
      deleted_at timestamptz, UNIQUE(id,owner_id)
    );
    CREATE TABLE result_revisions (
      id uuid PRIMARY KEY, result_id uuid NOT NULL REFERENCES product_results(id),
      revision integer NOT NULL, task_id uuid NOT NULL REFERENCES background_tasks(id),
      task_revision integer NOT NULL, draft_hash text NOT NULL,
      status text NOT NULL DEFAULT 'constructing'
        CHECK (status IN ('constructing','ready','failed','interrupted')),
      manifest jsonb NOT NULL, created_at timestamptz NOT NULL DEFAULT now(),
      ready_at timestamptz, UNIQUE(result_id,revision), UNIQUE(task_id,task_revision)
    );
    ALTER TABLE background_tasks ADD COLUMN output_spec jsonb NOT NULL DEFAULT '[]';
    ALTER TABLE background_tasks ADD COLUMN result_id uuid REFERENCES product_results(id);
    ALTER TABLE task_actions DROP CONSTRAINT task_actions_kind_check;
    ALTER TABLE task_actions ADD CONSTRAINT task_actions_kind_check
      CHECK (kind IN ('finalize_text','finalize_result'));
    """)


def downgrade() -> None:
    op.execute("""
    ALTER TABLE task_actions DROP CONSTRAINT task_actions_kind_check;
    ALTER TABLE task_actions ADD CONSTRAINT task_actions_kind_check CHECK (kind='finalize_text');
    ALTER TABLE background_tasks DROP COLUMN result_id;
    ALTER TABLE background_tasks DROP COLUMN output_spec;
    """)
    for table in (
        "result_revisions",
        "product_results",
        "task_file_inputs",
        "file_extractions",
        "file_revisions",
        "product_files",
    ):
        op.drop_table(table)
