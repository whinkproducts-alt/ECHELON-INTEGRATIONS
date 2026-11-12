CREATE TABLE "speech_preferences" (
 "userId" TEXT NOT NULL PRIMARY KEY,
 "mode" TEXT NOT NULL DEFAULT 'legacy',
 "confirmedTimezone" TEXT,
 "selectedService" TEXT,
 "voiceAssignments" JSONB NOT NULL DEFAULT '{}',
 "updatedAt" TIMESTAMP(3) NOT NULL,
 CONSTRAINT "speech_preferences_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE TABLE "speech_daily_checks" (
 "id" TEXT NOT NULL PRIMARY KEY,
 "userId" TEXT NOT NULL,
 "timezone" TEXT NOT NULL,
 "scheduledDay" TEXT NOT NULL,
 "status" TEXT NOT NULL DEFAULT 'PENDING',
 "leaseToken" TEXT,
 "leaseExpiresAt" TIMESTAMP(3),
 "checkedAt" TIMESTAMP(3),
 "selected" TEXT,
 "results" JSONB,
 "reason" TEXT,
 "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 CONSTRAINT "speech_daily_checks_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "speech_daily_checks_userId_timezone_scheduledDay_key" ON "speech_daily_checks"("userId", "timezone", "scheduledDay");
CREATE INDEX "speech_daily_checks_userId_checkedAt_idx" ON "speech_daily_checks"("userId", "checkedAt");
