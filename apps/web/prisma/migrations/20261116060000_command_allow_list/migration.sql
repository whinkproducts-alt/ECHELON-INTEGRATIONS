CREATE TABLE "command_allow_lists" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "programs" TEXT[],
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "command_allow_lists_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "command_allow_lists_userId_key" ON "command_allow_lists"("userId");
ALTER TABLE "command_allow_lists" ADD CONSTRAINT "command_allow_lists_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
