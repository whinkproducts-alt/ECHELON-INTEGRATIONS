-- Add generated tsvector columns for full-text search on memory tables.
-- Postgres 12+ GENERATED ALWAYS AS ... STORED is used so the column is always
-- consistent with the source text without requiring a trigger.

ALTER TABLE memory_semantic
  ADD COLUMN IF NOT EXISTS search_vec tsvector
    GENERATED ALWAYS AS (to_tsvector('english', statement)) STORED;

CREATE INDEX IF NOT EXISTS memory_semantic_search_vec_idx
  ON memory_semantic USING GIN (search_vec);

ALTER TABLE memory_episodes
  ADD COLUMN IF NOT EXISTS search_vec tsvector
    GENERATED ALWAYS AS (to_tsvector('english', summary)) STORED;

CREATE INDEX IF NOT EXISTS memory_episodes_search_vec_idx
  ON memory_episodes USING GIN (search_vec);
