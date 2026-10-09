/**
 * Vitest-compatible Prisma mock.
 * Used by the global setup so tests that transitively import lib/db.ts
 * never need a generated Prisma engine binary.
 */
import { vi } from 'vitest';

const createMockDelegate = () => ({
  findUnique: vi.fn().mockResolvedValue(null),
  findFirst: vi.fn().mockResolvedValue(null),
  findMany: vi.fn().mockResolvedValue([]),
  create: vi.fn().mockResolvedValue({}),
  update: vi.fn().mockResolvedValue({}),
  upsert: vi.fn().mockResolvedValue({}),
  delete: vi.fn().mockResolvedValue({}),
  deleteMany: vi.fn().mockResolvedValue({ count: 0 }),
  count: vi.fn().mockResolvedValue(0),
  aggregate: vi.fn().mockResolvedValue({}),
  groupBy: vi.fn().mockResolvedValue([]),
});

export const mockPrisma = {
  user: createMockDelegate(),
  project: createMockDelegate(),
  memory: createMockDelegate(),
  session: createMockDelegate(),
  account: createMockDelegate(),
  verificationToken: createMockDelegate(),
  socialConnector: createMockDelegate(),
  scheduledPost: createMockDelegate(),
  permissionOverride: createMockDelegate(),
  auditLog: createMockDelegate(),
  ledgerEntry: createMockDelegate(),
  $connect: vi.fn().mockResolvedValue(undefined),
  $disconnect: vi.fn().mockResolvedValue(undefined),
  $transaction: vi.fn().mockImplementation((fn: (tx: unknown) => unknown) =>
    typeof fn === 'function' ? fn(mockPrisma) : Promise.resolve(fn)
  ),
  $queryRaw: vi.fn().mockResolvedValue([]),
  $executeRaw: vi.fn().mockResolvedValue(0),
};
