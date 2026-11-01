/**
 * Contracts. A contract is a RECORD: nothing here moves money or sends anything.
 * Every query is scoped by userId; another user's contract or project behaves as not found.
 * Notes are untrusted text: stored and returned as data, never rendered as HTML, wrapped before any model sees them.
 */
import { z } from 'zod';
import { prisma } from '@/lib/db';
import { runGuarded } from '@/lib/guarded-action';
import { isSubsidiaryId } from '@/lib/subsidiaries';

export const CONTRACT_STATUSES = ['DRAFT', 'ACTIVE', 'COMPLETED', 'TERMINATED'] as const;
export type ContractStatus = (typeof CONTRACT_STATUSES)[number];

const subsidiary = z.string().refine(isSubsidiaryId, 'unknown subsidiary');
const amount = z.union([
  z.string().trim().regex(/^\d{1,12}(\.\d{1,2})?$/, 'amount must be a non-negative number with at most 2 decimals'),
  z.number().finite().nonnegative().max(999_999_999_999.99).refine((n) => Math.abs(n * 100 - Math.round(n * 100)) < 1e-6, 'at most 2 decimals').transform((n) => n.toFixed(2)),
]);
const date = z.string().trim().refine((v) => /^\d{4}-\d{2}-\d{2}(T[\d:.]+(Z|[+-]\d{2}:\d{2}))?$/.test(v) && !Number.isNaN(Date.parse(v)), 'ISO date expected').transform((v) => new Date(v));

const Fields = {
  title: z.string().trim().min(1).max(200),
  counterparty: z.string().trim().min(1).max(200),
  subsidiary: subsidiary.nullable(),
  projectId: z.string().trim().min(1).max(64).nullable(),
  valueAmount: amount.nullable(),
  currency: z.string().trim().toUpperCase().regex(/^[A-Z]{3}$/, 'ISO 4217 code expected'),
  status: z.enum(CONTRACT_STATUSES),
  startDate: date.nullable(),
  endDate: date.nullable(),
  renewalDate: date.nullable(),
  notes: z.string().max(5000).nullable(),
};

export const ContractInputSchema = z.object({
  title: Fields.title,
  counterparty: Fields.counterparty,
  subsidiary: Fields.subsidiary.optional(),
  projectId: Fields.projectId.optional(),
  valueAmount: Fields.valueAmount.optional(),
  currency: Fields.currency.default('CAD'),
  status: Fields.status.default('DRAFT'),
  startDate: Fields.startDate.optional(),
  endDate: Fields.endDate.optional(),
  renewalDate: Fields.renewalDate.optional(),
  notes: Fields.notes.optional(),
}).strict().refine((v) => !(v.startDate && v.endDate) || v.endDate >= v.startDate, { message: 'endDate must not be before startDate', path: ['endDate'] });

export const ContractPatchSchema = z.object({
  title: Fields.title.optional(),
  counterparty: Fields.counterparty.optional(),
  subsidiary: Fields.subsidiary.optional(),
  projectId: Fields.projectId.optional(),
  valueAmount: Fields.valueAmount.optional(),
  currency: Fields.currency.optional(),
  status: Fields.status.optional(),
  startDate: Fields.startDate.optional(),
  endDate: Fields.endDate.optional(),
  renewalDate: Fields.renewalDate.optional(),
  notes: Fields.notes.optional(),
}).strict().refine((v) => Object.keys(v).length > 0, 'nothing to update')
  .refine((v) => !(v.startDate && v.endDate) || v.endDate >= v.startDate, { message: 'endDate must not be before startDate', path: ['endDate'] });

export const ListQuerySchema = z.object({
  subsidiary: subsidiary.optional(),
  status: z.enum(CONTRACT_STATUSES).optional(),
  project: z.string().trim().min(1).max(64).optional(),
  cursor: z.string().trim().min(1).max(64).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(25),
}).strict();

interface ContractRow {
  id: string; userId: string; title: string; counterparty: string; subsidiary: string | null; projectId: string | null;
  valueAmount: { toFixed(n: number): string } | null; currency: string; status: string;
  startDate: Date | null; endDate: Date | null; renewalDate: Date | null; notes: string | null; createdAt: Date; updatedAt: Date;
}

export function toView(c: ContractRow) {
  return {
    id: c.id, title: c.title, counterparty: c.counterparty, subsidiary: c.subsidiary, projectId: c.projectId,
    valueAmount: c.valueAmount === null ? null : c.valueAmount.toFixed(2), currency: c.currency, status: c.status,
    startDate: c.startDate?.toISOString() ?? null, endDate: c.endDate?.toISOString() ?? null, renewalDate: c.renewalDate?.toISOString() ?? null,
    notes: c.notes, createdAt: c.createdAt.toISOString(), updatedAt: c.updatedAt.toISOString(),
  };
}

