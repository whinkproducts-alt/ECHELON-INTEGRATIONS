-- Fail loudly if two accounts differ only by email case or spacing. Counts only, never emails.
DO $$
DECLARE dup_groups integer;
BEGIN
  SELECT count(*) INTO dup_groups FROM (
    SELECT 1 FROM "users" GROUP BY lower(trim("email")) HAVING count(*) > 1
  ) d;
  IF dup_groups > 0 THEN
    RAISE EXCEPTION 'email_lowercase: % group(s) of accounts share an email that differs only by case or spacing. Merge or delete the duplicate accounts, then re-run the migration.', dup_groups;
  END IF;
END $$;

-- Safe now: every normalised email is unique.
UPDATE "users" SET "email" = lower(trim("email")) WHERE "email" <> lower(trim("email"));

-- CreateIndex
CREATE UNIQUE INDEX "users_email_lower_key" ON "users" (lower("email"));
