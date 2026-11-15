/** R3 sender pairing against a real isolated Postgres (opt in with M1_EXECUTION_DATABASE_URL). */
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
vi.unmock('@prisma/client');
import { prisma } from '@/lib/db';
import { approvePairing, isPaired, MAX_PENDING_PER_CHANNEL, PAIRING_TTL_MS, requestPairing, revokePairing } from '@/lib/pairing';

const enabled = !!process.env.M1_EXECUTION_DATABASE_URL;
let a = '', b = '';

describe.skipIf(!enabled)('sender pairing real database', () => {
  beforeAll(async () => {
    if (process.env.M1_EXECUTION_DATABASE_URL !== process.env.DATABASE_URL || !/test/.test(new URL(process.env.DATABASE_URL!).pathname)) throw new Error('Isolated test database required');
    a = (await prisma.user.create({ data: { email: `pair-a-${randomUUID()}@example.test` } })).id;
    b = (await prisma.user.create({ data: { email: `pair-b-${randomUUID()}@example.test` } })).id;
  });
  afterAll(async () => {
    await prisma.action.deleteMany({ where: { userId: { in: [a, b] } } });
    await prisma.user.deleteMany({ where: { id: { in: [a, b] } } });
    await prisma.$disconnect();
  });

  it('keeps an unknown sender silent until the owner approves the code, once only', async () => {
    const r = await requestPairing(a, 'whatsapp', '+15550001');
    expect(r.status).toBe('pending');
    expect(await isPaired(a, 'whatsapp', '+15550001')).toBe(false);
    expect((await approvePairing(a, 'whatsapp', '000000x')).ok).toBe(false);
    expect(await approvePairing(a, 'whatsapp', r.code!)).toEqual({ ok: true, senderId: '+15550001' });
    expect(await isPaired(a, 'whatsapp', '+15550001')).toBe(true);
    expect((await approvePairing(a, 'whatsapp', r.code!)).ok).toBe(false); // single use
    expect((await requestPairing(a, 'whatsapp', '+15550001')).status).toBe('paired');
  });

  it('refuses an expired code, another account, and another channel', async () => {
    const r = await requestPairing(a, 'telegram', 'u1');
    const later = new Date(Date.now() + PAIRING_TTL_MS + 1000);
    expect((await approvePairing(a, 'telegram', r.code!, later)).ok).toBe(false);
    const r2 = await requestPairing(a, 'telegram', 'u2');
    expect((await approvePairing(b, 'telegram', r2.code!)).ok).toBe(false);
    expect((await approvePairing(a, 'discord', r2.code!)).ok).toBe(false);
  });

  it('caps pending requests, and a revoked sender stays blocked', async () => {
    for (let i = 0; i < MAX_PENDING_PER_CHANNEL; i++) expect((await requestPairing(a, 'slack', `s${i}`)).status).toBe('pending');
    expect((await requestPairing(a, 'slack', 'extra')).status).toBe('limit');
    const r = await requestPairing(b, 'slack', 'x');
    await approvePairing(b, 'slack', r.code!);
    expect(await revokePairing(b, 'slack', 'x')).toBe(true);
    expect(await isPaired(b, 'slack', 'x')).toBe(false);
    expect((await requestPairing(b, 'slack', 'x')).status).toBe('limit');
  });
});
