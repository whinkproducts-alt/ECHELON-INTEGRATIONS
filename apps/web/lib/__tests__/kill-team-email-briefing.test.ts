import { describe, it, expect, vi, beforeEach } from 'vitest';

const rows: Array<{ userId: string; slug: string; name: string; role: string; handoff: string; brief: string; createdAt: Date }> = [];
vi.mock('@/lib/db', () => ({
  prisma: {
    killTeamMember: {
      findMany: async ({ where }: any) => rows.filter((r) => r.userId === where.userId),
      createMany: async ({ data }: any) => { for (const d of data) if (!rows.some((r) => r.userId === d.userId && r.slug === d.slug)) rows.push({ ...d, createdAt: new Date() }); },
      count: async ({ where }: any) => rows.filter((r) => r.userId === where.userId && r.slug !== where.slug.not).length,
      create: async ({ data }: any) => { if (rows.some((r) => r.userId === data.userId && r.slug === data.slug)) throw new Error('dup'); rows.push({ ...data, createdAt: new Date() }); },
      deleteMany: async ({ where }: any) => { const n = rows.length; const keep = rows.filter((r) => !(r.userId === where.userId && r.slug === where.slug)); rows.length = 0; rows.push(...keep); return { count: n - rows.length }; },
    },
    user: { findUnique: async () => ({ email: 'a@b.co' }) },
    notificationPreference: { findFirst: async () => null },
  },
}));
vi.mock('@/lib/model-router', () => ({ chatOnce: async () => 'ok' }));
const { deliver } = vi.hoisted(() => ({ deliver: vi.fn(async () => ({ sent: true, channel: 'EMAIL' })) }));
vi.mock('@/lib/ledger', () => ({ recordActionSafe: async () => undefined }));
vi.mock('@/lib/comms/delivery', () => ({ deliver }));

import { listMembers, createMember, deleteMember, slugify } from '@/lib/kill-team';
import { runApprovedEmailBriefing } from '@/lib/briefing/email';
import { sha256 } from '@/lib/briefing/sms';

beforeEach(() => { rows.length = 0; deliver.mockClear(); });

describe('kill team roster', () => {
  it('seeds defaults once, lets the founder add and delete, and never reseeds', async () => {
    expect((await listMembers('u1')).map((m) => m.slug)).toEqual(['peter', 'paul', 'micah', 'nandi', 'scout']);
    const added = await createMember('u1', { name: 'Legal Lena', role: 'Legal review' });
    expect(added).toMatchObject({ ok: true, member: { slug: 'legal-lena' } });
    expect(await createMember('u1', { name: 'Legal Lena', role: 'x' })).toMatchObject({ ok: false, status: 409 });
    expect(await deleteMember('u1', 'peter')).toBe(true);
    for (const slug of ['paul', 'micah', 'nandi', 'scout', 'legal-lena']) await deleteMember('u1', slug);
    expect(await listMembers('u1')).toEqual([]);
  });
  it('rejects reserved names and is tenant scoped', async () => {
    expect(await createMember('u1', { name: 'Marcus', role: 'x' })).toMatchObject({ ok: false, status: 400 });
    await listMembers('u1');
    expect(await deleteMember('u2', 'peter')).toBe(false);
    expect(slugify('Mei-Ling  Tan!')).toBe('mei-ling-tan');
  });
});

describe('email briefing send', () => {
  const text = 'hello';
  it('refuses when the stored text no longer matches its hash', async () => {
    const r = await runApprovedEmailBriefing('u1', { to: 'a@b.co', text, textHash: 'bad' });
    expect(r.success).toBe(false);
    expect(deliver).not.toHaveBeenCalled();
  });
  it('refuses when the account email changed since approval', async () => {
    const r = await runApprovedEmailBriefing('u1', { to: 'old@b.co', text, textHash: sha256(text) });
    expect(r.success).toBe(false);
    expect(deliver).not.toHaveBeenCalled();
  });
  it('sends to the own address when the hash and address match', async () => {
    const r = await runApprovedEmailBriefing('u1', { to: 'a@b.co', text, textHash: sha256(text) });
    expect(r.success).toBe(true);
    expect(deliver).toHaveBeenCalledOnce();
  });
});
