import { z } from 'zod';
import raw from '@/config/subsidiaries.json';

export const SUBSIDIARY_IDS = ['consult', 'real-estate', 'trades', 'apps', 'frontliners'] as const;
export type SubsidiaryId = (typeof SUBSIDIARY_IDS)[number];

const SubsidiarySchema = z.object({
  id: z.enum(SUBSIDIARY_IDS),
  name: z.string().min(1),
  logo: z.string().startsWith('/'),
  intro: z.string().min(1),
  about: z.string().min(1),
  services: z.array(z.object({ title: z.string().min(1), description: z.string().min(1) })),
  location: z.string().nullable(),
  notice: z.string().nullable(),
  directors: z.array(
    z.object({
      name: z.string().min(1),
      title: z.string().min(1),
      imageUrl: z.string().startsWith('/').nullable(),
      boardId: z.string().nullable(),
    }),
  ),
});

export const SubsidiariesConfigSchema = z.object({ subsidiaries: z.array(SubsidiarySchema) });
export type Subsidiary = z.infer<typeof SubsidiarySchema>;

const parsed: Subsidiary[] = SubsidiariesConfigSchema.parse(raw).subsidiaries;

export function getSubsidiaries(): Subsidiary[] {
  return parsed;
}

export function isSubsidiaryId(id: unknown): id is SubsidiaryId {
  return typeof id === 'string' && (SUBSIDIARY_IDS as readonly string[]).includes(id);
}

export function getSubsidiary(id: string): Subsidiary | null {
  return parsed.find((s) => s.id === id) ?? null;
}
