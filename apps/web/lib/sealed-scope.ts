/**
 * C05: Founder-private sealed scope.
 *
 * Server-enforced isolation for Marcus/Tunde/Peter/Paul objectives, execution,
 * results and memory. Ordinary accounts, organization agents and persona changes
 * must not expose sealed information through any query, event, export or recall.
 *
 * This module is the single source of truth for sealed scope access control.
 */
import { prisma } from '@/lib/db';
import { isOwnerEmail } from '@/lib/owner';

export type SealedKind = 'OBJECTIVE' | 'EXECUTION' | 'RESULT' | 'MEMORY' | 'BRIEFING';
export type Directorate = 'MARCUS' | 'TUNDE' | 'PETER' | 'PAUL';

export interface SealedObjectiveView {
  id: string;
  title: string;
  body: string;
  directorate: Directorate | null;
  status: 'ACTIVE' | 'COMPLETED' | 'ARCHIVED';
  createdAt: Date;
  updatedAt: Date;
  completedAt: Date | null;
}

export interface SealedScopeView {
  id: string;
  kind: SealedKind;
  refId: string;
  createdAt: Date;
}

/**
 * Check if the current user context has founder access to sealed data.
 * This is the ONLY gate — no persona, role, or delegation can bypass it.
 */
export function assertFounderAccess(userId: string, email: string | null | undefined): void {
  if (!isOwnerEmail(email)) {
    throw new Error('SEALED_SCOPE_DENIED: Founder access required');
  }
}

/**
 * Create a new sealed objective. Only the Founder can create.
 */
export async function createSealedObjective(input: {
  userId: string;
  email: string | null | undefined;
  title: string;
  body: string;
  directorate?: Directorate;
}): Promise<SealedObjectiveView> {
  assertFounderAccess(input.userId, input.email);
  const obj = await prisma.sealedObjective.create({
    data: {
      userId: input.userId,
      title: input.title,
      body: input.body,
      directorate: input.directorate ?? null,
      status: 'ACTIVE',
    },
  });
  await prisma.sealedScope.create({
    data: { userId: input.userId, kind: 'OBJECTIVE', refId: obj.id },
  });
  return { ...obj, directorate: obj.directorate as Directorate | null, status: obj.status as 'ACTIVE' | 'COMPLETED' | 'ARCHIVED' };
}

/**
 * List sealed objectives for the Founder. Ordinary users get empty array.
 */
export async function listSealedObjectives(userId: string, email: string | null | undefined, status?: string): Promise<SealedObjectiveView[]> {
  if (!isOwnerEmail(email)) return [];
  const objs = await prisma.sealedObjective.findMany({
    where: { userId, ...(status ? { status } : {}) },
    orderBy: { createdAt: 'desc' },
  });
  return objs.map(o => ({ ...o, directorate: o.directorate as Directorate | null, status: o.status as 'ACTIVE' | 'COMPLETED' | 'ARCHIVED' }));
}

/**
 * Get a sealed objective by ID. Returns null if not found or not Founder.
 */
export async function getSealedObjective(userId: string, email: string | null | undefined, id: string): Promise<SealedObjectiveView | null> {
  if (!isOwnerEmail(email)) return null;
  const obj = await prisma.sealedObjective.findFirst({ where: { id, userId } });
  if (!obj) return null;
  return { ...obj, directorate: obj.directorate as Directorate | null, status: obj.status as 'ACTIVE' | 'COMPLETED' | 'ARCHIVED' };
}

/**
 * Update a sealed objective. Only the Founder can update.
 */
export async function updateSealedObjective(input: {
  userId: string;
  email: string | null | undefined;
  id: string;
  title?: string;
  body?: string;
  directorate?: Directorate | null;
  status?: 'ACTIVE' | 'COMPLETED' | 'ARCHIVED';
}): Promise<SealedObjectiveView | null> {
  assertFounderAccess(input.userId, input.email);
  const { id, ...data } = input;
  const obj = await prisma.sealedObjective.update({
    where: { id, userId: input.userId },
    data: { ...data, updatedAt: new Date() },
  });
  return { ...obj, directorate: obj.directorate as Directorate | null, status: obj.status as 'ACTIVE' | 'COMPLETED' | 'ARCHIVED' };
}

/**
 * Register a sealed scope reference. Only the Founder can create scopes.
 */
export async function registerSealedScope(input: {
  userId: string;
  email: string | null | undefined;
  kind: 'OBJECTIVE' | 'EXECUTION' | 'RESULT' | 'MEMORY' | 'BRIEFING';
  refId: string;
}): Promise<void> {
  assertFounderAccess(input.userId, input.email);
  await prisma.sealedScope.create({
    data: { userId: input.userId, kind: input.kind, refId: input.refId },
  });
}

/**
 * Check if a reference is within a sealed scope. Used by query layers to filter.
 */
export async function isSealedScope(userId: string, kind: 'OBJECTIVE' | 'EXECUTION' | 'RESULT' | 'MEMORY' | 'BRIEFING', refId: string): Promise<boolean> {
  const scope = await prisma.sealedScope.findUnique({ where: { kind_refId: { kind, refId } } });
  return scope?.userId === userId;
}

/**
 * Filter an array of IDs, removing any that are in a sealed scope not owned by the user.
 * Used by memory, swarm, and briefing query layers.
 */
export async function filterSealedScopes<T extends { id: string }>(
  userId: string,
  email: string | null | undefined,
  items: T[],
  kind: 'OBJECTIVE' | 'EXECUTION' | 'RESULT' | 'MEMORY' | 'BRIEFING'
): Promise<T[]> {
  if (isOwnerEmail(email)) return items;
  const sealedIds = new Set(
    (await prisma.sealedScope.findMany({
      where: { kind, refId: { in: items.map((i) => i.id) } },
      select: { refId: true },
    })).map((s) => s.refId)
  );
  return items.filter((i) => !sealedIds.has(i.id));
}

/**
 * Get all sealed scope IDs for a user (for audit/export).
 */
export async function getSealedScopeIds(userId: string, email: string | null | undefined): Promise<SealedScopeView[]> {
  if (!isOwnerEmail(email)) return [];
  const scopes = await prisma.sealedScope.findMany({ where: { userId }, orderBy: { createdAt: 'desc' } });
  return scopes.map(s => ({ ...s, kind: s.kind as SealedKind }));
}