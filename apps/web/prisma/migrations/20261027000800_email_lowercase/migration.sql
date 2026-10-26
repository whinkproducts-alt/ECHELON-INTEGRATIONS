-- Normalise emails to lower(trim()). Only rows whose normalised form is unique are updated,
-- so a case-variant duplicate pair is left untouched for a human to merge.
UPDATE "users" u
SET "email" = lower(trim(u."email"))
WHERE u."email" <> lower(trim(u."email"))
  AND (SELECT count(*) FROM "users" x WHERE lower(trim(x."email")) = lower(trim(u."email"))) = 1;

-- Case-insensitive uniqueness. Created only when no duplicates remain, so the migration cannot fail on old data.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM "users" GROUP BY lower("email") HAVING count(*) > 1) THEN
    CREATE UNIQUE INDEX IF NOT EXISTS "users_email_lower_key" ON "users" (lower("email"));
  END IF;
END $$;
