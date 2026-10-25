-- AlterTable
ALTER TABLE "projects" ADD COLUMN "subsidiary" TEXT;

-- CreateIndex
CREATE INDEX "projects_ownerId_subsidiary_idx" ON "projects"("ownerId", "subsidiary");
