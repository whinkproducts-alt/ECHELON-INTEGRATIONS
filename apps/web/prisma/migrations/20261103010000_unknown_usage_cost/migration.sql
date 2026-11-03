BEGIN;
ALTER TABLE "usage_events" ALTER COLUMN "costMicros" DROP DEFAULT, ALTER COLUMN "costMicros" DROP NOT NULL;
-- Historical zero combined unknown and zero-priced calls; these cannot be distinguished.
UPDATE "usage_events" SET "costMicros" = NULL WHERE "costMicros" = 0;
COMMIT;
