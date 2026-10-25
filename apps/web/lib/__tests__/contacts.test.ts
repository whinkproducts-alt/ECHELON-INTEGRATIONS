import { describe, it, expect, vi, beforeEach } from 'vitest';
import { db, resetDb } from './helpers/mock-db';

vi.mock('@/lib/db', () => ({ prisma: db }));
const recordActionSafe = vi.fn().mockResolvedValue({ id: 'l1' });
vi.mock('@/lib/ledger', () => ({ recordActionSafe: (e: unknown) => recordActionSafe(e), recordAction: vi.fn() }));
const createApproval = vi.fn();
vi.mock('@/lib/approvals', () => ({ createApproval: (i: unknown) => createApproval(i) }));

import { parseVCard, toE164, VCardError, VCARD_MAX_BYTES } from '../contacts/vcard';
import { createContact, deleteContact, importVCard, listContacts, updateContact, getContact, ContactInputSchema, ContactPatchSchema } from '../contacts/service';
import { requestCall, requestMessage, resolveDestination } from '../contacts/comms';
import { sendToContact, placeCall } from '../comms/delivery';

const VCF3 = [
  'BEGIN:VCARD', 'VERSION:3.0', 'FN:Jane Doe', 'N:Doe;Jane;;;', 'ORG:Acme\\, Inc.;Sales', 'EMAIL;TYPE=INTERNET:Jane@Example.com',
  'TEL;TYPE=CELL:(403) 555-0123', 'NOTE:Line one\\nLine two', 'CATEGORIES:VIP,Calgary', 'PHOTO;ENCODING=b;TYPE=JPEG:/9j/4AAQ', ' SkZJRgABAQ==', 'END:VCARD',
  'BEGIN:VCARD', 'VERSION:4.0', 'FN:Bob Lee', 'item1.EMAIL:bob@example.com', 'TEL;VALUE=uri:tel:+44 20 7946 0958', 'END:VCARD', '',
].join('\r\n');

describe('vCard parser', () => {
  it('parses 3.0 and 4.0, folds lines, normalises phone and email', () => {
    const [jane, bob] = parseVCard(VCF3);
    expect(jane).toEqual({ name: 'Jane Doe', email: 'jane@example.com', phone: '+14035550123', company: 'Acme, Inc.', notes: 'Line one\nLine two', tags: ['VIP', 'Calgary'] });
    expect(bob).toMatchObject({ name: 'Bob Lee', email: 'bob@example.com', phone: '+442079460958' });
  });
  it('E.164 rules', () => {
    expect(toE164('403-555-0123')).toBe('+14035550123');
    expect(toE164('1 (403) 555 0123')).toBe('+14035550123');
    expect(toE164('12345')).toBeNull();
    expect(toE164('+0123456789')).toBeNull();
  });
  it('content check, size cap, binary rejection', () => {
    expect(() => parseVCard('hello world')).toThrow(VCardError);
    expect(() => parseVCard('')).toThrow(VCardError);
    expect(() => parseVCard(new Uint8Array(VCARD_MAX_BYTES + 1))).toThrow('File too large');
    expect(() => parseVCard(new Uint8Array([0x42, 0x45, 0x47, 0x49, 0x4e, 0x3a, 0]))).toThrow(VCardError);
  });
  it('skips cards with no name and ignores URL/PHOTO fetch fields', () => {
    expect(parseVCard('BEGIN:VCARD\nTEL:+14035550123\nEND:VCARD\n')).toEqual([]);
    expect(parseVCard('BEGIN:VCARD\nFN:A\nURL:http://evil\nEND:VCARD\n')[0]).toEqual({ name: 'A', tags: [] });
  });
});

beforeEach(() => { resetDb(); recordActionSafe.mockClear(); createApproval.mockReset(); });

const crow = (o: Record<string, unknown> = {}) => ({ id: 'c1', userId: 'uA', name: 'Jane', email: 'j@x.com', phone: '+14035550123', company: null, tags: [], source: 'manual', notes: null, createdAt: new Date(), ...o });

