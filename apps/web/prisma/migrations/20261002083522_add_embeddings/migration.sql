-- AlterTable
ALTER TABLE "memory_episodes" ADD COLUMN     "embedding" vector(1536);

-- AlterTable
ALTER TABLE "memory_semantic" ADD COLUMN     "embedding" vector(1536);
