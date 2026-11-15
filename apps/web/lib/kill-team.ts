/**
 * Founder-managed Kill Team roster and chat. A member row is only a name, role and brief: it grants no permission and
 * runs no tools. Chat goes through the model router with no tools, no memory write and nothing stored.
 */
import { prisma } from '@/lib/db';
import { chatOnce, type ChatMessage } from '@/lib/model-router';

export const DEFAULT_MEMBERS = [
  { slug: 'peter', name: 'Peter', role: 'Forensics & reverse engineering', handoff: 'Verified evidence and capability map' },
  { slug: 'paul', name: 'Paul', role: 'Clean-room reconstruction', handoff: 'Production implementation and tests' },
  { slug: 'micah', name: 'Micah', role: 'Product audit & strategy', handoff: 'User value, risk, and product decisions' },
  { slug: 'nandi', name: 'Nandi', role: 'Growth, marketing & revenue', handoff: 'Distribution and monetisation opportunities' },
  { slug: 'scout', name: 'Michael Carrick', role: 'Market research & opportunity scouting', handoff: 'Sources, signals, and opportunity leads' },
] as const;

const SEED_MARKER = '__seeded__';
export const RESERVED_SLUGS = new Set(['whink', 'mamba', 'marcus', 'agents', 'all', SEED_MARKER]);
export const MAX_MEMBERS = 24;

export function slugify(name: string): string {
  return name.toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 30);
}

export interface Member { slug: string; name: string; role: string; handoff: string; brief: string }

export async function listMembers(userId: string): Promise<Member[]> {
  const rows = await prisma.killTeamMember.findMany({ where: { userId }, orderBy: { createdAt: 'asc' } });
  if (rows.length === 0) {
    // First visit only: the sentinel row stops deleted defaults from coming back.
    await prisma.killTeamMember.createMany({
      data: [
        ...DEFAULT_MEMBERS.map((m) => ({ userId, ...m, brief: '' })),
        { userId, slug: SEED_MARKER, name: SEED_MARKER, role: '', handoff: '', brief: '' },
      ],
      skipDuplicates: true,
    });
    return listMembers(userId);
  }
  return rows.filter((r) => r.slug !== SEED_MARKER).map(({ slug, name, role, handoff, brief }) => ({ slug, name, role, handoff, brief }));
}

export type CreateResult = { ok: true; member: Member } | { ok: false; status: 400 | 409; error: string };

export async function createMember(userId: string, input: { name: string; role: string; handoff?: string; brief?: string }): Promise<CreateResult> {
  const name = input.name.trim().slice(0, 60);
  const role = input.role.trim().slice(0, 120);
  const slug = slugify(name);
  if (!name || !role || slug.length < 2 || RESERVED_SLUGS.has(slug)) return { ok: false, status: 400, error: 'Give a name and role (the name cannot be WHINK, MAMBA, Marcus or All).' };
  await listMembers(userId); // make sure defaults were seeded before counting
  if ((await prisma.killTeamMember.count({ where: { userId, slug: { not: SEED_MARKER } } })) >= MAX_MEMBERS) return { ok: false, status: 400, error: `The team is limited to ${MAX_MEMBERS} members.` };
  const handoff = (input.handoff ?? '').trim().slice(0, 160);
  const brief = (input.brief ?? '').trim().slice(0, 1500);
  try {
    await prisma.killTeamMember.create({ data: { userId, slug, name, role, handoff, brief } });
  } catch {
    return { ok: false, status: 409, error: 'A member with that name already exists.' };
  }
  return { ok: true, member: { slug, name, role, handoff, brief } };
}

export async function deleteMember(userId: string, slug: string): Promise<boolean> {
  if (RESERVED_SLUGS.has(slug)) return false;
  const r = await prisma.killTeamMember.deleteMany({ where: { userId, slug } });
  return r.count > 0;
}

function systemPrompt(m: Member, collective: boolean): string {
  return [
    `You are ${m.name}, ${m.role}, a specialist on the founder's Kill Team.`,
    m.brief ? `Your brief: ${m.brief}` : '',
    'Speak plainly and briefly, in first person, as yourself. Give your specialist view only.',
    collective ? 'Other team members answer the same message separately, so do not speak for them.' : '',
    'You cannot run tools, send anything, spend money or change anything from this chat. Do not claim you did. If asked to act, say what you would propose and that the founder must approve it.',
  ].filter(Boolean).join('\n');
}

export async function askMember(m: Member, message: string, collective: boolean): Promise<string> {
  const messages: ChatMessage[] = [{ role: 'system', content: systemPrompt(m, collective) }, { role: 'user', content: message }];
  return (await chatOnce({ messages, maxTokens: collective ? 300 : 600, temperature: 0.4 })).trim();
}
