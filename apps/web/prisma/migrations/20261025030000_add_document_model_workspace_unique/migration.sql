-- H1 fix: add Document model for per-file ownership tracking (tenant isolation).
-- Also adds @unique constraint on document_workspaces.workspaceSlug (M1 fix).

-- M1: ensure workspaceSlug is unique across all rows
ALTER TABLE "document_workspaces" ADD CONSTRAINT "document_workspaces_workspaceSlug_key" UNIQUE ("workspaceSlug");

-- H1 / C6 / PIPEDA Q3: per-file ownership record
CREATE TABLE "documents" (
    "id"               TEXT NOT NULL,
    "userId"           TEXT NOT NULL,
    "workspaceId"      TEXT NOT NULL,
    "anythingllmDocId" TEXT NOT NULL,
    "filename"         TEXT NOT NULL,
    "mimeType"         TEXT NOT NULL,
    "sizeBytes"        INTEGER NOT NULL,
    "sha256"           TEXT NOT NULL,
    "uploadedAt"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "documents_pkey" PRIMARY KEY ("id")
);

-- Tenant isolation: userId FK ensures cascade delete when user is deleted
ALTER TABLE "documents" ADD CONSTRAINT "documents_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "documents" ADD CONSTRAINT "documents_workspaceId_fkey"
    FOREIGN KEY ("workspaceId") REFERENCES "document_workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Unique: one document record per (user, anythingllmDocId) — prevents phantom duplicate records
CREATE UNIQUE INDEX "documents_userId_anythingllmDocId_key" ON "documents"("userId", "anythingllmDocId");

-- Index for fast per-user document listing (PIPEDA Q3 / GET /api/documents)
CREATE INDEX "documents_userId_idx" ON "documents"("userId");
