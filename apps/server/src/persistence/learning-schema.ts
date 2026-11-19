export const learningSchemaVersion = 6;

export const learningSchemaSql = `
DROP INDEX primary_dm;
DROP INDEX scoped_primary_dm;
CREATE UNIQUE INDEX primary_dm
  ON entities ((body->'member_agent_ids'->>0))
  WHERE kind='thread' AND body->>'type'='dm' AND organization_id IS NULL
    AND body->>'additional_dm' IS DISTINCT FROM 'true';
CREATE UNIQUE INDEX scoped_primary_dm
  ON entities (organization_id,actor_id,(body->'member_agent_ids'->>0))
  WHERE kind='thread' AND body->>'type'='dm' AND organization_id IS NOT NULL
    AND body->>'additional_dm' IS DISTINCT FROM 'true';
CREATE INDEX learning_review_ready
  ON entities (organization_id,actor_id,seq)
  WHERE kind='run' AND body->'learning_review'->>'state' IN ('pending','running');
`;
