export const conversationSearchSchemaVersion = 7;
export const conversationSearchSchemaSql = `
CREATE INDEX IF NOT EXISTS conversation_message_search ON entities USING gin (
  to_tsvector('simple'::regconfig,COALESCE(body->>'text',''))
) WHERE kind='message' AND body->>'state'='complete'
  AND COALESCE(body->>'purpose','conversation')='conversation' AND body->>'author' IN ('user','agent');
`;
