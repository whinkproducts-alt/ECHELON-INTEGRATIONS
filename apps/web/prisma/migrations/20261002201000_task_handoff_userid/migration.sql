ALTER TABLE "task_handoffs" ADD COLUMN "userId" TEXT NOT NULL DEFAULT 'unknown';
CREATE INDEX "task_handoffs_userId_idx" ON "task_handoffs"("userId");
