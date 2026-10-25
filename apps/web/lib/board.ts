/**
 * Board of Directors roster. Data lives in config/board.json (written by scripts/import-board.ts
 * from Victor's own folder). Nothing here invents members. The roster is tenant-level
 * configuration, not per-user data; board meetings (per user) are in the BoardMeeting table.
 */
import { z } from 'zod';
import boardConfig from '@/config/board.json';
import { STAFF_EMAIL_RE } from '@/lib/staff-directory';

export const BoardMemberSchema = z.object({
  id: z.string().regex(/^[a-z0-9]+(-[a-z0-9]+)*$/),
  /** Display name exactly as Victor gave it, for example "Dr Tinaye". */
  name: z.string().min(1).max(120),
  firstName: z.string().min(1).max(60).nullable().default(null),
  /** Null until Victor supplies it. Never guessed. */
  lastName: z.string().min(1).max(60).nullable().default(null),
  /** For example 'Dr' or 'Barrister'. Separate from the name fields. */
  honorific: z.string().min(1).max(30).nullable().default(null),
  /** Null until the surname is known: firstname.lastname@whinkgroup.com needs one. */
  email: z.string().regex(STAFF_EMAIL_RE, 'email must be firstname.lastname@whinkgroup.com').nullable(),
  seat: z.string().min(1).max(120).nullable(),
  /** True while details are missing, so the UI shows "details pending". */
  needsDetails: z.boolean().default(false),
  bio: z.string().max(2000),
  /** Same-origin path under /board/ only. No remote URLs, so img-src stays 'self'. */
  imageUrl: z.string().regex(/^\/board\/[a-z0-9-]+\.(jpg|png|webp)$/).nullable(),
  joined: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable(),
  committees: z.array(z.string().min(1).max(80)).max(20),
});

export const BoardFileSchema = z.object({
  members: z.array(BoardMemberSchema),
}).passthrough().superRefine((v, ctx) => {
  const ids = new Set<string>();
  const emails = new Set<string>();
  for (const m of v.members) {
    if (ids.has(m.id)) ctx.addIssue({ code: 'custom', message: `duplicate id ${m.id}` });
    if (m.email && emails.has(m.email)) ctx.addIssue({ code: 'custom', message: `duplicate email ${m.email}` });
    ids.add(m.id);
    if (m.email) emails.add(m.email);
  }
});

export type BoardMember = z.output<typeof BoardMemberSchema>;

export function parseBoard(raw: unknown): BoardMember[] {
  return BoardFileSchema.parse(raw).members;
}

export function getBoardMembers(): BoardMember[] {
  return parseBoard(boardConfig);
}
