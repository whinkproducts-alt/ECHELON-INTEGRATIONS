-- Enable pgvector so the shadow database can apply this migration
CREATE EXTENSION IF NOT EXISTS vector;

-- AlterTable
ALTER TABLE "memory_episodes" ADD COLUMN     "embedding" vector(1536);

-- AlterTable
ALTER TABLE "memory_semantic" ADD COLUMN     "embedding" vector(1536);
