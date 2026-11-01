-- Phase 3c: AnythingLLM tenant-scoped workspaces
--
-- 1. Migrate existing per-user workspace slugs from user_preferences.anythingllmWorkspace
--    to document_workspaces (one row per user).
-- 2. Remove the shared anythingllmWorkspace column from user_preferences.
-- 3. Rebuild document_workspaces with a per-user UNIQUE constraint (one workspace per user),
--    a foreign key to users, and without the unused displayName column.
--
-- The migration is idempotent: re-running on a clean DB (no existing rows) is safe.

-- Step 1: Copy per-user slugs from user_preferences → document_workspaces before schema change.
--   Only inserts when a slug exists and no row already exists for that user.
INSERT INTO "document_workspaces" ("id", "userId", "workspaceSlug", "createdAt")
SELECT gen_random_uuid()::text, up."userId", up."anythingllmWorkspace", NOW()
FROM   "user_preferences" up
WHERE  up."anythingllmWorkspace" IS NOT NULL
  AND  up."anythingllmWorkspace" <> ''
  AND  NOT EXISTS (
         SELECT 1 FROM "document_workspaces" dw WHERE dw."userId" = up."userId"
       )
ON CONFLICT DO NOTHING;

-- Step 2: Remove the column from user_preferences.
ALTER TABLE "user_preferences" DROP COLUMN IF EXISTS "anythingllmWorkspace";

-- Step 3: Rebuild document_workspaces.
--   3a. Remove any duplicate rows per userId — keep only the one created earliest.
DELETE FROM "document_workspaces" dw
WHERE dw."id" NOT IN (
  SELECT DISTINCT ON ("userId") "id"
  FROM   "document_workspaces"
  ORDER  BY "userId", "createdAt" ASC
);

--   3b. Drop the old composite unique index.
DROP INDEX IF EXISTS "document_workspaces_userId_workspaceSlug_key";

--   3c. Drop the old general userId index (will be replaced by unique constraint below).
DROP INDEX IF EXISTS "document_workspaces_userId_idx";

--   3d. Drop the unused displayName column.
ALTER TABLE "document_workspaces" DROP COLUMN IF EXISTS "displayName";

--   3e. Add the new per-user unique constraint.
ALTER TABLE "document_workspaces" ADD CONSTRAINT "document_workspaces_userId_key" UNIQUE ("userId");

--   3f. Add the foreign key to users (cascade delete).
ALTER TABLE "document_workspaces"
  ADD CONSTRAINT "document_workspaces_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
