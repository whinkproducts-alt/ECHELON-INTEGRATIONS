/**
 * Contacts. Every query is scoped by userId; another user's id behaves as not found.
 * Notes and names may come from imported files: they are data, shown as data, never trusted.
 */
import { z } from 'zod';
import { prisma } from '@/lib/db';
import { runGuarded } from '@/lib/guarded-action';
import { parseVCard, type ParsedContact } from '@/lib/contacts/vcard';

const E164 = /^\+[1-9]\d{7,14}$/;

export const ContactInputSchema = z.object({
  name: z.string().trim().min(1).max(200),
  email: z.string().trim().toLowerCase().email().max(254).nullish(),
  phone: z.string().trim().regex(E164, 'phone must be E.164, for example +14035550123').nullish(),
  company: z.string().trim().max(200).nullish(),
  tags: z.array(z.string().trim().min(1).max(40)).max(20).default([]),
  notes: z.string().max(2000).nullish(),
}).strict();

export const ContactPatchSchema = ContactInputSchema.partial().strict().refine((v) => Object.keys(v).length > 0, 'nothing to update');

export type ContactInput = z.infer<typeof ContactInputSchema>;

interface ContactRow {
  id: string; userId: string; name: string; email: string | null; phone: string | null; company: string | null;
  tags: string[]; source: string; notes: string | null; createdAt: Date;
}

export function toContactView(c: ContactRow) {
  return {
    id: c.id, name: c.name, email: c.email, phone: c.phone, company: c.company, tags: c.tags,
    source: c.source, notes: c.notes, createdAt: c.createdAt.toISOString(),
  };
}

export async function listContacts(userId: string, take = 200) {
  if (!userId) throw new Error('contacts: userId is required');
  const rows = await prisma.contact.findMany({ where: { userId }, orderBy: { name: 'asc' }, take: Math.min(Math.max(1, take), 500) });
  return rows.map(toContactView);
}

export async function getContact(userId: string, id: string) {
  if (!userId) throw new Error('contacts: userId is required');
  return prisma.contact.findFirst({ where: { id, userId } });
}

export async function createContact(userId: string, input: ContactInput) {
  return runGuarded(
    { userId, capability: 'contact_create', permissionClass: 'A', action: 'contact_created', summary: 'contact created' },
    async () => toContactView(await prisma.contact.create({
      data: { userId, name: input.name, email: input.email ?? null, phone: input.phone ?? null, company: input.company ?? null, tags: input.tags, notes: input.notes ?? null, source: 'manual' },
    })),
  );
}

/** Returns null when the contact is not this user's. */
export async function updateContact(userId: string, id: string, patch: z.infer<typeof ContactPatchSchema>) {
  if (!(await getContact(userId, id))) return null;
  return runGuarded(
    { userId, capability: 'contact_update', permissionClass: 'A', action: 'contact_updated', summary: `contactId=${id} fields=${Object.keys(patch).join(',')}` },
    async () => {
      const res = await prisma.contact.updateMany({ where: { id, userId }, data: patch });
      if (res.count !== 1) throw new Error('contact vanished');
      const row = await getContact(userId, id);
      if (!row) throw new Error('contact vanished');
      return toContactView(row);
    },
  );
}

export async function deleteContact(userId: string, id: string) {
  if (!(await getContact(userId, id))) return null;
  return runGuarded(
    { userId, capability: 'contact_delete', permissionClass: 'A', action: 'contact_deleted', summary: `contactId=${id}` },
    async () => {
      const res = await prisma.contact.deleteMany({ where: { id, userId } });
      return { id, deleted: res.count === 1 };
    },
  );
}

/** Import parsed vCards. Dedupe by phone or email, against existing rows and inside the file. */
export async function importVCard(userId: string, bytes: Uint8Array) {
  if (!userId) throw new Error('contacts: userId is required');
  const parsed = parseVCard(bytes); // throws VCardError on a bad file, before any permission work
  return runGuarded(
    { userId, capability: 'contact_import', permissionClass: 'A', action: 'contacts_imported', summary: `cards=${parsed.length}` },
    async () => {
      const phones = parsed.map((p) => p.phone).filter((x): x is string => Boolean(x));
      const emails = parsed.map((p) => p.email).filter((x): x is string => Boolean(x));
      const existing = phones.length || emails.length
        ? await prisma.contact.findMany({
            where: { userId, OR: [{ phone: { in: phones } }, { email: { in: emails } }] },
            select: { phone: true, email: true },
          })
        : [];
      const seenPhones = new Set(existing.map((e) => e.phone).filter(Boolean) as string[]);
      const seenEmails = new Set(existing.map((e) => e.email).filter(Boolean) as string[]);
      const fresh: ParsedContact[] = [];
      let duplicates = 0;
      for (const p of parsed) {
        if ((p.phone && seenPhones.has(p.phone)) || (p.email && seenEmails.has(p.email))) { duplicates++; continue; }
        if (p.phone) seenPhones.add(p.phone);
        if (p.email) seenEmails.add(p.email);
        fresh.push(p);
      }
      if (fresh.length) {
        await prisma.contact.createMany({
          data: fresh.map((p) => ({ userId, name: p.name, email: p.email ?? null, phone: p.phone ?? null, company: p.company ?? null, tags: p.tags, notes: p.notes ?? null, source: 'vcard' })),
        });
      }
      return { parsed: parsed.length, imported: fresh.length, duplicates };
    },
  );
}
