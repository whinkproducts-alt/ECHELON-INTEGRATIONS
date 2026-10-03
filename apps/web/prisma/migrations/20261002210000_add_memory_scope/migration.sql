-- Add scope column to memory_semantic for categorising memory breadth.
ALTER TABLE memory_semantic
  ADD COLUMN IF NOT EXISTS scope TEXT DEFAULT 'general';
