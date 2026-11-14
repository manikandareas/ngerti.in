-- The Better Auth Organization/Teams rows are the product Organization/Workgroup rows.
-- All product writers use the organization lock; raw provider operations are not exposed.
ALTER TABLE member ADD CONSTRAINT member_organization_user_unique UNIQUE ("organizationId", "userId");
ALTER TABLE member ADD CONSTRAINT member_role_check CHECK (role IN ('owner','admin','member'));
ALTER TABLE member ADD CONSTRAINT member_scoped_id_unique UNIQUE ("organizationId",id);
ALTER TABLE team ADD CONSTRAINT team_scoped_id_unique UNIQUE ("organizationId",id);
ALTER TABLE "teamMember" ADD CONSTRAINT team_member_unique UNIQUE ("teamId","userId");
ALTER TABLE invitation ADD CONSTRAINT invitation_scoped_id_unique UNIQUE ("organizationId",id);
ALTER TABLE invitation ADD CONSTRAINT invitation_role_check CHECK (role IN ('admin','member'));

CREATE TABLE ngertiin_organization_policy (
  organization_id uuid PRIMARY KEY REFERENCES organization(id),
  created_by_user_id uuid NOT NULL REFERENCES "user"(id),
  authorization_generation integer NOT NULL DEFAULT 1 CHECK (authorization_generation>0)
);
CREATE INDEX ngertiin_organization_creator_idx ON ngertiin_organization_policy(created_by_user_id);
CREATE TABLE ngertiin_organization_creation (
  user_id uuid PRIMARY KEY REFERENCES "user"(id),
  organization_limit integer NOT NULL CHECK (organization_limit BETWEEN 0 AND 100),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Tombstones survive removal. Rejoining cannot revive old access contexts or receipts.
CREATE TABLE ngertiin_membership_state (
  organization_id uuid NOT NULL REFERENCES organization(id),
  user_id uuid NOT NULL REFERENCES "user"(id),
  membership_id uuid NOT NULL UNIQUE,
  generation integer NOT NULL DEFAULT 1 CHECK (generation>0),
  status text NOT NULL CHECK (status IN ('active','removed')),
  private_work_suspended boolean NOT NULL DEFAULT false,
  removed_at timestamptz,
  PRIMARY KEY (organization_id,user_id)
);
CREATE TABLE ngertiin_membership_provisioning (
  id uuid PRIMARY KEY DEFAULT pg_catalog.gen_random_uuid(),
  organization_id uuid NOT NULL,
  user_id uuid NOT NULL,
  membership_generation integer NOT NULL CHECK (membership_generation>0),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','materialized','suspended')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(organization_id,user_id),
  FOREIGN KEY (organization_id,user_id) REFERENCES ngertiin_membership_state(organization_id,user_id)
);
ALTER TABLE "teamMember" ADD CONSTRAINT team_member_scoped_team FOREIGN KEY (organization_id,"teamId") REFERENCES team("organizationId",id) ON DELETE CASCADE;
ALTER TABLE "teamMember" ADD CONSTRAINT team_member_scoped_member FOREIGN KEY (organization_id,"userId") REFERENCES member("organizationId","userId") ON DELETE CASCADE;

CREATE TABLE ngertiin_invitation_state (
  invitation_id uuid PRIMARY KEY,
  organization_id uuid NOT NULL,
  inviter_membership_id uuid NOT NULL,
  inviter_generation integer NOT NULL,
  accepted_user_id uuid REFERENCES "user"(id),
  accepted_generation integer,
  delivery text NOT NULL DEFAULT 'pending' CHECK (delivery IN ('pending','sent','failed')),
  FOREIGN KEY (organization_id,invitation_id) REFERENCES invitation("organizationId",id)
);
-- Keep the invited group IDs after deletion so acceptance fails rather than broadening access.
CREATE TABLE ngertiin_invitation_workgroups (
  invitation_id uuid NOT NULL REFERENCES invitation(id),
  workgroup_id uuid NOT NULL,
  PRIMARY KEY(invitation_id,workgroup_id)
);
CREATE UNIQUE INDEX ngertiin_pending_invitation_email ON invitation("organizationId",lower(email)) WHERE status='pending';

CREATE TABLE ngertiin_audiences (
  id uuid PRIMARY KEY DEFAULT pg_catalog.gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organization(id),
  mode text NOT NULL CHECK (mode IN ('all_members','workgroups')),
  UNIQUE(organization_id,id)
);
CREATE TABLE ngertiin_audience_workgroups (
  organization_id uuid NOT NULL,
  audience_id uuid NOT NULL,
  workgroup_id uuid NOT NULL,
  PRIMARY KEY(audience_id,workgroup_id),
  FOREIGN KEY(organization_id,audience_id) REFERENCES ngertiin_audiences(organization_id,id),
  FOREIGN KEY(organization_id,workgroup_id) REFERENCES team("organizationId",id) ON DELETE CASCADE
);
CREATE TABLE ngertiin_organization_audit (
  sequence bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  organization_id uuid REFERENCES organization(id),
  actor_user_id uuid REFERENCES "user"(id),
  action text NOT NULL,
  target_id uuid,
  authorization_generation integer,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ngertiin_organization_audit_scope_idx ON ngertiin_organization_audit(organization_id,sequence);
CREATE TABLE ngertiin_organization_commands (
  user_id uuid NOT NULL REFERENCES "user"(id),
  command_id uuid NOT NULL,
  organization_id uuid NOT NULL REFERENCES organization(id),
  membership_generation integer NOT NULL,
  fingerprint text NOT NULL,
  result jsonb NOT NULL,
  PRIMARY KEY(user_id,command_id)
);
