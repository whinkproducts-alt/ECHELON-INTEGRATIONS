-- BYOK keys table and preferred model column were added to the schema without a migration.
-- Some local databases have them hand-created with snake_case columns. This migration
-- converges both cases to the Prisma schema without losing data.

-- user_preferences.preferredModel
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'user_preferences' AND column_name = 'preferred_model') THEN
    ALTER TABLE "user_preferences" RENAME COLUMN "preferred_model" TO "preferredModel";
  ELSIF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'user_preferences' AND column_name = 'preferredModel') THEN
    ALTER TABLE "user_preferences" ADD COLUMN "preferredModel" TEXT;
  END IF;
END $$;

-- user_api_keys
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'user_api_keys' AND column_name = 'user_id') THEN
    ALTER TABLE "user_api_keys" DROP CONSTRAINT IF EXISTS "user_api_keys_user_id_fkey";
    ALTER TABLE "user_api_keys" DROP CONSTRAINT IF EXISTS "user_api_keys_user_id_provider_key";
    DROP INDEX IF EXISTS "user_api_keys_user_id_provider_key";
    DROP INDEX IF EXISTS "user_api_keys_user_id_idx";
    ALTER TABLE "user_api_keys" RENAME COLUMN "user_id" TO "userId";
    ALTER TABLE "user_api_keys" RENAME COLUMN "encrypted_key" TO "encryptedKey";
    ALTER TABLE "user_api_keys" RENAME COLUMN "key_hint" TO "keyHint";
    ALTER TABLE "user_api_keys" RENAME COLUMN "created_at" TO "createdAt";
    ALTER TABLE "user_api_keys" RENAME COLUMN "updated_at" TO "updatedAt";
    ALTER TABLE "user_api_keys" ALTER COLUMN "id" DROP DEFAULT;
    ALTER TABLE "user_api_keys" ALTER COLUMN "userId" SET NOT NULL;
    ALTER TABLE "user_api_keys" ALTER COLUMN "provider" SET NOT NULL;
    ALTER TABLE "user_api_keys" ALTER COLUMN "encryptedKey" SET NOT NULL;
    ALTER TABLE "user_api_keys" ALTER COLUMN "keyHint" SET NOT NULL;
    ALTER TABLE "user_api_keys" ALTER COLUMN "createdAt" TYPE TIMESTAMP(3) USING "createdAt" AT TIME ZONE 'UTC';
    ALTER TABLE "user_api_keys" ALTER COLUMN "createdAt" SET DEFAULT CURRENT_TIMESTAMP;
    ALTER TABLE "user_api_keys" ALTER COLUMN "createdAt" SET NOT NULL;
    ALTER TABLE "user_api_keys" ALTER COLUMN "updatedAt" TYPE TIMESTAMP(3) USING "updatedAt" AT TIME ZONE 'UTC';
    ALTER TABLE "user_api_keys" ALTER COLUMN "updatedAt" DROP DEFAULT;
    ALTER TABLE "user_api_keys" ALTER COLUMN "updatedAt" SET NOT NULL;
  ELSIF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'user_api_keys') THEN
    CREATE TABLE "user_api_keys" (
      "id" TEXT NOT NULL,
      "userId" TEXT NOT NULL,
      "provider" TEXT NOT NULL,
      "encryptedKey" TEXT NOT NULL,
      "keyHint" TEXT NOT NULL,
      "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" TIMESTAMP(3) NOT NULL,
      CONSTRAINT "user_api_keys_pkey" PRIMARY KEY ("id")
    );
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS "user_api_keys_userId_idx" ON "user_api_keys"("userId");
CREATE UNIQUE INDEX IF NOT EXISTS "user_api_keys_userId_provider_key" ON "user_api_keys"("userId", "provider");
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'user_api_keys_userId_fkey') THEN
    ALTER TABLE "user_api_keys" ADD CONSTRAINT "user_api_keys_userId_fkey"
      FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;
