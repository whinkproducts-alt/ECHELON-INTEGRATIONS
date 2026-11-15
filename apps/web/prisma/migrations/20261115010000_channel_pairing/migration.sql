CREATE TABLE "channel_pairings" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "channel" TEXT NOT NULL,
    "senderId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "codeHash" TEXT,
    "expiresAt" TIMESTAMP(3),
    "pairedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "channel_pairings_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "channel_pairings_userId_channel_senderId_key" ON "channel_pairings"("userId", "channel", "senderId");
ALTER TABLE "channel_pairings" ADD CONSTRAINT "channel_pairings_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
