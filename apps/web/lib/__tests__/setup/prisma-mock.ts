/**
 * Global vitest setup: mock @prisma/client before any module is imported.
 * This prevents "PrismaClient did not initialize" errors in environments
 * where the Prisma engine binary cannot be downloaded (e.g. CI containers
 * with a restricted network proxy).
 *
 * Tests that need specific Prisma return values should use vi.mocked() on
 * the individual delegate methods defined in mockPrisma below.
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

const mockPrismaInstance = {
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
  action: createMockDelegate(),
  $connect: vi.fn().mockResolvedValue(undefined),
  $disconnect: vi.fn().mockResolvedValue(undefined),
  $transaction: vi.fn().mockImplementation(
    (fn: ((tx: unknown) => unknown) | unknown[]) =>
      typeof fn === 'function'
        ? fn(mockPrismaInstance)
        : Promise.resolve(fn)
  ),
  $queryRaw: vi.fn().mockResolvedValue([]),
  $executeRaw: vi.fn().mockResolvedValue(0),
};

class MockPrismaClient {
  user = createMockDelegate();
  project = createMockDelegate();
  memory = createMockDelegate();
  session = createMockDelegate();
  account = createMockDelegate();
  verificationToken = createMockDelegate();
  socialConnector = createMockDelegate();
  scheduledPost = createMockDelegate();
  permissionOverride = createMockDelegate();
  auditLog = createMockDelegate();
  ledgerEntry = createMockDelegate();
  action = createMockDelegate();
  $connect = vi.fn().mockResolvedValue(undefined);
  $disconnect = vi.fn().mockResolvedValue(undefined);
  $transaction = vi.fn().mockImplementation(
    (fn: ((tx: unknown) => unknown) | unknown[]) =>
      typeof fn === 'function' ? fn(this) : Promise.resolve(fn)
  );
  $queryRaw = vi.fn().mockResolvedValue([]);
  $executeRaw = vi.fn().mockResolvedValue(0);
}

vi.mock('@prisma/client', () => ({
  PrismaClient: MockPrismaClient,
  Prisma: {
    PrismaClientKnownRequestError: class extends Error {
      code: string;
      constructor(message: string, opts: { code: string }) {
        super(message);
        this.code = opts.code;
      }
    },
  },
}));
