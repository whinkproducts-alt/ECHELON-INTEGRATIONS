export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/auth';
import { prisma } from '@/lib/db';
import { randomUUID } from 'crypto';
import { recordAction } from '@/lib/ledger';
import { createApproval, listPending } from '@/lib/approvals';

const INTERRUPTION = ['QUIET', 'BALANCED', 'PROACTIVE', 'EXECUTIVE'] as const;
const VERBOSITY = ['QUICK', 'STANDARD', 'DEEP', 'EXECUTIVE'] as const;
const MAMBA_PREF = ['OFF', 'ON_REQUEST', 'AUTO_SUGGEST'] as const;
const EXEC_PROFILE = ['PERFORMANCE', 'BALANCED', 'ECONOMY'] as const;
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;
const MIN_AUTONOMY = 0;
const MAX_AUTONOMY = 4;
const DEFAULT_AUTONOMY = 1;

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => typeof v === 'object' && v !== null && !Array.isArray(v);
const oneOf = (v: unknown, list: readonly string[]): v is string => typeof v === 'string' && list.includes(v);

interface ProfileData {
  displayName?: string | null;
  timezone?: string;
  workingHoursStart?: string;
  workingHoursEnd?: string;
  interruptionBudget?: string;
}
interface PreferenceData {
  verbosity?: string;
  mambaPreference?: string;
  executionProfile?: string;
  defaultFunctionalMode?: string | null;
  preferredModel?: string | null;
}

function parseProfile(p: Obj): { error: string } | { data: ProfileData; autonomy?: number } {
  const data: ProfileData = {};
  let autonomy: number | undefined;
  if (p.displayName !== undefined) {
    if (p.displayName !== null && (typeof p.displayName !== 'string' || p.displayName.length > 120)) return { error: 'invalid displayName' };
    data.displayName = p.displayName === null ? null : p.displayName.trim();
  }
  if (p.timezone !== undefined) {
    if (typeof p.timezone !== 'string' || !p.timezone || p.timezone.length > 64) return { error: 'invalid timezone' };
    data.timezone = p.timezone;
  }
  for (const k of ['workingHoursStart', 'workingHoursEnd'] as const) {
    const v = p[k];
    if (v === undefined) continue;
    if (typeof v !== 'string' || !TIME_RE.test(v)) return { error: `invalid ${k}` };
    data[k] = v;
  }
  if (p.interruptionBudget !== undefined) {
    if (!oneOf(p.interruptionBudget, INTERRUPTION)) return { error: 'invalid interruptionBudget' };
    data.interruptionBudget = p.interruptionBudget;
  }
  if (p.autonomyLevel !== undefined) {
    const a = p.autonomyLevel;
    if (typeof a !== 'number' || !Number.isInteger(a) || a < MIN_AUTONOMY || a > MAX_AUTONOMY) return { error: 'invalid autonomyLevel' };
    autonomy = a;
  }
  return { data, autonomy };
}

function parsePreferences(p: Obj): { error: string } | { data: PreferenceData } {
  const data: PreferenceData = {};
  if (p.verbosity !== undefined) {
    if (!oneOf(p.verbosity, VERBOSITY)) return { error: 'invalid verbosity' };
    data.verbosity = p.verbosity;
  }
  if (p.mambaPreference !== undefined) {
    if (!oneOf(p.mambaPreference, MAMBA_PREF)) return { error: 'invalid mambaPreference' };
    data.mambaPreference = p.mambaPreference;
  }
  if (p.executionProfile !== undefined) {
    if (!oneOf(p.executionProfile, EXEC_PROFILE)) return { error: 'invalid executionProfile' };
    data.executionProfile = p.executionProfile;
  }
  for (const [k, max] of [['defaultFunctionalMode', 64], ['preferredModel', 120]] as const) {
    const v = p[k];
    if (v === undefined) continue;
    if (v !== null && (typeof v !== 'string' || v.length > max)) return { error: `invalid ${k}` };
    data[k] = v === null || v === '' ? null : v;
  }
  return { data };
}

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const [profile, preferences] = await Promise.all([
    prisma.userProfile.findUnique({ where: { userId: session.user.id } }),
    prisma.userPreference.findUnique({ where: { userId: session.user.id } }),
  ]);
  return NextResponse.json({ profile, preferences });
}

