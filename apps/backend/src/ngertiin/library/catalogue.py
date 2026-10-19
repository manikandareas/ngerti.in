"""Canonical rows keep deletions/revisions authoritative without a stale search index."""

# Owner predicates are pushed into every branch by PostgreSQL. Only public text parts,
# never reasoning/tool arguments, are searched. Forgotten source turns are excluded.
ROWS = """
SELECT t.owner_id,'thread'::text AS kind,t.id,NULL::integer AS revision,
 NULL::uuid AS revision_id,t.id AS thread_id,t.title,'ready'::text AS status,
 t.updated_at,COALESCE(m.body,'') AS body
FROM chat_threads t LEFT JOIN LATERAL (
 SELECT string_agg(matched.text,' ') AS body FROM (
 SELECT p->>'text' AS text FROM chat_messages m
 CROSS JOIN LATERAL jsonb_array_elements(m.parts) p
 LEFT JOIN chat_runs cr ON cr.id=m.run_id
 WHERE m.thread_id=t.id AND m.status='complete' AND p->>'type'='text'
 AND NOT EXISTS(SELECT 1 FROM memory_excluded_sources e WHERE e.owner_id=t.owner_id
 AND e.source_kind='message' AND e.source_id=m.id)
 AND (m.role='user' OR (cr.id IS NOT NULL AND jsonb_array_length(cr.memory_refs)=0
 AND jsonb_array_length(cr.resource_refs)=0))
 AND (%(q)s='' OR to_tsvector('simple',p->>'text') @@ plainto_tsquery('simple',%(q)s)
 OR to_tsvector('simple',regexp_replace(p->>'text','[[:punct:]]',' ','g'))
 @@ plainto_tsquery('simple',%(q)s))
 ORDER BY m.position DESC LIMIT 30
 ) matched
) m ON true
UNION ALL
SELECT owner_id,'task',id,revision,NULL::uuid,thread_id,title,status,updated_at,
 instruction || ' ' || COALESCE(result,'') FROM background_tasks
UNION ALL
SELECT f.owner_id,'file',f.id,r.revision,r.id,NULL::uuid,r.filename,r.status,
 r.created_at,r.search_text FROM product_files f JOIN LATERAL
 (SELECT * FROM file_revisions WHERE file_id=f.id AND status='ready' AND source='upload'
 ORDER BY revision DESC LIMIT 1) r ON true WHERE f.deleted_at IS NULL
UNION ALL
SELECT r.owner_id,'result',r.id,v.revision,NULL::uuid,r.thread_id,
 COALESCE(v.manifest->'files'->0->>'filename',t.title,'Hasil pekerjaan'),r.status,r.updated_at,
 concat_ws(' ',v.manifest->>'summary',f.body,t.title,t.instruction)
 FROM product_results r JOIN background_tasks t ON t.id=r.active_task_id
 LEFT JOIN result_revisions v ON v.result_id=r.id AND v.revision=r.current_revision
 LEFT JOIN LATERAL (SELECT string_agg(fr.filename || ' ' || fr.search_text,' ') AS body
 FROM jsonb_array_elements(v.manifest->'files') item JOIN file_revisions fr
 ON fr.id=(item->>'revision_id')::uuid AND fr.status='ready'
 JOIN product_files pf ON pf.id=fr.file_id AND pf.deleted_at IS NULL) f ON true
 WHERE r.deleted_at IS NULL
UNION ALL
SELECT owner_id,'goal',id,revision,NULL::uuid,thread_id,spec->>'title',state,updated_at,
 concat_ws(' ',spec->>'target',spec->'criteria',spec->>'next_action') FROM user_goals
UNION ALL
SELECT owner_id,'schedule',id,revision,NULL::uuid,thread_id,spec->>'title',state,updated_at,
 spec->>'instruction' FROM user_schedules WHERE state<>'deleted'
"""