describe('contacts CRUD and tenant isolation', () => {
  it('list scoped by userId', async () => {
    db.contact.findMany.mockResolvedValue([]);
    await listContacts('uA');
    expect(db.contact.findMany.mock.calls[0][0].where).toEqual({ userId: 'uA' });
  });
  it('create forces userId from the session and ledgers', async () => {
    db.contact.create.mockResolvedValue(crow());
    const r = await createContact('uA', ContactInputSchema.parse({ name: 'Jane', phone: '+14035550123' }));
    expect(r.ok).toBe(true);
    expect(db.contact.create.mock.calls[0][0].data).toMatchObject({ userId: 'uA', source: 'manual' });
    expect(recordActionSafe).toHaveBeenCalledWith(expect.objectContaining({ action: 'contact_created', userId: 'uA' }));
  });
  it("another user's id: update and delete return null, nothing written", async () => {
    db.contact.findFirst.mockResolvedValue(null);
    expect(await updateContact('uB', 'c1', { name: 'x' })).toBeNull();
    expect(await deleteContact('uB', 'c1')).toBeNull();
    expect(db.contact.findFirst.mock.calls[0][0].where).toEqual({ id: 'c1', userId: 'uB' });
    expect(db.contact.updateMany).not.toHaveBeenCalled();
    expect(db.contact.deleteMany).not.toHaveBeenCalled();
    expect(recordActionSafe).not.toHaveBeenCalled();
  });
  it('update and delete are scoped on the write too', async () => {
    db.contact.findFirst.mockResolvedValue(crow());
    db.contact.updateMany.mockResolvedValue({ count: 1 });
    db.contact.deleteMany.mockResolvedValue({ count: 1 });
    await updateContact('uA', 'c1', { name: 'New' });
    await deleteContact('uA', 'c1');
    expect(db.contact.updateMany.mock.calls[0][0].where).toEqual({ id: 'c1', userId: 'uA' });
    expect(db.contact.deleteMany.mock.calls[0][0].where).toEqual({ id: 'c1', userId: 'uA' });
    expect(await getContact('uA', 'c1')).toBeTruthy();
  });
  it('validation: phone must be E.164, unknown fields refused, empty patch refused', () => {
    expect(ContactInputSchema.safeParse({ name: 'x', phone: '4035550123' }).success).toBe(false);
    expect(ContactInputSchema.safeParse({ name: 'x', userId: 'other' }).success).toBe(false);
    expect(ContactPatchSchema.safeParse({}).success).toBe(false);
  });
});

describe('vCard import', () => {
  it('dedupes by phone/email against the DB and inside the file, scoped by userId', async () => {
    db.contact.findMany.mockResolvedValue([{ phone: '+14035550123', email: null }]);
    db.contact.createMany.mockResolvedValue({ count: 1 });
    const r = await importVCard('uA', new TextEncoder().encode(VCF3));
    expect(r.ok && r.value).toEqual({ parsed: 2, imported: 1, duplicates: 1 });
    expect(db.contact.findMany.mock.calls[0][0].where.userId).toBe('uA');
    const created = db.contact.createMany.mock.calls[0][0].data;
    expect(created).toHaveLength(1);
    expect(created[0]).toMatchObject({ userId: 'uA', name: 'Bob Lee', source: 'vcard' });
    expect(recordActionSafe).toHaveBeenCalledWith(expect.objectContaining({ action: 'contacts_imported' }));
  });
  it('a bad file throws before any write or ledger row', async () => {
    await expect(importVCard('uA', new TextEncoder().encode('nope'))).rejects.toBeInstanceOf(VCardError);
    expect(db.contact.createMany).not.toHaveBeenCalled();
  });
});

