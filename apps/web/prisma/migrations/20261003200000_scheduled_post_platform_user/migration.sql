-- Scheduled posts remember which platform account they were approved for.
ALTER TABLE "scheduled_posts" ADD COLUMN IF NOT EXISTS "platformUserId" TEXT;
