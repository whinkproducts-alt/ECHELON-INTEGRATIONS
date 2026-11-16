export const dynamic = 'force-dynamic';
// Owner-only org mutations. No entity, persona or agent can reach this: it needs the founder's session.
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { auth } from '@/auth';
import { isOwnerEmail } from '@/lib/owner';
import { readJsonBody } from '@/lib/api-helpers';
import { limitOr429 } from '@/lib/rate-limit';
import { seedOrg } from '@/lib/org/seed';
import { setKpi, deleteKpi, setPolicy } from '@/lib/org/kpi';
import { createProposal, decideProposal } from '@/lib/org/promotion';
import { submitView } from '@/lib/org/review';
import { approveCourse, ensureTemplates, recordAttempt } from '@/lib/org/training';
import { markIdeaViable, setContractSource } from '@/lib/org/credit';

const Scenario = z.object({ id: z.string().min(1).max(40), prompt: z.string().min(1).max(2000), mustMention: z.array(z.string().max(200)).max(20), mustNotMention: z.array(z.string().max(200)).max(20).optional() });
const Body = z.discriminatedUnion('op', [
  z.object({ op: z.literal('seed') }),
  z.object({ op: z.literal('setKpi'), entityKey: z.string().max(200), measureCode: z.string().max(40), target: z.number(), weight: z.number(), periodDays: z.number() }),
  z.object({ op: z.literal('deleteKpi'), entityKey: z.string().max(200), measureCode: z.string().max(40) }),
  z.object({ op: z.literal('setPolicy'), promotionThreshold: z.number().nullable(), periodsRequired: z.number().nullable() }),
  z.object({ op: z.literal('propose'), entityKey: z.string().max(200), kind: z.enum(['promote', 'demote']), toRole: z.string().min(1).max(200), changesAccess: z.boolean().optional() }),
  z.object({ op: z.literal('decide'), id: z.string().max(60), approverKey: z.string().max(200), decision: z.enum(['approve', 'reject']), contentHash: z.string().length(64) }),
  z.object({ op: z.literal('reviewView'), id: z.string().max(60), author: z.enum(['WHINK', 'MAMBA']), text: z.string().max(4000) }),
  z.object({ op: z.literal('approveCourse'), code: z.string().max(60), body: z.string().max(20000), scenarios: z.array(Scenario).max(30), passMark: z.number(), intervalDays: z.number() }),
  z.object({ op: z.literal('attempt'), id: z.string().max(60), answers: z.record(z.string(), z.string().max(4000)) }),
  z.object({ op: z.literal('ideaViable'), ideaId: z.string().max(60), authorKey: z.string().max(200) }),
  z.object({ op: z.literal('contractSource'), contractId: z.string().max(60), sourcedByKey: z.string().max(200) }),
]);

export async function POST(req: Request) {
  const s = await auth();
  if (!s?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!isOwnerEmail(s.user.email)) return NextResponse.json({ error: 'Founder access required' }, { status: 403 });
  const userId = s.user.id;
  const limited = await limitOr429('briefing', userId);
  if (limited) return limited;
  const b = await readJsonBody(req, 64 * 1024);
  if ('response' in b) return b.response;
  const p = Body.safeParse(b.body);
  if (!p.success) return NextResponse.json({ error: 'Invalid request' }, { status: 400 });
  const d = p.data;
  let out: { ok: boolean; error?: string; [k: string]: unknown };
  switch (d.op) {
    case 'seed': { const r = await seedOrg(userId); await ensureTemplates(userId); out = { ok: true, ...r }; break; }
    // actorKey is null: the founder is the only caller, and the founder is not an OrgEntity subject of these routes.
    case 'setKpi': out = await setKpi(userId, null, d); break;
    case 'deleteKpi': out = { ok: await deleteKpi(userId, d.entityKey, d.measureCode) }; break;
    case 'setPolicy': out = await setPolicy(userId, d); break;
    case 'propose': out = await createProposal(userId, d, 'user'); break;
    case 'decide': out = await decideProposal(userId, d.id, d.approverKey, d.decision, d.contentHash); break;
    case 'reviewView': out = await submitView(userId, d.id, d.author, d.text); break;
    case 'approveCourse': out = await approveCourse(userId, d.code, d); break;
    case 'attempt': out = await recordAttempt(userId, d.id, d.answers); break;
    case 'ideaViable': out = { ok: await markIdeaViable(userId, d.ideaId, d.authorKey) }; break;
    case 'contractSource': out = { ok: await setContractSource(userId, d.contractId, d.sourcedByKey) }; break;
  }
  return NextResponse.json(out, { status: out.ok ? 200 : 400 });
}