/** True when the project exists and the user owns it or is a member. */
async function canUseProject(userId: string, projectId: string): Promise<boolean> {
  const p = await prisma.project.findFirst({ where: { id: projectId, OR: [{ ownerId: userId }, { members: { some: { userId } } }] }, select: { id: true } });
  return Boolean(p);
}

export async function getContract(userId: string, id: string): Promise<ContractRow | null> {
  if (!userId) throw new Error('contracts: userId is required');
  return (await prisma.contract.findFirst({ where: { id, userId } })) as ContractRow | null;
}

export type ListFilters = z.infer<typeof ListQuerySchema>;
export type ListOutcome = { ok: true; items: ReturnType<typeof toView>[]; nextCursor: string | null } | { ok: false; status: 400 | 404; error: string };

export async function listContracts(userId: string, f: ListFilters): Promise<ListOutcome> {
  if (!userId) throw new Error('contracts: userId is required');
  const where: Record<string, unknown> = { userId };
  if (f.subsidiary) where.subsidiary = f.subsidiary;
  if (f.status) where.status = f.status;
  if (f.project) {
    if (!(await canUseProject(userId, f.project))) return { ok: false, status: 404, error: 'Project not found' };
    where.projectId = f.project;
  }
  if (f.cursor && !(await prisma.contract.findFirst({ where: { id: f.cursor, userId }, select: { id: true } }))) {
    return { ok: false, status: 400, error: 'Invalid cursor' };
  }
  const rows = (await prisma.contract.findMany({
    where,
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    take: f.limit + 1,
    ...(f.cursor ? { cursor: { id: f.cursor }, skip: 1 } : {}),
  })) as ContractRow[];
  const page = rows.slice(0, f.limit);
  return { ok: true, items: page.map(toView), nextCursor: rows.length > f.limit ? page[page.length - 1].id : null };
}

export type WriteOutcome = { kind: 'ok'; value: ReturnType<typeof toView> } | { kind: 'project_not_found' } | { kind: 'bad_dates' };

export async function createContract(userId: string, input: z.infer<typeof ContractInputSchema>) {
  return runGuarded(
    { userId, capability: 'contract_create', permissionClass: 'A', action: 'contract_created', summary: `counterpartyLength=${input.counterparty.length} status=${input.status}` },
    async (): Promise<WriteOutcome> => {
      if (input.projectId && !(await canUseProject(userId, input.projectId))) return { kind: 'project_not_found' };
      const row = await prisma.contract.create({
        data: {
          userId, title: input.title, counterparty: input.counterparty, subsidiary: input.subsidiary ?? null, projectId: input.projectId ?? null,
          valueAmount: input.valueAmount ?? null, currency: input.currency, status: input.status,
          startDate: input.startDate ?? null, endDate: input.endDate ?? null, renewalDate: input.renewalDate ?? null, notes: input.notes ?? null,
        },
      });
      return { kind: 'ok', value: toView(row as ContractRow) };
    },
  );
}

/** Returns null when the contract is not this user's. */
export async function updateContract(userId: string, id: string, patch: z.infer<typeof ContractPatchSchema>) {
  const existing = await getContract(userId, id);
  if (!existing) return null;
  return runGuarded(
    { userId, capability: 'contract_update', permissionClass: 'A', action: 'contract_updated', summary: `contractId=${id} fields=${Object.keys(patch).join(',')}` },
    async (): Promise<WriteOutcome> => {
      if (patch.projectId && !(await canUseProject(userId, patch.projectId))) return { kind: 'project_not_found' };
      const s = patch.startDate === undefined ? existing.startDate : patch.startDate;
      const e = patch.endDate === undefined ? existing.endDate : patch.endDate;
      if (s && e && e < s) return { kind: 'bad_dates' };
      const res = await prisma.contract.updateMany({ where: { id, userId }, data: patch });
      if (res.count !== 1) throw new Error('contract vanished');
      const row = await getContract(userId, id);
      if (!row) throw new Error('contract vanished');
      return { kind: 'ok', value: toView(row) };
    },
  );
}

export async function deleteContract(userId: string, id: string) {
  if (!(await getContract(userId, id))) return null;
  return runGuarded(
    { userId, capability: 'contract_delete', permissionClass: 'A', action: 'contract_deleted', summary: `contractId=${id}` },
    async () => ({ id, deleted: (await prisma.contract.deleteMany({ where: { id, userId } })).count === 1 }),
  );
}
