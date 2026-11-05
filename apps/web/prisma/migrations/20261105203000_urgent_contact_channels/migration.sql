-- Urgent contact channels chosen at signup (call | sms | whatsapp).
-- The encrypted number itself already exists from 20261105180000_c05_scope_and_raw_sql_restore.
ALTER TABLE "user_profiles"
  ADD COLUMN IF NOT EXISTS "urgentChannels" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
