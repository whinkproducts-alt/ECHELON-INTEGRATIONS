CREATE TABLE "founder_objectives" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "detail" TEXT,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "founder_objectives_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "founder_objectives_userId_status_idx" ON "founder_objectives"("userId", "status");
ALTER TABLE "founder_objectives" ADD CONSTRAINT "founder_objectives_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
