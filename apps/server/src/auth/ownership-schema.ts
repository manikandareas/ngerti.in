/** Installation binding is separate from organization membership and legacy entity payloads. */
export const authenticationOwnershipSql = `create table ngertiin_owner_binding (
  id integer primary key check(id=1),
  legacy_owner_id uuid not null,
  user_id uuid unique references "user"(id),
  bound_at timestamptz
);

create table ngertiin_owner_bootstrap (
  id integer primary key check(id=1),
  token_hash text not null,
  email text not null,
  expires_at timestamptz not null,
  consumed_at timestamptz
);`;
