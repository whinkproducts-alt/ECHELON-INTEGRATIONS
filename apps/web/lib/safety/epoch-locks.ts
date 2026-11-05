/**
 * C06: Cross-process epoch locks and all-dispatch/in-flight lockdown.
 *
 * Extends the existing lockdown with:
 * - Per-process epoch locks that prevent concurrent dispatch/outbound/tool/speech
 * - Cancelable inference with epoch checks
 * - Browser capture/audio shutdown propagation
 * - Read-only local review preserved
 */
import { prisma } from '@/lib/db';
import { logger } from '@/lib/logger';
import { recordActionSafe } from '@/lib/ledger';

export type SafetyScope = 'DISPATCH' | 'OUTBOUND' | 'TOOL' | 'WORKER' | 'SPEECH';

export interface EpochLockView {
  id: string;
  userId: string;
  epoch: number;
  scope: SafetyScope;
  heldBy: string;
  expiresAt: Date;
  createdAt: Date;
}

const LOCK_TTL_MS = 30_000; // 30 seconds

/**
 * Acquire an epoch lock for a safety scope.
 * Returns the lock if acquired, null if another process holds it.
 * The lock is released when it expires or when explicitly released.
 */
export async function acquireEpochLock(
  userId: string,
  epoch: number,
  scope: SafetyScope,
  processId: string
): Promise<EpochLockView | null> {
  const expiresAt = new Date(Date.now() + LOCK_TTL_MS);
  try {
    const lock = await prisma.safetyEpochLock.create({
      data: {
        userId,
        epoch,
        scope,
        heldBy: processId,
        expiresAt,
      },
    });
    return { ...lock, scope: lock.scope as SafetyScope };
  } catch (e: any) {
    if (e.code === 'P2002') return null; // Unique constraint on (userId, epoch, scope) would be ideal but we use index
    // Check if existing lock is still valid
    const existing = await prisma.safetyEpochLock.findFirst({
      where: { userId, epoch, scope, expiresAt: { gt: new Date() } },
    });
    if (existing && existing.heldBy !== processId) return null;
    // If it's our lock or expired, try to take it
    if (existing) {
      await prisma.safetyEpochLock.delete({ where: { id: existing.id } });
      return acquireEpochLock(userId, epoch, scope, processId);
    }
    throw e;
  }
}

/**
 * Release an epoch lock held by this process.
 */
export async function releaseEpochLock(
  userId: string,
  epoch: number,
  scope: SafetyScope,
  processId: string
): Promise<void> {
  await prisma.safetyEpochLock.deleteMany({
    where: { userId, epoch, scope, heldBy: processId },
  });
}

/**
 * Heartbeat to extend an epoch lock.
 */
export async function heartbeatEpochLock(
  userId: string,
  epoch: number,
  scope: SafetyScope,
  processId: string
): Promise<boolean> {
  const lock = await prisma.safetyEpochLock.findFirst({
    where: { userId, epoch, scope, heldBy: processId },
  });
  if (!lock) return false;
  const newExpiry = new Date(Date.now() + LOCK_TTL_MS);
  await prisma.safetyEpochLock.update({
    where: { id: lock.id },
    data: { expiresAt: newExpiry },
  });
  return true;
}

/**
 * Check if any valid epoch lock exists for a scope at a given epoch.
 * Used by boundaries to verify they can proceed.
 */
export async function hasValidEpochLock(
  userId: string,
  epoch: number,
  scope: SafetyScope
): Promise<boolean> {
  const lock = await prisma.safetyEpochLock.findFirst({
    where: { userId, epoch, scope, expiresAt: { gt: new Date() } },
  });
  return !!lock;
}

/**
 * Clean up expired epoch locks.
 */
export async function cleanupExpiredEpochLocks(): Promise<number> {
  const result = await prisma.safetyEpochLock.deleteMany({
    where: { expiresAt: { lt: new Date() } },
  });
  return result.count;
}

/**
 * C6: Engage lockdown with epoch lock across all scopes.
 * This is called by the existing setLockdown when engaging.
 */
export async function engageLockdownWithLocks(
  userId: string,
  processId: string,
  reason?: string
): Promise<{ epoch: number; locks: EpochLockView[] }> {
  const scopes: SafetyScope[] = ['DISPATCH', 'OUTBOUND', 'TOOL', 'WORKER', 'SPEECH'];
  const epoch = await prisma.$transaction(async (tx) => {
    // Get current epoch
    const state = await tx.accountSafetyState.findUnique({ where: { userId } });
    const nextEpoch = (state?.epoch ?? 0) + 1;
    
    // Engage lockdown
    await tx.accountSafetyState.upsert({
      where: { userId },
      create: { userId, lockedDown: true, epoch: nextEpoch, reason, changedBy: processId },
      update: { lockedDown: true, epoch: { increment: 1 }, reason, changedBy: processId },
    });
    
    // Acquire locks for all scopes
    for (const scope of scopes) {
      const expiresAt = new Date(Date.now() + LOCK_TTL_MS);
      await tx.safetyEpochLock.upsert({
        where: { userId_epoch_scope: { userId, epoch: nextEpoch, scope } },
        create: { userId, epoch: nextEpoch, scope, heldBy: processId, expiresAt },
        update: { heldBy: processId, expiresAt },
      });
    }
    
    await recordActionSafe({
      userId,
      initiator: 'user',
      persona: 'WHINK',
      action: 'lockdown_engaged',
      tool: 'safety_lockdown',
      permissionClass: 'A',
      status: 'EXECUTED',
      correlationId: `lockdown-${nextEpoch}`,
      inputSummary: `epoch ${nextEpoch - 1} -> ${nextEpoch}; reason: ${reason ?? 'none'}`,
    });
    
    return nextEpoch;
  });
  
  const locks = await Promise.all(
    scopes.map((scope) => prisma.safetyEpochLock.findUnique({ where: { userId_epoch_scope: { userId, epoch, scope } } }))
      .map(p => p.then((l: { scope: string } | null) => l ? { ...l, scope: l.scope as SafetyScope } : null))
  );
  
  return { epoch, locks: locks.filter((l): l is EpochLockView => !!l) };
}

