-- founder_ideas had no migration (it existed only through db push); create it when missing, then add the lane E columns.
CREATE TABLE IF NOT EXISTS "founder_ideas" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT,
    "source" TEXT NOT NULL DEFAULT 'founder',
    "archived" BOOLEAN NOT NULL DEFAULT false,
    "privacyScope" TEXT NOT NULL DEFAULT 'private',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "founder_ideas_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "founder_ideas_userId_source_archived_idx" ON "founder_ideas"("userId", "source", "archived");
DO $$ BEGIN
  ALTER TABLE "founder_ideas" ADD CONSTRAINT "founder_ideas_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
-- initiatives likewise had no migration.
CREATE TABLE IF NOT EXISTS "initiatives" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "objective" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'queued',
    "recipient" TEXT NOT NULL,
    "progress" INTEGER NOT NULL DEFAULT 0,
    "result" JSONB,
    "sourceIdeaId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "initiatives_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "initiatives_userId_status_idx" ON "initiatives"("userId", "status");
CREATE INDEX IF NOT EXISTS "initiatives_userId_recipient_idx" ON "initiatives"("userId", "recipient");
DO $$ BEGIN
  ALTER TABLE "initiatives" ADD CONSTRAINT "initiatives_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
ALTER TABLE "founder_ideas" ADD COLUMN IF NOT EXISTS "authorKey" TEXT, ADD COLUMN IF NOT EXISTS "viableAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "contracts" ADD COLUMN     "sourcedByKey" TEXT;

-- CreateTable
CREATE TABLE "org_entities" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "tier" INTEGER NOT NULL,
    "directorate" TEXT,
    "department" TEXT,
    "managerKey" TEXT,
    "roles" TEXT[],
    "status" TEXT NOT NULL DEFAULT 'active',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "org_entities_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "org_kpis" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "entityKey" TEXT NOT NULL,
    "measureCode" TEXT NOT NULL,
    "target" DOUBLE PRECISION NOT NULL,
    "weight" DOUBLE PRECISION NOT NULL,
    "periodDays" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "org_kpis_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "org_kpi_scores" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "entityKey" TEXT NOT NULL,
    "measureCode" TEXT NOT NULL,
    "periodStart" TIMESTAMP(3) NOT NULL,
    "periodEnd" TIMESTAMP(3) NOT NULL,
    "value" DOUBLE PRECISION,
    "meetsTarget" BOOLEAN,
    "evidence" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "org_kpi_scores_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "org_policies" (
    "userId" TEXT NOT NULL,
    "promotionThreshold" DOUBLE PRECISION,
    "periodsRequired" INTEGER,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "org_policies_pkey" PRIMARY KEY ("userId")
);

-- CreateTable
CREATE TABLE "org_promotions" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "entityKey" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "toRole" TEXT NOT NULL,
    "changesAccess" BOOLEAN NOT NULL DEFAULT false,
    "contentHash" TEXT NOT NULL,
    "requiredKeys" TEXT[],
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "decidedAt" TIMESTAMP(3),

    CONSTRAINT "org_promotions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "org_promotion_approvals" (
    "id" TEXT NOT NULL,
    "promotionId" TEXT NOT NULL,
    "approverKey" TEXT NOT NULL,
    "decision" TEXT NOT NULL,
    "contentHash" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "org_promotion_approvals_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "org_reviews" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "entityKey" TEXT NOT NULL,
    "period" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "evidence" JSONB,
    "whinkView" TEXT,
    "mambaView" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "org_reviews_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "org_courses" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "mandatory" BOOLEAN NOT NULL DEFAULT false,
    "contentStatus" TEXT NOT NULL DEFAULT 'NEEDS_VICTOR',
    "body" TEXT,
    "scenarios" JSONB,
    "passMark" DOUBLE PRECISION,
    "intervalDays" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "org_courses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "org_training" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "entityKey" TEXT NOT NULL,
    "courseId" TEXT NOT NULL,
    "dueAt" TIMESTAMP(3) NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'ASSIGNED',
    "score" DOUBLE PRECISION,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "passedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "org_training_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "org_chat_messages" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "entityKey" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "org_chat_messages_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "org_entities_userId_managerKey_idx" ON "org_entities"("userId", "managerKey");

-- CreateIndex
CREATE UNIQUE INDEX "org_entities_userId_key_key" ON "org_entities"("userId", "key");

-- CreateIndex
CREATE UNIQUE INDEX "org_kpis_userId_entityKey_measureCode_key" ON "org_kpis"("userId", "entityKey", "measureCode");

-- CreateIndex
CREATE INDEX "org_kpi_scores_userId_entityKey_idx" ON "org_kpi_scores"("userId", "entityKey");

-- CreateIndex
CREATE UNIQUE INDEX "org_kpi_scores_userId_entityKey_measureCode_periodStart_key" ON "org_kpi_scores"("userId", "entityKey", "measureCode", "periodStart");

-- CreateIndex
CREATE INDEX "org_promotions_userId_status_idx" ON "org_promotions"("userId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "org_promotion_approvals_promotionId_approverKey_key" ON "org_promotion_approvals"("promotionId", "approverKey");

-- CreateIndex
CREATE UNIQUE INDEX "org_reviews_userId_entityKey_period_key" ON "org_reviews"("userId", "entityKey", "period");

-- CreateIndex
CREATE UNIQUE INDEX "org_courses_userId_code_key" ON "org_courses"("userId", "code");

-- CreateIndex
CREATE INDEX "org_training_userId_entityKey_idx" ON "org_training"("userId", "entityKey");

-- CreateIndex
CREATE INDEX "org_training_userId_courseId_idx" ON "org_training"("userId", "courseId");

-- CreateIndex
CREATE INDEX "org_chat_messages_userId_entityKey_createdAt_idx" ON "org_chat_messages"("userId", "entityKey", "createdAt");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "founder_ideas_userId_authorKey_idx" ON "founder_ideas"("userId", "authorKey");

-- AddForeignKey
ALTER TABLE "org_entities" ADD CONSTRAINT "org_entities_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "org_promotion_approvals" ADD CONSTRAINT "org_promotion_approvals_promotionId_fkey" FOREIGN KEY ("promotionId") REFERENCES "org_promotions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

