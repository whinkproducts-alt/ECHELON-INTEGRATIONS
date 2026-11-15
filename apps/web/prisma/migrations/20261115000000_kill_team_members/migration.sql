CREATE TABLE "kill_team_members" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "handoff" TEXT NOT NULL DEFAULT '',
    "brief" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "kill_team_members_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "kill_team_members_userId_slug_key" ON "kill_team_members"("userId", "slug");
ALTER TABLE "kill_team_members" ADD CONSTRAINT "kill_team_members_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
