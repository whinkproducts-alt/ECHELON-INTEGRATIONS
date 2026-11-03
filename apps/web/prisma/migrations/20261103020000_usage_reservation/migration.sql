ALTER TABLE "usage_events" ADD COLUMN "reservedTokens" INTEGER NOT NULL DEFAULT 0 CHECK ("reservedTokens" >= 0), ADD COLUMN "usageBasis" TEXT NOT NULL DEFAULT 'unspecified';
