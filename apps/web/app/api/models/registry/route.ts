export const dynamic = 'force-dynamic';
// R04: the model registry, the caller's saved profiles and a preview of how the active profile routes a private
// chat request right now (which choice would be used and why the others are skipped). No credential values.
import { NextResponse } from 'next/server';
import { requireUserId } from '@/lib/api-helpers';
import { prisma } from '@/lib/db';
import { isLocalOnlyMode } from '@/lib/local-only';
import { publicRegistry } from '@/lib/model-router/registry';
import { DEFAULT_PROFILE_CHOICES, listProfiles, paidAdmission, planRoute } from '@/lib/model-router/priority';
import { getSafetyState } from '@/lib/safety/lockdown';

export async function GET() {
  const a = await requireUserId();
  if ('response' in a) return a.response;
  const [profiles, safety, keys] = await Promise.all([
    listProfiles(a.userId),
    getSafetyState(a.userId),
    prisma.userApiKey.findMany({ where: { userId: a.userId }, select: { provider: true } }).catch(() => [] as Array<{ provider: string }>),
  ]);
  const active = profiles.find((p) => p.active) ?? null;
  const plan = planRoute(active?.choices ?? DEFAULT_PROFILE_CHOICES, {
    lockedDown: safety.lockedDown, localOnly: isLocalOnlyMode(), dataClass: 'private', needsTools: false,
    paidAdmitted: paidAdmission(process.env, new Set(keys.map((k) => k.provider))),
  });
  return NextResponse.json({
    registry: publicRegistry(),
    profiles,
    preview: {
      profileId: active?.id ?? null,
      revision: active?.revision ?? null,
      steps: plan.steps.map((s) => ({ type: s.type, id: s.entry.id })),
      skipped: plan.skipped,
      lockedDown: safety.lockedDown,
      localOnly: isLocalOnlyMode(),
      paidModelsAdmitted: process.env.WHINK_PAID_MODELS_ENABLED === 'true',
    },
  }, { headers: { 'Cache-Control': 'no-store' } });
}
