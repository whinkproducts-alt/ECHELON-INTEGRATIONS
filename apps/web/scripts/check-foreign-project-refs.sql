-- READ-ONLY. Finds rows whose project_id points at a project owned by a different user.
-- Each query returns offending rows (ids only). A clean database returns zero rows / zero counts.
-- Run: docker exec -i whink-postgres sh -c 'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -X' < scripts/check-foreign-project-refs.sql

-- Summary counts
SELECT 'conversations' AS table_name, count(*) AS foreign_refs
  FROM conversations c JOIN projects p ON p.id = c."projectId" WHERE p."ownerId" <> c."userId"
UNION ALL
SELECT 'memory_episodes', count(*)
  FROM memory_episodes m JOIN projects p ON p.id = m."projectId" WHERE p."ownerId" <> m."userId"
UNION ALL
SELECT 'memory_semantic', count(*)
  FROM memory_semantic m JOIN projects p ON p.id = m."projectId" WHERE p."ownerId" <> m."userId"
UNION ALL
SELECT 'hypotheses', count(*)
  FROM hypotheses h JOIN projects p ON p.id = h."projectId" WHERE p."ownerId" <> h."userId"
UNION ALL
-- entity_edges has no userId column; ownership is taken from the source node.
SELECT 'entity_edges', count(*)
  FROM entity_edges e
  JOIN entity_nodes n ON n.id = e."fromId"
  JOIN projects p ON p.id = e."projectId"
 WHERE p."ownerId" <> n."userId";

-- Offending ids (empty when clean)
SELECT 'conversations' AS table_name, c.id, c."userId" AS row_user, p."ownerId" AS project_owner
  FROM conversations c JOIN projects p ON p.id = c."projectId" WHERE p."ownerId" <> c."userId";
SELECT 'memory_episodes' AS table_name, m.id, m."userId" AS row_user, p."ownerId" AS project_owner
  FROM memory_episodes m JOIN projects p ON p.id = m."projectId" WHERE p."ownerId" <> m."userId";
SELECT 'memory_semantic' AS table_name, m.id, m."userId" AS row_user, p."ownerId" AS project_owner
  FROM memory_semantic m JOIN projects p ON p.id = m."projectId" WHERE p."ownerId" <> m."userId";
SELECT 'hypotheses' AS table_name, h.id, h."userId" AS row_user, p."ownerId" AS project_owner
  FROM hypotheses h JOIN projects p ON p.id = h."projectId" WHERE p."ownerId" <> h."userId";
SELECT 'entity_edges' AS table_name, e.id, n."userId" AS row_user, p."ownerId" AS project_owner
  FROM entity_edges e
  JOIN entity_nodes n ON n.id = e."fromId"
  JOIN projects p ON p.id = e."projectId"
 WHERE p."ownerId" <> n."userId";
