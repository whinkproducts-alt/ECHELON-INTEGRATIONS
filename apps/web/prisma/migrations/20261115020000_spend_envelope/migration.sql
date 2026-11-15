CREATE TABLE "spend_envelopes" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "dailyCadMicros" INTEGER NOT NULL DEFAULT 1000000,
    "monthlyCadMicros" INTEGER NOT NULL DEFAULT 20000000,
    "cadPerUsd" DOUBLE PRECISION NOT NULL DEFAULT 1.37,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "spend_envelopes_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "spend_envelopes_userId_key" ON "spend_envelopes"("userId");
ALTER TABLE "spend_envelopes" ADD CONSTRAINT "spend_envelopes_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
