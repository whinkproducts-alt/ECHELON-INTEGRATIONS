/**
 * E2E fixtures. Creates two test-only users (never real credentials) and nothing else.
 * Idempotent: re-running updates the same rows. Never deletes anything.
 *
 *   DATABASE_URL=... DIRECT_URL=... pnpm --filter app exec tsx scripts/e2e-seed.ts
 *
 * Refuses to run against a database whose name does not look like a test/CI database, so it can
 * never touch a developer's or production database by accident.
 */
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

export const E2E_OWNER = { id: 'e2e-owner-user', email: 'e2e-owner@example.test', name: 'E2E Owner' };
export const E2E_USER_B = { id: 'e2e-user-b', email: 'e2e-user-b@example.test', name: 'E2E User B' };
/** Test-only password, shared by both fixtures. Only valid on a database this script seeded. */
export const E2E_PASSWORD = process.env.E2E_PASSWORD || 'e2e-Test-Pass-1!';

function assertTestDatabase(): void {
  const url = process.env.DATABASE_URL ?? '';
  let dbName = '';
  try { dbName = new URL(url).pathname.replace(/^\//, ''); } catch { /* handled below */ }
  if (!/(test|e2e|ci|scratch)/i.test(dbName) && process.env.E2E_ALLOW_ANY_DB !== '1') {
    throw new Error(`e2e-seed refused: database name "${dbName || '(unparseable)'}" does not contain test, e2e, ci or scratch.`);
  }
}

async function upsertUser(prisma: PrismaClient, u: { id: string; email: string; name: string }, hash: string) {
  const user = await prisma.user.upsert({
    where: { email: u.email },
    update: { passwordHash: hash, name: u.name },
    create: { id: u.id, email: u.email, name: u.name, passwordHash: hash, role: 'user' },
  });
  // displayName set: otherwise the proxy redirects every page to /onboarding.
  await prisma.userProfile.upsert({
    where: { userId: user.id },
    update: { displayName: u.name },
    create: { userId: user.id, displayName: u.name, timezone: 'UTC', autonomyLevel: 2 },
  });
  await prisma.userPreference.upsert({ where: { userId: user.id }, update: {}, create: { userId: user.id } });
  await prisma.personaState.upsert({ where: { userId: user.id }, update: {}, create: { userId: user.id, activePersona: 'WHINK' } });
  return user;
}

async function main() {
  assertTestDatabase();
  const prisma = new PrismaClient();
  try {
    const hash = await bcrypt.hash(E2E_PASSWORD, 10);
    const owner = await upsertUser(prisma, E2E_OWNER, hash);
    const b = await upsertUser(prisma, E2E_USER_B, hash);
    console.log(`e2e-seed: ok (${owner.email}, ${b.email})`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e) => { console.error(e instanceof Error ? e.message : e); process.exit(1); });