describe('contact messages and calls create Class C approvals only', () => {
  const approval = { id: 'ap1', expiresAt: 'x' };
  beforeEach(() => { createApproval.mockResolvedValue(approval); db.commsRequest.create.mockResolvedValue({ id: 'cr1' }); });

  it('message: approval carries exact content, recipient and CASL flag; nothing is sent', async () => {
    db.contact.findFirst.mockResolvedValue(crow());
    db.commsRequest.count.mockResolvedValue(0);
    const r = await requestMessage('uA', 'c1', 'SMS', 'Hello Jane');
    expect(r).toMatchObject({ ok: true, casl: 'review_consent', commsRequestId: 'cr1' });
    const input = createApproval.mock.calls[0][0];
    expect(input).toMatchObject({ userId: 'uA', kind: 'tool_call', tool: 'contact_message' });
    expect(input.params).toEqual({ contactId: 'c1', contactName: 'Jane', channel: 'SMS', to: '+14035550123', body: 'Hello Jane', casl: 'review_consent' });
    expect(db.contact.findFirst.mock.calls[0][0].where).toEqual({ id: 'c1', userId: 'uA' });
    expect(db.commsRequest.create.mock.calls[0][0].data).toMatchObject({ userId: 'uA', contactId: 'c1', approvalId: 'ap1', kind: 'message' });
  });
  it('prior relationship record: not flagged', async () => {
    db.contact.findFirst.mockResolvedValue(crow());
    db.commsRequest.count.mockResolvedValue(2);
    expect((await requestMessage('uA', 'c1', 'EMAIL', 'Hi') as { casl: string }).casl).toBe('prior_relationship');
    expect(db.commsRequest.count.mock.calls[0][0].where).toEqual({ userId: 'uA', contactId: 'c1' });
  });
  it("another user's contact: 404, no approval created", async () => {
    db.contact.findFirst.mockResolvedValue(null);
    expect(await requestMessage('uB', 'c1', 'SMS', 'x')).toEqual({ ok: false, status: 404, error: 'Not found' });
    expect(await requestCall('uB', 'c1')).toMatchObject({ ok: false, status: 404 });
    expect(createApproval).not.toHaveBeenCalled();
  });
  it('missing destination for the channel is 422', async () => {
    db.contact.findFirst.mockResolvedValue(crow({ email: null }));
    expect(await requestMessage('uA', 'c1', 'EMAIL', 'x')).toMatchObject({ ok: false, status: 422 });
    expect(createApproval).not.toHaveBeenCalled();
  });
  it('call creates a contact_call approval with the script', async () => {
    db.contact.findFirst.mockResolvedValue(crow());
    db.commsRequest.count.mockResolvedValue(1);
    await requestCall('uA', 'c1', 'Confirm Tuesday');
    expect(createApproval.mock.calls[0][0]).toMatchObject({ tool: 'contact_call', params: { to: '+14035550123', script: 'Confirm Tuesday', channel: 'PHONE_CALL' } });
  });
  it('telegram destination comes from a telegram:<chatId> tag only', () => {
    expect(resolveDestination({ phone: null, email: null, tags: ['vip', 'telegram:12345'] }, 'TELEGRAM')).toBe('12345');
    expect(resolveDestination({ phone: '+1', email: null, tags: ['telegram:abc'] }, 'TELEGRAM')).toBeNull();
  });
});

describe('delivery stays a stub without provider env', () => {
  it('returns not_configured and never throws', async () => {
    for (const k of ['TWILIO_ACCOUNT_SID', 'TWILIO_AUTH_TOKEN', 'SMTP_HOST', 'TELEGRAM_BOT_TOKEN']) delete process.env[k];
    expect(await sendToContact({ userId: 'uA', channel: 'SMS', to: '+14035550123', body: 'x' })).toMatchObject({ sent: false, reason: 'not_configured' });
    expect(await sendToContact({ userId: 'uA', channel: 'EMAIL', to: 'a@b.co', body: 'x' })).toMatchObject({ sent: false, reason: 'not_configured' });
    expect(await placeCall({ userId: 'uA', to: '+14035550123' })).toMatchObject({ sent: false, reason: 'not_configured' });
    await expect(sendToContact({ userId: '', channel: 'SMS', to: 'x', body: 'x' })).rejects.toThrow();
  });
});