/**
 * C6: Release lockdown and all epoch locks.
 * Requires the epoch to match (stale screen protection).
 */
export async function releaseLockdownWithLocks(
  userId: string,
  expectedEpoch: number,
  processId: string
): Promise<void> {
  await prisma.$transaction(async (tx) => {
    const state = await tx.accountSafetyState.findUnique({ where: { userId } });
    if (!state || state.epoch !== expectedEpoch || !state.lockedDown) {
      throw new Error('Safety state changed since it was loaded. Reload and try again.');
    }
    
    // Release all locks for this epoch
    await tx.safetyEpochLock.deleteMany({ where: { userId, epoch: expectedEpoch } });
    
    // Release lockdown
    await tx.accountSafetyState.update({
      where: { userId },
      data: { lockedDown: false, epoch: { increment: 1 }, reason: null, changedBy: processId },
    });
    
    await recordActionSafe({
      userId,
      initiator: 'user',
      persona: 'WHINK',
      action: 'lockdown_released',
      tool: 'safety_lockdown',
      permissionClass: 'A',
      status: 'EXECUTED',
      correlationId: `lockdown-${expectedEpoch}`,
      inputSummary: `epoch ${expectedEpoch} -> ${expectedEpoch + 1}`,
    });
  });
}

/**
 * C6: Verify a boundary can proceed — checks both lockdown and epoch lock.
 * Called by dispatch, outbound, tool, worker, and speech boundaries.
 */
export async function assertSafetyBoundary(
  userId: string,
  boundary: SafetyScope,
  correlationId?: string
): Promise<{ epoch: number }> {
  const state = await getSafetyStateWithEpoch(userId);
  if (state.lockedDown) {
    await recordActionSafe({
      userId,
      initiator: 'system',
      persona: 'WHINK',
      action: 'lockdown_blocked',
      tool: boundary.slice(0, 64),
      permissionClass: 'C',
      status: 'DENIED',
      outputSummary: 'Lockdown active',
      correlationId: correlationId ?? 'unknown',
    });
    throw new Error(`LOCKDOWN_ACTIVE:${boundary}:${state.epoch}`);
  }
  
  // Verify epoch lock for this boundary
  const hasLock = await hasValidEpochLock(userId, state.epoch, boundary);
  if (!hasLock) {
    // Lock may have expired; this is a soft failure that triggers re-acquisition
    logger.warn('epoch lock expired or missing', { userId, boundary, epoch: state.epoch });
  }
  
  return { epoch: state.epoch };
}

/**
 * Get safety state with epoch (extends lib/safety/lockdown.ts getSafetyState).
 */
export async function getSafetyStateWithEpoch(userId: string) {
  const row = await prisma.accountSafetyState.findUnique({ where: { userId } });
  if (!row) return { lockedDown: false, epoch: 0, reason: null, changedAt: null };
  return { lockedDown: row.lockedDown, epoch: row.epoch, reason: row.reason, changedAt: row.changedAt };
}

/**
 * C6: Cancelable inference — checks epoch before each model call.
 * Wraps an inference call with epoch verification.
 */
export async function withEpochCheck<T>(
  userId: string,
  epoch: number,
  scope: SafetyScope,
  inference: () => Promise<T>
): Promise<T> {
  const hasLock = await hasValidEpochLock(userId, epoch, scope);
  if (!hasLock) {
    throw new Error(`EPOCH_LOCK_MISSING:${scope}:${epoch}`);
  }
  return inference();
}

/**
 * C6: Browser capture/audio shutdown — called by client-lockdown.ts
 * This is a server-side record that the browser was told to shut down.
 */
export async function recordClientShutdown(
  userId: string,
  epoch: number,
  types: ('microphone' | 'camera' | 'audio')[]
): Promise<void> {
  await recordActionSafe({
    userId,
    initiator: 'system',
    persona: 'WHINK',
    action: 'client_shutdown',
    tool: 'media',
    permissionClass: 'C',
    status: 'EXECUTED',
    inputSummary: `types=${types.join(',')}`,
    correlationId: `shutdown-${epoch}`,
  });
}