import { z } from 'zod';

export const CR_STATUSES = ['DRAFT', 'REFINED', 'AWAITING_APPROVAL', 'SENT', 'IN_PROGRESS', 'PR_OPENED', 'MERGED', 'REJECTED', 'FAILED'] as const;
export type CrStatus = (typeof CR_STATUSES)[number];

export const TITLE_MAX = 200;
export const BODY_MAX = 8000;

export const CreateSchema = z.object({
  title: z.string().trim().min(1).max(TITLE_MAX),
  body: z.string().trim().min(1).max(BODY_MAX),
}).strict();

export const PatchSchema = z.object({
  title: z.string().trim().min(1).max(TITLE_MAX).optional(),
  body: z.string().trim().min(1).max(BODY_MAX).optional(),
}).strict().refine((v) => Object.keys(v).length > 0, 'nothing to update');

/** The strict shape the model must return when refining. Anything else is rejected. */
export const SpecSchema = z.object({
  summary: z.string().trim().min(1).max(1000),
  acceptanceCriteria: z.array(z.string().trim().min(1).max(500)).min(1).max(20),
  filesLikelyTouched: z.array(z.string().trim().min(1).max(300)).max(30),
  risks: z.array(z.string().trim().min(1).max(500)).max(20),
  touchesSecurityOrMoney: z.boolean(),
}).strict();
export type Spec = z.infer<typeof SpecSchema>;

/** Statuses an owner may set by hand, with the only transitions allowed. */
export const MANUAL_TRANSITIONS: Readonly<Record<string, readonly CrStatus[]>> = {
  SENT: ['IN_PROGRESS', 'REJECTED', 'FAILED'],
  IN_PROGRESS: ['PR_OPENED', 'REJECTED', 'FAILED'],
  PR_OPENED: ['MERGED', 'IN_PROGRESS', 'REJECTED', 'FAILED'],
};

export const StatusSchema = z.object({
  status: z.enum(['IN_PROGRESS', 'PR_OPENED', 'MERGED', 'REJECTED', 'FAILED']),
}).strict();
