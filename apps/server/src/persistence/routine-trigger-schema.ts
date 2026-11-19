export const routineTriggerSchemaVersion = 8;

export const routineTriggerSchemaSql = `
DROP INDEX routine_occurrence;
CREATE UNIQUE INDEX routine_occurrence ON entities
  ((body->>'routine_id'), (body->>'routine_generation'), (body->>'scheduled_for'),
   (COALESCE(body->>'trigger', 'schedule')))
  WHERE kind='occurrence';
`;
