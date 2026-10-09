import { PrismaClient } from '@prisma/client';

const globalForPrisma = globalThis as unknown as { prisma: PrismaClient };

// During the Next.js production build phase, page-data collection imports every
// route module, which transitively imports this file. We must not call
// `new PrismaClient()` at that point because the generated engine binary is not
// present in CI environments where binaries.prisma.sh is behind a proxy.
// The guard returns null (cast to satisfy TypeScript) so module imports resolve;
// actual database access never happens during the static build step.
const isBuildPhase =
  process.env.NEXT_PHASE === 'phase-production-build' ||
  process.env.NEXT_PHASE === 'phase-export';

export const prisma: PrismaClient =
  globalForPrisma.prisma ||
  (isBuildPhase ? (null as unknown as PrismaClient) : new PrismaClient());

if (process.env.NODE_ENV !== 'production' && !isBuildPhase)
  globalForPrisma.prisma = prisma;
