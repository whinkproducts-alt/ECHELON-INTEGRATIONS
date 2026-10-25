-- CreateTable
CREATE TABLE "board_meetings" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "scheduledFor" TIMESTAMP(3) NOT NULL,
    "agenda" TEXT[],
    "attendees" TEXT[],
    "status" TEXT NOT NULL DEFAULT 'SCHEDULED',
    "minutes" TEXT,
    "minutesAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "board_meetings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "connector_installs" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "connectorId" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "config" JSONB,
    "installedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "connector_installs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "usage_events" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "tokensIn" INTEGER NOT NULL DEFAULT 0,
    "tokensOut" INTEGER NOT NULL DEFAULT 0,
    "costMicros" INTEGER NOT NULL DEFAULT 0,
    "kind" TEXT NOT NULL DEFAULT 'chat',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "usage_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "contacts" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT,
    "phone" TEXT,
    "company" TEXT,
    "tags" TEXT[],
    "source" TEXT NOT NULL DEFAULT 'manual',
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "contacts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "comms_requests" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "contactId" TEXT NOT NULL,
    "approvalId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "channel" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "comms_requests_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "board_meetings_userId_scheduledFor_idx" ON "board_meetings"("userId", "scheduledFor");

-- CreateIndex
CREATE INDEX "connector_installs_userId_idx" ON "connector_installs"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "connector_installs_userId_connectorId_key" ON "connector_installs"("userId", "connectorId");

-- CreateIndex
CREATE INDEX "usage_events_userId_createdAt_idx" ON "usage_events"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "contacts_userId_idx" ON "contacts"("userId");

-- CreateIndex
CREATE INDEX "contacts_userId_phone_idx" ON "contacts"("userId", "phone");

-- CreateIndex
CREATE INDEX "contacts_userId_email_idx" ON "contacts"("userId", "email");

-- CreateIndex
CREATE UNIQUE INDEX "comms_requests_approvalId_key" ON "comms_requests"("approvalId");

-- CreateIndex
CREATE INDEX "comms_requests_userId_contactId_idx" ON "comms_requests"("userId", "contactId");

-- AddForeignKey
ALTER TABLE "board_meetings" ADD CONSTRAINT "board_meetings_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "connector_installs" ADD CONSTRAINT "connector_installs_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "usage_events" ADD CONSTRAINT "usage_events_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contacts" ADD CONSTRAINT "contacts_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "comms_requests" ADD CONSTRAINT "comms_requests_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "comms_requests" ADD CONSTRAINT "comms_requests_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "contacts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "comms_requests" ADD CONSTRAINT "comms_requests_approvalId_fkey" FOREIGN KEY ("approvalId") REFERENCES "approval_requests"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AlterTable
ALTER TABLE "user_preferences" ADD COLUMN "monthlyTokenBudget" INTEGER,
ADD COLUMN "budgetSoftPct" INTEGER,
ADD COLUMN "budgetHardPct" INTEGER;