export async function PATCH(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const userId = session.user.id;

  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }
  if (!isObj(raw)) return NextResponse.json({ error: 'Invalid body' }, { status: 400 });

  let profileData: ProfileData | null = null;
  let requestedAutonomy: number | undefined;
  if (raw.profile !== undefined) {
    if (!isObj(raw.profile)) return NextResponse.json({ error: 'invalid profile' }, { status: 400 });
    const r = parseProfile(raw.profile);
    if ('error' in r) return NextResponse.json({ error: r.error }, { status: 400 });
    profileData = r.data;
    requestedAutonomy = r.autonomy;
  }
  let prefData: PreferenceData | null = null;
  if (raw.preferences !== undefined) {
    if (!isObj(raw.preferences)) return NextResponse.json({ error: 'invalid preferences' }, { status: 400 });
    const r = parsePreferences(raw.preferences);
    if ('error' in r) return NextResponse.json({ error: r.error }, { status: 400 });
    prefData = r.data;
  }
  let name: string | undefined;
  if (raw.name !== undefined) {
    if (typeof raw.name !== 'string' || raw.name.length > 120) return NextResponse.json({ error: 'invalid name' }, { status: 400 });
    if (raw.name.trim()) name = raw.name.trim();
  }

  // Autonomy: lowering applies now. Raising is Class C: everything else is applied,
  // the level is untouched, and an approval is created. Same level is ignored.
  let lowerTo: number | null = null;
  let lowerFrom = DEFAULT_AUTONOMY;
  let raise: { from: number; to: number } | null = null;
  if (requestedAutonomy !== undefined) {
    const current = await prisma.userProfile.findUnique({
      where: { userId },
      select: { autonomyLevel: true },
    });
    const from = current?.autonomyLevel ?? DEFAULT_AUTONOMY;
    if (requestedAutonomy < from) { lowerTo = requestedAutonomy; lowerFrom = from; }
    else if (requestedAutonomy > from) {
      const pending = (await listPending(userId)).find((v) => v.kind === 'autonomy_change');
      if (pending) {
        return NextResponse.json(
          { error: 'An autonomy change is already awaiting approval', approval: pending },
          { status: 409 }
        );
      }
      raise = { from, to: requestedAutonomy };
    }
  }

  if (profileData || lowerTo !== null || raise) {
    const base: ProfileData = profileData ?? {};
    const level = lowerTo !== null ? { autonomyLevel: lowerTo } : {};
    // Raising never writes autonomyLevel; the upsert only guarantees the row exists.
    await prisma.userProfile.upsert({
      where: { userId },
      update: { ...base, ...level },
      create: { ...base, ...level, userId },
    });
  }
  if (prefData) {
    await prisma.userPreference.upsert({
      where: { userId },
      update: { ...prefData },
      create: { ...prefData, userId },
    });
  }
  if (name) {
    await prisma.user.update({ where: { id: userId }, data: { name } });
  }
  if (lowerTo !== null) {
    await recordAction({
      userId,
      action: 'autonomy_level_change',
      permissionClass: 'B',
      status: 'VALIDATED',
      initiator: 'user',
      inputSummary: JSON.stringify({ from: lowerFrom, to: lowerTo }),
      outputSummary: 'Autonomy lowered',
    });
  }
  if (raise) {
    const approval = await createApproval({
      userId,
      kind: 'autonomy_change',
      tool: null,
      params: { from: raise.from, to: raise.to },
      summary: `Raise autonomy from level ${raise.from} to level ${raise.to}`,
      permissionClass: 'C',
      correlationId: randomUUID(),
    });
    return NextResponse.json({ requiresApproval: true, approval }, { status: 202 });
  }
  return NextResponse.json({ success: true });
}
