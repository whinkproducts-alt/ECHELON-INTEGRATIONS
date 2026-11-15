/** R15 against a real isolated Postgres: a raise waits for approval and changes nothing; a lowering applies at once. */
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
vi.unmock('@prisma/client');
import { prisma } from '@/lib/db';
import { DEFAULT_ENVELOPE, getEnvelope, requestEnvelopeChange } from '@/lib/spend-envelope';

const enabled = !!process.env.M1_EXECUTION_DATABASE_URL;
let u = '';
const on = { ...DEFAULT_ENVELOPE, enabled: true };

describe.skipIf(!enabled)('spend envelope real database', () => {
  beforeAll(async () => {
    if (process.env.M1_EXECUTION_DATABASE_URL !== process.env.DATABASE_URL || !/test/.test(new URL(process.env.DATABASE_URL!).pathname)) throw new Error('Isolated test database required');
    u = (await prisma.user.create({ data: { email: `env-${randomUUID()}@example.test` } })).id;
  });
  afterAll(async () => {
    await prisma.action.deleteMany({ where: { userId: u } });
    await prisma.approvalRequest.deleteMany({ where: { userId: u } });
    await prisma.user.deleteMany({ where: { id: u } });
    await prisma.$disconnect();
  });

  it('switching on waits for approval of the exact figures and changes nothing yet', async () => {
    const r = await requestEnvelopeChange(u, on);
    expect(r.applied).toBe(false);
    expect((await getEnvelope(u)).enabled).toBe(false);
    const row = await prisma.approvalRequest.findFirst({ where: { userId: u, kind: 'spend_envelope' } });
    expect(row?.status).toBe('PENDING');
    expect(row?.params).toMatchObject({ enabled: true, dailyCadMicros: 1_000_000, monthlyCadMicros: 20_000_000 });
  });

  it('lowering applies at once and is ledgered', async () => {
    await prisma.spendEnvelope.upsert({ where: { userId: u }, create: { userId: u, ...on }, update: on });
    const r = await requestEnvelopeChange(u, { ...on, dailyCadMicros: 500_000 });
    expect(r.applied).toBe(true);
    expect((await getEnvelope(u)).dailyCadMicros).toBe(500_000);
    expect(await prisma.action.count({ where: { userId: u, action: 'spend_envelope_set' } })).toBe(1);
  });
});
