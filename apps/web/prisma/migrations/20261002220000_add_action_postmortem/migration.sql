-- Add outcome and postmortem columns to the action ledger.
ALTER TABLE actions
  ADD COLUMN IF NOT EXISTS outcome TEXT,
  ADD COLUMN IF NOT EXISTS postmortem TEXT;
