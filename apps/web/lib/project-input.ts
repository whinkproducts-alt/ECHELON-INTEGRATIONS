import { z } from 'zod';
import { SUBSIDIARY_IDS } from '@/lib/subsidiaries';

/** Statuses already used for projects in code and tests. */
export const PROJECT_STATUSES = ['ACTIVE', 'PAUSED', 'COMPLETED'] as const;

const subsidiary = z.enum(SUBSIDIARY_IDS).nullable();

export const ProjectCreateSchema = z
  .object({
    name: z.string().min(1).max(200),
    goal: z.string().max(5000).nullable().optional(),
    description: z.string().max(5000).nullable().optional(),
    subsidiary: subsidiary.optional(),
  })
  .strict();

export const ProjectUpdateSchema = z
  .object({
    name: z.string().min(1).max(200).optional(),
    goal: z.string().max(5000).nullable().optional(),
    description: z.string().max(5000).nullable().optional(),
    status: z.enum(PROJECT_STATUSES).optional(),
    subsidiary: subsidiary.optional(),
  })
  .strict();

/** Parse a JSON request body; null on invalid JSON. */
export async function parseJson(req: Request): Promise<unknown | null> {
  try {
    return await req.json();
  } catch {
    return null;
  }
}
