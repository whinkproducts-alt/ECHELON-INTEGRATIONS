-- Add bitemporal columns to memory_semantic for validity tracking.
ALTER TABLE memory_semantic
  ADD COLUMN IF NOT EXISTS "validFrom" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  ADD COLUMN IF NOT EXISTS "supersededAt" TIMESTAMP(3);
