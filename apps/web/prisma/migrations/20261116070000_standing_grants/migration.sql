CREATE TABLE "standing_grants" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "capability" TEXT,
    "team" TEXT,
    "paramsHash" TEXT,
    "content" JSONB,
    "dailyCap" INTEGER NOT NULL DEFAULT 0,
    "usedDay" TEXT NOT NULL DEFAULT '',
    "usedToday" INTEGER NOT NULL DEFAULT 0,
    "startsAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "revokedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "standing_grants_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "standing_grants_userId_kind_revokedAt_expiresAt_idx" ON "standing_grants"("userId", "kind", "revokedAt", "expiresAt");
ALTER TABLE "standing_grants" ADD CONSTRAINT "standing_grants_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
